// npm test: a throwaway database, migrate, seed, run every command, check the arithmetic. PASS or a failure.
// Nothing is sent: the one live send is answered by a stand-in for Postmark inside this process.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'email-'));
process.env.DATA_DIR = path.join(tmp, 'db');
process.env.OUTPUT_DIR = tmp;
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || '';
delete process.env.POSTMARK_SERVER_TOKEN;
const { getDb, REPO_ROOT } = await import('./lib/db.mjs');
const { migrate } = await import('./migrate.mjs');
const { seed } = await import('./seed.mjs');
const { run, commands, parse, when, cents, consentValue, segmentWhere, render } = await import('./email.mjs');

const db = await getDb();
const covered = new Set();
const call = async (c, o = {}, args = []) => { covered.add(c); return run(db, c, o, args); };
const actor = 'Test marketer';
const n = (v) => Number(v);
const fx = (f) => path.join(REPO_ROOT, 'fixtures', f);
const badTemplate = path.join(REPO_ROOT, 'templates', '_smoke-no-unsubscribe.html');
const cli = (args, expected = 0) => {
  const r = spawnSync(process.execPath, args, { cwd: REPO_ROOT, env: process.env, encoding: 'utf8' });
  assert.equal(r.status, expected, r.stderr || r.stdout);
  return r;
};
const realFetch = globalThis.fetch;

try {
  if (db.mode === 'postgres') {
    const existing = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
    assert.equal(existing.length, 0, 'TEST_DATABASE_URL must be empty and disposable');
  }
  await migrate(db);
  assert.equal((await migrate(db)).ran.length, 0, 'migrate is idempotent');
  await seed(db);
  await seed(db);

  // ---------------------------------------------------------------- reads
  assert.equal((await call('help')).length, commands.length);
  const profiles = await call('profiles');
  assert.equal(profiles.length, 36);
  const band = (e) => profiles.find((p) => p.email === e).band;
  assert.equal(band('aroha.ngata@example.com'), 'champion');
  assert.equal(band('ben.carter@example.com'), 'at risk');
  assert.equal(band('chloe.wu@example.com'), 'lapsed');
  assert.equal(band('liam.patel@example.com'), 'new');
  assert.equal(band('dan.murphy@example.com'), 'never ordered');
  assert.equal(n(profiles.find((p) => p.email === 'chloe.wu@example.com').spend_cents), 5400, 'the AUD order is kept out of NZD customer value');

  const one = await call('profile', { profile: 'finn' });
  assert.equal(one.profile[0].email, 'finn.obrien@example.com');
  assert.deepEqual(one.consent_history.map((c) => c.status), ['subscribed', 'unsubscribed']);
  await assert.rejects(() => call('profile', { profile: 'example.com' }), /Ambiguous/);
  await assert.rejects(() => call('profile', { profile: 'nobody-at-all' }), /No profile/);

  assert.equal((await call('segments')).length, 4);
  assert.equal((await call('campaigns')).length, 5);
  const calendar = await call('calendar');
  assert.deepEqual(calendar.map((c) => c.campaign).sort(), ['Black Friday early access', 'Spring sale', 'Summer blend launch', 'Win back the quiet ones']);

  // Results: cross-check the attribution against a plain recount of messages and orders.
  const results = await call('results');
  const sale = results.find((r) => r.campaign === 'Spring sale');
  assert.equal(n(sale.sent), 35);
  assert.equal(n(sale.bounced), 1);
  assert.equal(n(sale.complained), 1);
  const msgs = await db.query('SELECT m.profile_id, m.clicked_at, m.campaign_id, fs.flow_id FROM messages m LEFT JOIN flow_steps fs ON fs.id=m.flow_step_id WHERE m.clicked_at IS NOT NULL');
  const orders = await db.query("SELECT * FROM orders WHERE NOT refunded AND currency='NZD'");
  const saleId = (await db.query("SELECT id FROM campaigns WHERE name='Spring sale'"))[0].id;
  const cartId = (await db.query("SELECT id FROM flows WHERE name='Abandoned checkout'"))[0].id;
  let expectOrders = 0, expectRevenue = 0, cartOrders = 0, cartRevenue = 0;
  for (const o of orders) {
    const placed = new Date(o.placed_at).getTime();
    const hits = msgs.filter((m) => m.profile_id === o.profile_id && new Date(m.clicked_at).getTime() <= placed && new Date(m.clicked_at).getTime() > placed - 5 * 86400000)
      .sort((a, b) => new Date(b.clicked_at) - new Date(a.clicked_at));
    if (hits[0]?.campaign_id === saleId) { expectOrders++; expectRevenue += n(o.total_cents); }
    if (hits[0]?.flow_id === cartId && placed > Date.now() - 30 * 86400000) { cartOrders++; cartRevenue += n(o.total_cents); }
  }
  assert.ok(expectOrders >= 4, 'every sale clicker who bought is credited');
  assert.equal(n(sale.orders), expectOrders);
  assert.equal(n(sale.revenue_cents), expectRevenue);

  const flows = await call('flows');
  const cart = flows.find((f) => f.flow === 'Abandoned checkout');
  assert.ok(cartOrders >= 1, 'Sophie bought after the reminder');
  assert.equal(n(cart.orders_30d), cartOrders);
  assert.equal(n(cart.revenue_30d_cents), cartRevenue);
  assert.equal(flows.find((f) => f.flow === 'Win-back').active, false);

  const due = await call('flows-due');
  const dueFor = (e, flow) => due.filter((d) => d.email === e && d.flow === flow);
  assert.equal(dueFor('dan.murphy@example.com', 'Abandoned checkout').length, 1, 'Dan left a checkout three hours ago');
  assert.equal(dueFor('ella.singh@example.com', 'Welcome series')[0].step_no, 2, 'Ella is due the second welcome email');
  assert.equal(dueFor('liam.patel@example.com', 'Post-purchase brew guide').length, 0, 'Liam already had the brew guide');
  assert.equal(dueFor('aroha.ngata@example.com', 'Post-purchase brew guide').length, 1, 'one brew guide, however many orders');
  assert.equal(due.filter((d) => d.email === 'jack.taylor@example.com').length, 0, 'never email someone who reported spam');

  const rev = await call('revenue');
  assert.equal(rev.length, 6);
  const nzd = (await db.query("SELECT coalesce(sum(total_cents),0) AS s FROM orders WHERE NOT refunded AND currency='NZD' AND date_trunc('month', placed_at)=date_trunc('month', now())"))[0].s;
  assert.equal(n(rev[5].store_cents), n(nzd));
  assert.ok(n(rev[5].campaigns_cents) + n(rev[5].flows_cents) <= n(rev[5].store_cents), 'email never earns more than the store took');

  const bands = await call('rfm');
  assert.equal(bands.reduce((a, b) => a + n(b.people), 0), 36);
  assert.ok((await call('rfm', { band: 'lapsed' })).some((r) => r.email === 'chloe.wu@example.com'));
  await assert.rejects(() => call('rfm', { band: 'vip' }), /band must be/);

  const aud = await call('audience');
  const lapsedSeg = aud.find((a) => a.segment === 'Lapsed and at risk');
  assert.equal(n(lapsedSeg.can_email), (await call('members', { segment: 'lapsed and' })).length);
  assert.ok((await call('members', { segment: 'All subscribers', all: true })).length > n(aud.find((a) => a.segment === 'All subscribers').can_email));

  const health = (await call('list-health'))[0];
  assert.equal(n(health.subscribed), 33);
  assert.equal(n(health.unsubscribed), 3);
  assert.equal(n(health.inferred_consent), 1);
  assert.ok(n(health.complaint_pct_30d) > 0.3);

  const comp = await call('compliance');
  const rules = comp.map((c) => `${c.rule} ${c.ref}`).sort();
  assert.deepEqual(rules, [
    'COMPLAINT-RATE last 30 days', 'CONSENT-INFERRED isla.brown@example.com', 'CONSENT-NO-EVIDENCE hemi.walker@example.com',
    'SENT-AFTER-UNSUB finn.obrien@example.com', 'SENT-AFTER-UNSUB grace.lee@example.com',
    'UNSUB-LATE finn.obrien@example.com', 'UNSUB-LATE grace.lee@example.com',
  ]);
  const att = await call('attention');
  for (const issue of ['campaign not approved', 'campaign has no audience', 'flow switched off', 'flow emails due', 'list health', 'compliance']) assert.ok(att.some((a) => a.issue === issue), `attention shows ${issue}`);
  const week = await call('weekly-review');
  assert.equal(week.next_7_days.length, 3);
  assert.equal(week.last_14_days.length, 1);
  assert.equal((await call('settings')).length, 10);

  // Working days: Friday to Monday is one working day.
  assert.equal((await db.query("SELECT working_days_between('2026-11-13T10:00:00Z','2026-11-16T10:00:00Z') AS d"))[0].d, 1);
  assert.equal((await db.query("SELECT working_days_between('2026-11-09T10:00:00Z','2026-11-16T10:00:00Z') AS d"))[0].d, 5);

  // ---------------------------------------------------------------- writes
  await assert.rejects(() => call('add-profile', { email: 'x@example.com', source: 'Test' }), /--actor/);
  const added = await call('add-profile', { email: 'Rua.Test@Example.com', 'first-name': 'Rua', source: 'Pop-up at the market', actor });
  assert.equal(added.email, 'rua.test@example.com');
  await assert.rejects(() => call('add-profile', { email: 'rua.test@example.com', source: 'x', actor }), /already exists/);
  assert.equal((await call('flows-due')).filter((d) => d.email === 'rua.test@example.com').length, 0, 'no consent, no welcome email');
  await assert.rejects(() => call('consent', { profile: 'rua.test', status: 'subscribed', kind: 'express', source: 'Market', actor }), /--evidence/);
  await call('consent', { profile: 'rua.test', status: 'subscribed', kind: 'express', source: 'Market sign-up tablet', evidence: 'Ticked the email box on the tablet', actor });
  assert.equal((await call('flows-due')).filter((d) => d.email === 'rua.test@example.com' && d.flow === 'Welcome series').length, 1, 'consent given, welcome email due');
  assert.deepEqual((await call('tag', { profile: 'rua.test', add: 'Espresso, market', actor })).tags, ['espresso', 'market']);
  assert.deepEqual((await call('tag', { profile: 'rua.test', remove: 'market', actor })).tags, ['espresso']);
  await call('log-event', { profile: 'rua.test', kind: 'checkout_started', value: '76.00', ref: 'chk-1', actor, at: new Date(Date.now() - 2 * 3600000).toISOString() });
  assert.equal((await call('flows-due')).filter((d) => d.email === 'rua.test@example.com' && d.flow === 'Abandoned checkout').length, 1);
  await call('add-order', { profile: 'rua.test', ref: '#T1', total: '$76.00', actor });
  assert.equal((await call('flows-due')).filter((d) => d.email === 'rua.test@example.com' && d.flow === 'Abandoned checkout').length, 0, 'bought, so no reminder');
  await assert.rejects(() => call('log-event', { profile: 'rua.test', kind: 'phoned', actor }), /--kind/);

  const unsub = await call('unsubscribe', { profile: 'rua.test', via: 'Told us at the market', actor });
  assert.equal(unsub.within_limit, true);
  assert.equal((await call('flows-due')).filter((d) => d.email === 'rua.test@example.com').length, 0, 'unsubscribed means nothing more');
  await assert.rejects(() => call('unsubscribe', { profile: 'rua.test', via: 'x', 'requested-at': '2099-01-01T00:00:00Z', actor }), /future/);
  await assert.rejects(() => call('consent', { profile: 'rua.test', status: 'unsubscribed', kind: 'express', source: 'x', evidence: 'x', actor }), /unsubscribe/);

  // Segments
  const seg = await call('add-segment', { name: 'Espresso buyers', band: 'champion,loyal,at risk', tag: 'espresso', description: 'Espresso drinkers who buy', actor });
  assert.deepEqual(seg.rules.band, ['champion', 'loyal', 'at risk']);
  const expected = (await db.query("SELECT count(*)::int AS n FROM v_rfm WHERE band IN ('champion','loyal','at risk') AND 'espresso' = ANY(tags) AND consent='subscribed' AND NOT coalesce(bounced,false) AND NOT coalesce(complained,false)"))[0].n;
  assert.equal(seg.can_email, expected);
  const widened = await call('set-segment', { segment: 'espresso', 'min-spend': '100', actor });
  assert.equal(widened.rules.min_spend_cents, 10000);
  assert.ok(widened.can_email <= expected);
  assert.equal((await call('set-segment', { segment: 'espresso', replace: true, 'ordered-within-days': '30', actor })).rules.band, undefined);
  await assert.rejects(() => call('add-segment', { name: 'Bad', rules: '{"favourite_colour":"blue"}', actor }), /Unknown segment rule/);
  assert.throws(() => segmentWhere({ band: 'royalty' }), /band must be/);

  // Campaigns: approval, the frequency cap, the outbox and one live send through a stand-in for Postmark.
  fs.writeFileSync(badTemplate, '<p>Hi {{first_name}}</p>');
  await assert.rejects(() => call('add-campaign', { name: 'Bad', subject: 'x', template: '_smoke-no-unsubscribe.html', actor }), /unsubscribe/);
  await assert.rejects(() => call('add-campaign', { name: 'Bad', subject: 'x', template: '../package.json', actor }), /templates/);
  await assert.rejects(() => call('add-campaign', { name: 'Bad', subject: 'x', template: 'nope.html', actor }), /No template/);
  await assert.rejects(() => call('send', { campaign: 'black friday', actor }), /draft/);
  await assert.rejects(() => call('approve', { campaign: 'win back', actor, evidence: 'ok' }), /no segment/);
  await call('set-campaign', { campaign: 'win back', segment: 'Lapsed and at risk', schedule: '2026-12-01T09:00:00+13:00', actor });
  await assert.rejects(() => call('set-campaign', { campaign: 'win back', schedule: '2026-12-01 09:00', actor }), /time zone/);
  const approved = await call('approve', { campaign: 'win back', actor, evidence: 'Read the preview on phone and desktop' });
  assert.equal(approved.status, 'approved');
  assert.equal((await call('set-campaign', { campaign: 'win back', subject: 'We miss you', actor })).status, 'draft', 'changing the words needs a fresh approval');
  await call('approve', { campaign: 'win back', actor, evidence: 'New subject checked' });

  await assert.rejects(() => call('send', { campaign: 'summer blend', actor }), /--now/);
  const engaged = (await call('members', { segment: 'Engaged 90 days' })).length;
  const out = await call('send', { campaign: 'summer blend', actor, now: true });
  assert.equal(out.would_send, engaged);
  assert.equal(out.recorded, 0);
  assert.ok(fs.existsSync(path.join(tmp, out.outbox, 'recipients.csv')));
  const preview = fs.readFileSync(path.join(tmp, out.outbox, 'preview.html'), 'utf8');
  assert.match(preview, /12 Wharf Street, Nelson/);
  assert.doesNotMatch(preview.replace('{{{ pm:unsubscribe }}}', ''), /\{\{/, 'every placeholder filled');
  assert.equal((await call('results')).length, 2, 'the outbox records nothing');

  await assert.rejects(() => call('send', { campaign: 'summer blend', actor, now: true, live: true }), /POSTMARK_SERVER_TOKEN/);
  process.env.POSTMARK_SERVER_TOKEN = 'smoke-test-token';
  const posted = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.postmarkapp.com/email/batch');
    assert.equal(init.headers['X-Postmark-Server-Token'], 'smoke-test-token');
    const body = JSON.parse(init.body);
    posted.push(...body);
    return { ok: true, status: 200, json: async () => body.map((b, i) => (b.To === 'aroha.ngata@example.com' ? { ErrorCode: 406, Message: 'Inactive recipient' } : { ErrorCode: 0, MessageID: `pm-smoke-${posted.length}-${i}`, To: b.To })) };
  };
  const live = await call('send', { campaign: 'summer blend', actor, now: true, live: true });
  assert.equal(live.sent + live.failed.length, engaged);
  assert.equal(live.failed.length, posted.some((p) => p.To === 'aroha.ngata@example.com') ? 1 : 0);
  assert.ok(posted.every((p) => p.MessageStream === 'broadcast' && p.From === 'Harbour Coffee Roasters <hello@harbourcoffee.example>'));
  assert.ok(posted.every((p) => p.HtmlBody.includes('{{{ pm:unsubscribe }}}') && !p.HtmlBody.includes('{{first_name}}')));
  assert.equal((await call('campaigns')).find((c) => c.name === 'Summer blend launch').status, 'sent');
  await assert.rejects(() => call('send', { campaign: 'summer blend', actor, now: true, live: true }), /is sent/);
  await assert.rejects(() => call('set-campaign', { campaign: 'summer blend', subject: 'x', actor }), /has been sent/);

  // Frequency cap: the people who just got the launch are held back from Black Friday.
  await call('approve', { campaign: 'black friday', actor, evidence: 'Checked' });
  const bf = await call('send', { campaign: 'black friday', actor, now: true });
  assert.ok(bf.held_by_frequency_cap > 0);
  assert.equal(bf.would_send + bf.held_by_frequency_cap, (await call('members', { segment: 'Best customers' })).length);

  // Flows: outbox, then live; afterwards nothing is due.
  await assert.rejects(() => call('set-flow', { flow: 'win-back', active: 'maybe', actor, evidence: 'x' }), /on or off/);
  const on = await call('set-flow', { flow: 'win-back', active: 'on', actor, evidence: 'Template rewritten' });
  assert.ok(on.due_now >= 0);
  await call('set-flow', { flow: 'win-back', active: 'off', actor, evidence: 'Not before Christmas' });
  const flowOut = await call('send-flows', { actor });
  assert.ok(flowOut.due > 0 && flowOut.recorded === 0);
  const flowLive = await call('send-flows', { actor, live: true });
  assert.equal(flowLive.sent + flowLive.failed.length, flowOut.due);
  assert.equal((await call('flows-due')).filter((d) => d.email !== 'aroha.ngata@example.com').length, 0);
  assert.equal((await call('send-flows', { actor, flow: 'welcome' })).due, 0);
  const nf = await call('add-flow', { name: 'Birthday', trigger: 'signed_up', description: 'Test flow', actor });
  await assert.rejects(() => call('set-flow', { flow: 'birthday', active: 'on', actor, evidence: 'x' }), /no steps/);
  assert.equal((await call('add-step', { flow: 'birthday', 'delay-hours': '0', subject: 'Hello', template: 'welcome.html', actor })).step_no, 1);
  assert.equal((await call('add-step', { flow: nf.name, 'delay-hours': '48', subject: 'Again', template: 'welcome.html', actor, 'keep-if-ordered': true })).stop_if_ordered, false);
  await assert.rejects(() => call('add-flow', { name: 'Lapsed', trigger: 'lapsed', actor }), /check/i);

  // Results from the provider: opens, clicks, an unsubscribe that is actioned on import, and an unknown message.
  const res = await call('record-results', { file: fx('postmark-events.csv'), actor });
  assert.equal(res.delivered, 1);
  assert.equal(res.clicked, 1);
  assert.equal(res.unsubscribed, 1);
  assert.equal(res.unmatched.length, 1);
  assert.equal((await call('profile', { profile: 'liam.patel' })).consent_history.at(-1).status, 'unsubscribed');

  // Settings
  await assert.rejects(() => call('set', { key: 'sender_email', value: 'not-an-email', actor }), /email address/);
  await assert.rejects(() => call('set', { key: 'unengaged_days', value: 'ninety', actor }), /whole number/);
  await assert.rejects(() => call('set', { key: 'favourite', value: 'x', actor }), /No setting/);
  await call('set', { key: 'unengaged_days', value: '90', actor });
  assert.ok(n((await call('list-health'))[0].sunset_candidates) >= n(health.sunset_candidates));
  await call('set', { key: 'postal_address', value: '', actor });
  await assert.rejects(() => call('send', { campaign: 'black friday', actor, now: true }), /postal_address/);
  assert.ok((await call('compliance')).some((c) => c.rule === 'SENDER-ID'));
  await call('set', { key: 'postal_address', value: '12 Wharf Street, Nelson 7010, New Zealand', actor });

  // Imports: Klaviyo profiles, Shopify orders, a dry run, a changed record, a field map, rollback.
  const before = (await call('profiles')).length;
  const dry = await call('import', { file: fx('klaviyo-profiles.csv'), actor, 'dry-run': true }, ['klaviyo']);
  assert.equal(dry.profiles_created, 4);
  assert.equal((await call('profiles')).length, before, 'a dry run leaves nothing behind');
  const kl = await call('import', { file: fx('klaviyo-profiles.csv'), actor }, ['klaviyo']);
  assert.equal(kl.profiles_created, 4);
  assert.equal(kl.consents_recorded, 3);
  assert.equal(kl.unchanged, 2, 'Aroha already subscribed; Noor never subscribed');
  assert.ok((await call('compliance')).some((c) => c.rule === 'CONSENT-NO-EVIDENCE' && c.ref === 'ivy.nguyen@example.com'), 'a subscription with no timestamp is flagged, not trusted');
  const changed = path.join(tmp, 'changed.csv');
  fs.writeFileSync(changed, 'Email,Email Marketing Consent\nzz.new@example.com,SUBSCRIBED\naroha.ngata@example.com,UNSUBSCRIBED\n');
  await assert.rejects(() => call('import', { file: changed, actor }, ['klaviyo']), /--update/);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM profiles WHERE email='zz.new@example.com'"))[0].n, 0, 'a failed import leaves nothing behind');
  const mapped = path.join(tmp, 'mapped.csv');
  fs.writeFileSync(mapped, 'Email Address,Subscribed,Date Subscribed\nmapped.person@example.com,yes,2026-01-05T10:00:00+13:00\n');
  assert.equal((await call('import', { file: mapped, map: fx('field-map.json'), actor }, ['klaviyo'])).consents_recorded, 1);
  const sh = await call('import', { file: fx('shopify-orders.csv'), actor }, ['shopify']);
  assert.equal(sh.orders_created, 3);
  assert.equal(sh.skipped.length, 1, 'the voided order is skipped');
  assert.equal(sh.profiles_created, 1);
  assert.equal(sh.consents_recorded, 1, 'Accepts Marketing on a new buyer is recorded as consent with its order');
  const o9001 = (await db.query("SELECT * FROM orders WHERE order_ref='#9001'"))[0];
  assert.equal(n(o9001.total_cents), 6400);
  assert.equal(o9001.items, 2);
  assert.equal(o9001.placed_at instanceof Date ? o9001.placed_at.toISOString() : new Date(o9001.placed_at).toISOString(), '2026-08-31T22:22:33.000Z');
  assert.equal((await db.query("SELECT refunded FROM orders WHERE order_ref='#9003'"))[0].refunded, true);
  assert.equal((await call('import', { file: fx('shopify-orders.csv'), actor }, ['shopify'])).unchanged, 3);
  await assert.rejects(() => call('import', { file: fx('shopify-orders.csv'), actor }, ['mailchimp']), /klaviyo .* or shopify/);

  // Helpers
  assert.equal(cents('$1,234.50', 'x'), 123450);
  assert.throws(() => cents('12.345', 'x'), /amount/);
  assert.throws(() => when('2026-11-14T09:00', 'x'), /time zone/);
  assert.equal(when('2026-11-14', 'x'), '2026-11-14T00:00:00Z');
  assert.equal(consentValue('NEVER_SUBSCRIBED'), null);
  assert.throws(() => consentValue('maybe'), /Unknown consent/);
  assert.match(render('<p>{{first_name}}</p>{{unsubscribe_url}}', { first_name: '<b>x</b>', unsubscribe_url: 'U' }), /&lt;b&gt;x&lt;\/b&gt;<\/p>U/);
  assert.throws(() => parse(['profiles', '--oops']), /Unknown flag/);
  assert.throws(() => parse(['profile', '--profile']), /Missing/);

  // Drafts and export
  const dc = await call('draft-campaign', { campaign: 'win back' });
  assert.ok(fs.readFileSync(path.join(tmp, dc.brief), 'utf8').includes('Nothing has been sent'));
  assert.ok(fs.existsSync(path.join(tmp, dc.preview)));
  assert.match(fs.readFileSync(path.join(tmp, (await call('draft-weekly')).draft), 'utf8'), /## Needs attention/);
  const exported = await call('export', { out: path.join(tmp, 'exports') });
  assert.equal(exported.length, 13);
  assert.ok((await call('activity')).length > 20);
  assert.deepEqual(commands.filter((c) => !covered.has(c)), [], 'every command exercised');
  await db.close();

  globalThis.fetch = realFetch;
  delete process.env.POSTMARK_SERVER_TOKEN;
  cli(['scripts/view.mjs']);
  cli(['scripts/docs.mjs']);
  assert.equal(fs.readdirSync(path.join(tmp, 'views')).length, 3);
  assert.ok(fs.readdirSync(path.join(tmp, 'docs-out', 'campaign-report')).length >= 3);
  assert.ok(fs.readdirSync(path.join(tmp, 'docs-out', 'consent-record')).length >= 4);
  const { page, table } = await import('./lib/render.mjs');
  assert.match(page({ title: '<x>', sections: [{ title: 'T', html: table([{ a: '<script>x</script>' }]) }] }), /&lt;script&gt;/);
  assert.equal(JSON.parse(cli(['scripts/email.mjs', 'segments', '--json']).stdout).length, 5);
  assert.match(cli(['scripts/email.mjs', 'profile', '--profile=example'], 1).stderr, /Ambiguous/);
  console.log(`PASS: ${commands.length} CLI commands; segments, attribution, customer bands, flows due, the frequency cap, consent and unsubscribe checks, approvals, outbox and live send (stand-in provider), provider results, Klaviyo and Shopify imports, rollback, drafts, views and documents checked (${process.env.TEST_DATABASE_URL ? 'PostgreSQL' : 'PGlite'}).`);
} finally {
  globalThis.fetch = realFetch;
  try { await db.close(); } catch {}
  fs.rmSync(badTemplate, { force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
}
