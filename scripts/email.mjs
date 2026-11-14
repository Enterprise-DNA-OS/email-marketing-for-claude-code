#!/usr/bin/env node
// The one CLI for Email Marketing for Claude Code. Human tables by default, --json for machines.
//   npm run email -- help
//   npm run email -- weekly-review
//   npm run email -- audience
//   npm run email -- send --campaign="Summer blend" --actor="Mere"            (writes the outbox, sends nothing)
//   npm run email -- send --campaign="Summer blend" --actor="Mere" --live     (sends through Postmark)
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick } from './lib/csv.mjs';
import { table } from './lib/format.mjs';

export const commands = [
  'help', 'profiles', 'profile', 'segments', 'audience', 'members', 'campaigns', 'calendar', 'results', 'revenue',
  'flows', 'flows-due', 'list-health', 'rfm', 'attention', 'compliance', 'activity', 'settings', 'weekly-review',
  'add-profile', 'tag', 'consent', 'unsubscribe', 'add-order', 'log-event', 'add-segment', 'set-segment',
  'add-campaign', 'set-campaign', 'approve', 'send', 'add-flow', 'add-step', 'set-flow', 'send-flows',
  'record-results', 'set', 'import', 'export', 'draft-campaign', 'draft-weekly',
];
const TABLES = ['settings', 'profiles', 'consents', 'unsubscribe_requests', 'orders', 'events', 'segments', 'campaigns', 'flows', 'flow_steps', 'messages', 'activity', 'imports'];
const BANDS = ['champion', 'loyal', 'new', 'at risk', 'lapsed', 'one-off', 'never ordered'];
const TEMPLATES = path.join(REPO_ROOT, 'templates');

// ------------------------------------------------------------ input checks
function need(v, k) { if (v === undefined || v === null || v === true || String(v).trim() === '') throw Error(`Required: --${k}`); return String(v).trim(); }
function int(v, k, min = 0) { const n = Number(need(v, k)); if (!Number.isInteger(n) || n < min) throw Error(`${k} must be a whole number >= ${min}`); return n; }
export function cents(v, k) {
  const s = need(v, k).replace(/[$,\s]/g, '').replace(/^[A-Z]{3}/i, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw Error(`${k} must be an amount like 49.90 (got "${v}")`);
  return Math.round(Number(s) * 100);
}
export function when(v, k) {
  const s = need(v, k);
  // Shopify writes "2026-10-01 10:22:33 +1300"; make it ISO before parsing.
  const iso = s.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}(?::\d{2})?) ?([+-]\d{2}):?(\d{2})$/, '$1T$2$3:$4');
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso + 'T00:00:00Z';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || !/^\d{4}-\d{2}-\d{2}/.test(iso)) throw Error(`${k} must be a date or date-time like 2026-11-14 or 2026-11-14T09:00:00+13:00 (got "${v}")`);
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso)) throw Error(`${k} needs a time zone, like 2026-11-14T09:00:00+13:00 (got "${v}")`);
  return d.toISOString();
}
export function email(v, k = 'email') {
  const s = need(v, k).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) throw Error(`${k} must be an email address (got "${v}")`);
  return s;
}
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

async function tx(db, fn, dry = false) {
  await db.exec('BEGIN');
  try { const r = await fn(); await db.exec(dry ? 'ROLLBACK' : 'COMMIT'); return r; }
  catch (e) { await db.exec('ROLLBACK'); throw e; }
}
async function audit(db, action, ref, actor, before, after, evidence) {
  await db.query('INSERT INTO activity(action,ref,actor,before_data,after_data,evidence) VALUES($1,$2,$3,$4,$5,$6)',
    [action, ref, actor, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, evidence || null]);
}

// ------------------------------------------------------------ matching
async function matchOne(db, kind, ref, sql, label) {
  ref = need(ref, kind);
  const rows = await db.query(sql, [ref.toLowerCase(), '%' + ref.toLowerCase() + '%', ref.toLowerCase() + '%']);
  const exact = rows.filter((r) => r._exact);
  if (exact.length === 1) return exact[0];
  if (rows.length !== 1) throw Error(rows.length ? `Ambiguous ${kind} "${ref}"; use one of:\n${rows.map(label).join('\n')}` : `No ${kind} matches "${ref}"`);
  return rows[0];
}
export const matchProfile = (db, ref) => matchOne(db, 'profile', ref,
  `SELECT *, (lower(email)=$1) AS _exact FROM profiles WHERE lower(email)=$1 OR id::text LIKE $3
     OR lower(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) LIKE $2 OR lower(email) LIKE $2 ORDER BY email`,
  (r) => `${r.email}  ${[r.first_name, r.last_name].filter(Boolean).join(' ')}`);
export const matchSegment = (db, ref) => matchOne(db, 'segment', ref,
  'SELECT *, (lower(name)=$1) AS _exact FROM segments WHERE lower(name) LIKE $2 OR id::text LIKE $3 ORDER BY name', (r) => r.name);
export const matchCampaign = (db, ref) => matchOne(db, 'campaign', ref,
  'SELECT *, (lower(name)=$1) AS _exact FROM campaigns WHERE lower(name) LIKE $2 OR id::text LIKE $3 ORDER BY name', (r) => `${r.name}  (${r.status})`);
export const matchFlow = (db, ref) => matchOne(db, 'flow', ref,
  'SELECT *, (lower(name)=$1) AS _exact FROM flows WHERE lower(name) LIKE $2 OR id::text LIKE $3 ORDER BY name', (r) => r.name);
const strip = (r) => { if (!r) return r; const { _exact, ...rest } = r; return rest; };

// ------------------------------------------------------------ segments
// Rules are plain JSON. Every key is a filter on v_rfm; all of them must match.
const RULES = {
  band: (v) => { const list = [].concat(v).map((b) => String(b).replace(/-/g, ' ').toLowerCase()); for (const b of list) if (!BANDS.includes(b)) throw Error(`band must be one of ${BANDS.join(', ')}`); return ['band = ANY($?)', list]; },
  min_orders: (v) => ['orders >= $?', int(v, 'min_orders')],
  max_orders: (v) => ['orders <= $?', int(v, 'max_orders')],
  ordered_within_days: (v) => ['last_order_at >= now() - make_interval(days => $?)', int(v, 'ordered_within_days', 1)],
  not_ordered_within_days: (v) => ['(last_order_at IS NULL OR last_order_at < now() - make_interval(days => $?))', int(v, 'not_ordered_within_days', 1)],
  min_spend_cents: (v) => ['spend_cents >= $?', int(v, 'min_spend_cents')],
  engaged_within_days: (v) => ['greatest(last_open_at, last_click_at) >= now() - make_interval(days => $?)', int(v, 'engaged_within_days', 1)],
  not_engaged_within_days: (v) => ['(greatest(last_open_at, last_click_at) IS NULL OR greatest(last_open_at, last_click_at) < now() - make_interval(days => $?))', int(v, 'not_engaged_within_days', 1)],
  signed_up_within_days: (v) => ['created_at >= now() - make_interval(days => $?)', int(v, 'signed_up_within_days', 1)],
  tag: (v) => ['$? = ANY(tags)', need(v, 'tag').toLowerCase()],
  country: (v) => ['lower(country) = $?', need(v, 'country').toLowerCase()],
};
export function segmentWhere(rules) {
  const parts = [], params = [];
  for (const [k, v] of Object.entries(rules || {})) {
    if (!RULES[k]) throw Error(`Unknown segment rule ${k}; use ${Object.keys(RULES).join(', ')}`);
    const [sql, p] = RULES[k](v);
    params.push(p);
    parts.push(sql.replace('$?', `$${params.length}`));
  }
  return { where: parts.length ? parts.join(' AND ') : 'true', params };
}
function rulesFromFlags(o) {
  let rules = o.rules ? JSON.parse(o.rules) : {};
  const map = { band: 'band', 'min-orders': 'min_orders', 'max-orders': 'max_orders', 'ordered-within-days': 'ordered_within_days', 'not-ordered-within-days': 'not_ordered_within_days', 'engaged-within-days': 'engaged_within_days', 'not-engaged-within-days': 'not_engaged_within_days', 'signed-up-within-days': 'signed_up_within_days', tag: 'tag', country: 'country' };
  for (const [flag, key] of Object.entries(map)) if (o[flag] !== undefined) rules[key] = key === 'band' ? String(o[flag]).split(',').map((s) => s.trim()) : ['tag', 'country'].includes(key) ? String(o[flag]) : int(o[flag], flag);
  if (o['min-spend'] !== undefined) rules.min_spend_cents = cents(o['min-spend'], 'min-spend');
  segmentWhere(rules);
  return rules;
}
// Marketable: subscribed now, never bounced, never reported spam.
const MARKETABLE = "consent = 'subscribed' AND NOT coalesce(bounced, false) AND NOT coalesce(complained, false)";
export async function members(db, segment, { marketable = true } = {}) {
  const { where, params } = segmentWhere(segment.rules);
  return db.query(`SELECT profile_id, email, first_name, last_name, band, orders, spend_cents, currency, consent, to_char(last_order_at,'YYYY-MM-DD') AS last_order, to_char(greatest(last_open_at,last_click_at),'YYYY-MM-DD') AS last_engaged
    FROM v_rfm WHERE ${where}${marketable ? ' AND ' + MARKETABLE : ''} ORDER BY spend_cents DESC, email`, params);
}

// ------------------------------------------------------------ rendering
async function settings(db) { return Object.fromEntries((await db.query('SELECT key, value FROM settings')).map((r) => [r.key, r.value])); }
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export function readTemplate(name) {
  const file = path.resolve(TEMPLATES, need(name, 'template'));
  if (!file.startsWith(TEMPLATES + path.sep)) throw Error('Templates live in templates/');
  if (!fs.existsSync(file)) throw Error(`No template templates/${name}`);
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes('{{unsubscribe_url}}')) throw Error(`templates/${name} has no {{unsubscribe_url}}: every marketing email must carry a working unsubscribe`);
  if (!html.includes('{{postal_address}}')) throw Error(`templates/${name} has no {{postal_address}}: every marketing email must say how to contact the sender`);
  return html;
}
export function render(html, vars) {
  return html.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k) => (k === 'unsubscribe_url' ? vars.unsubscribe_url : esc(vars[k] ?? '')));
}
function senderCheck(s) {
  for (const k of ['sender_name', 'sender_email', 'postal_address']) if (!String(s[k] || '').trim()) throw Error(`Setting ${k} is empty. Every email must say who sent it and how to reach them: set --key=${k} --value="..."`);
}
function varsFor(p, s, extra = {}) {
  return { first_name: p.first_name || 'there', email: p.email, business_name: s.sender_name, postal_address: s.postal_address, unsubscribe_url: s.unsubscribe_link || '{{{ pm:unsubscribe }}}', ...extra };
}

// ------------------------------------------------------------ sending
// Without --live: writes outbox/<name>/ (recipients.csv and a preview) and records nothing.
// With --live: sends through Postmark's batch API on a broadcast stream and records each message.
async function deliver(db, s, batch, live, outName) {
  const outDir = path.resolve(process.env.OUTPUT_DIR || REPO_ROOT, 'outbox', slug(outName));
  if (!live) {
    fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(outDir, 'recipients.csv'), 'email,first_name,subject\n' + batch.map((b) => [b.to, b.first_name || '', b.subject].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n') + '\n', { mode: 0o600 });
    if (batch[0]) fs.writeFileSync(path.join(outDir, 'preview.html'), batch[0].html, { mode: 0o600 });
    return { outbox: path.relative(process.env.OUTPUT_DIR || REPO_ROOT, outDir), recorded: 0 };
  }
  const token = process.env.POSTMARK_SERVER_TOKEN;
  if (!token) throw Error('POSTMARK_SERVER_TOKEN is not set. Put it in .env; nothing was sent');
  const stream = s.postmark_stream || 'broadcast';
  let recorded = 0;
  const failed = [];
  for (let i = 0; i < batch.length; i += 500) {
    const chunk = batch.slice(i, i + 500);
    const res = await fetch('https://api.postmarkapp.com/email/batch', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Postmark-Server-Token': token },
      body: JSON.stringify(chunk.map((b) => ({ From: `${s.sender_name} <${s.sender_email}>`, To: b.to, Subject: b.subject, HtmlBody: b.html, MessageStream: stream, TrackOpens: true, TrackLinks: 'HtmlAndText' }))),
    });
    if (!res.ok) throw Error(`Postmark refused the batch (${res.status}): ${await res.text()}. ${recorded} recorded before this`);
    const results = await res.json();
    for (const [j, r] of results.entries()) {
      const b = chunk[j];
      if (r.ErrorCode) { failed.push(`${b.to}: ${r.Message}`); continue; }
      await db.query(`INSERT INTO messages(profile_id,campaign_id,flow_step_id,trigger_ref,sent_at,provider_id) VALUES($1,$2,$3,$4,now(),$5) ON CONFLICT DO NOTHING`,
        [b.profile_id, b.campaign_id || null, b.flow_step_id || null, b.trigger_ref || null, r.MessageID]);
      recorded++;
    }
  }
  return { recorded, failed };
}

async function campaignRecipients(db, c, s) {
  if (!c.segment_id) throw Error(`${c.name} has no segment: set-campaign --segment=...`);
  const seg = (await db.query('SELECT * FROM segments WHERE id=$1', [c.segment_id]))[0];
  const all = await members(db, seg);
  const capped = new Set((await db.query(`SELECT DISTINCT profile_id FROM messages WHERE campaign_id IS NOT NULL AND campaign_id<>$1
    AND sent_at > now() - make_interval(hours => (SELECT frequency_cap_hours FROM v_setting))`, [c.id])).map((r) => r.profile_id));
  const done = new Set((await db.query('SELECT profile_id FROM messages WHERE campaign_id=$1', [c.id])).map((r) => r.profile_id));
  return { segment: seg.name, send: all.filter((m) => !capped.has(m.profile_id) && !done.has(m.profile_id)), capped: all.filter((m) => capped.has(m.profile_id)).length, already: all.filter((m) => done.has(m.profile_id)).length };
}

// ------------------------------------------------------------ reads
const reads = {
  profiles: "SELECT email, first_name, last_name, consent, band, orders, spend_cents, currency, to_char(last_order_at,'YYYY-MM-DD') AS last_order, array_to_string(tags, ', ') AS tags FROM v_rfm ORDER BY email",
  segments: 'SELECT s.name, s.description, s.rules FROM segments s ORDER BY s.name',
  campaigns: "SELECT c.name, c.status, to_char(c.scheduled_for,'YYYY-MM-DD HH24:MI') AS scheduled, to_char(c.sent_at,'YYYY-MM-DD') AS sent, s.name AS segment, c.template, c.approved_by FROM campaigns c LEFT JOIN segments s ON s.id=c.segment_id ORDER BY coalesce(c.sent_at, c.scheduled_for, c.created_at) DESC",
  calendar: "SELECT campaign, status, to_char(scheduled_for,'YYYY-MM-DD HH24:MI') AS scheduled, segment, approved_by, subject FROM v_calendar ORDER BY scheduled_for NULLS LAST",
  results: "SELECT campaign, to_char(sent_at,'YYYY-MM-DD') AS sent_on, sent, delivered, open_pct, click_pct, bounced, complained, unsubscribed, orders, revenue_cents, currency FROM v_campaign_results ORDER BY sent_at DESC",
  flows: "SELECT flow, trigger, active, steps, sent_30d, clicked_30d, orders_30d, revenue_30d_cents, currency, to_char(last_sent_at,'YYYY-MM-DD') AS last_sent FROM v_flow_health ORDER BY flow",
  'flows-due': "SELECT flow, step_no, email, first_name, to_char(triggered_at,'YYYY-MM-DD HH24:MI') AS triggered, to_char(due_at,'YYYY-MM-DD HH24:MI') AS due FROM v_flows_due ORDER BY due_at, flow",
  'list-health': 'SELECT * FROM v_list_health',
  attention: 'SELECT issue, ref, "when", detail FROM v_attention ORDER BY issue, ref',
  compliance: 'SELECT rule, ref, finding FROM v_compliance ORDER BY rule, ref',
  activity: "SELECT to_char(created_at,'YYYY-MM-DD HH24:MI') AS at, action, ref, actor, evidence FROM activity ORDER BY created_at DESC, id DESC LIMIT 100",
  settings: 'SELECT key, value, note FROM settings ORDER BY key',
};
async function revenue(db) {
  return db.query(`WITH s AS (SELECT store_currency FROM v_setting), m AS (
      SELECT generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') AS month)
    SELECT to_char(m.month,'YYYY-MM') AS month,
      (SELECT coalesce(sum(total_cents),0) FROM orders o WHERE NOT refunded AND currency=s.store_currency AND date_trunc('month', placed_at)=m.month) AS store_cents,
      (SELECT coalesce(sum(total_cents),0) FROM v_attribution a WHERE a.campaign_id IS NOT NULL AND a.currency=s.store_currency AND date_trunc('month', placed_at)=m.month) AS campaigns_cents,
      (SELECT coalesce(sum(total_cents),0) FROM v_attribution a WHERE a.flow_id IS NOT NULL AND a.currency=s.store_currency AND date_trunc('month', placed_at)=m.month) AS flows_cents,
      s.store_currency AS currency
    FROM m CROSS JOIN s ORDER BY m.month`).then((rows) => rows.map((r) => ({ ...r, email_share_pct: Number(r.store_cents) ? Math.round((1000 * (Number(r.campaigns_cents) + Number(r.flows_cents))) / Number(r.store_cents)) / 10 : null })));
}
async function rfm(db, o) {
  if (o.band) {
    const band = String(o.band).replace(/-/g, ' ').toLowerCase();
    if (!BANDS.includes(band)) throw Error(`band must be one of ${BANDS.join(', ')}`);
    return db.query(`SELECT email, first_name, consent, orders, spend_cents, currency, to_char(last_order_at,'YYYY-MM-DD') AS last_order, days_since_order FROM v_rfm WHERE band=$1 ORDER BY spend_cents DESC`, [band]);
  }
  return db.query(`SELECT band, count(*) AS people, count(*) FILTER (WHERE ${MARKETABLE}) AS can_email, sum(spend_cents) AS spend_cents, max(currency) AS currency, round(avg(orders),1) AS avg_orders
    FROM v_rfm GROUP BY band ORDER BY array_position($1::text[], band)`, [BANDS]);
}
async function audience(db) {
  const out = [];
  for (const s of await db.query('SELECT * FROM segments ORDER BY name')) {
    const all = await members(db, s, { marketable: false });
    const can = all.filter((m) => m.consent === 'subscribed');
    const send = await members(db, s);
    out.push({ segment: s.name, people: all.length, subscribed: can.length, can_email: send.length, spend_cents: send.reduce((a, m) => a + Number(m.spend_cents), 0), currency: send[0]?.currency || all[0]?.currency || '' });
  }
  return out;
}
async function weeklyReview(db) {
  return {
    attention: await db.query(reads.attention),
    next_7_days: await db.query("SELECT campaign, status, to_char(scheduled_for,'YYYY-MM-DD HH24:MI') AS scheduled, segment, approved_by FROM v_calendar WHERE status IN ('draft','approved') AND (scheduled_for IS NULL OR scheduled_for < now() + interval '7 days') ORDER BY scheduled_for NULLS LAST"),
    last_14_days: await db.query("SELECT campaign, to_char(sent_at,'YYYY-MM-DD') AS sent_on, sent, open_pct, click_pct, orders, revenue_cents, currency FROM v_campaign_results WHERE sent_at >= now() - interval '14 days' ORDER BY sent_at DESC"),
    flows: await db.query("SELECT flow, active, sent_30d, orders_30d, revenue_30d_cents, currency FROM v_flow_health ORDER BY revenue_30d_cents DESC"),
    list_health: await db.query(reads['list-health']),
  };
}

// ------------------------------------------------------------ imports
const KLAVIYO = {
  email: ['Email', 'Email Address', 'email'],
  first_name: ['First Name', 'FirstName', 'first_name'],
  last_name: ['Last Name', 'LastName', 'last_name'],
  phone: ['Phone Number', 'Phone'],
  city: ['City'],
  country: ['Country'],
  consent: ['Email Marketing Consent', 'Email Consent', 'Consent', 'Subscribed'],
  consent_at: ['Email Marketing Consent Timestamp', 'Email Consent Timestamp', 'Consent Timestamp'],
  consent_source: ['Email Marketing Consent Source', 'Consent Source', 'Source', 'Initial Source'],
  created: ['Profile Created On', 'Created', 'Date Added', 'Created At'],
  external_id: ['Klaviyo ID', 'Profile ID', 'Id', 'ID'],
};
const SHOPIFY = {
  order: ['Name', 'Order', 'Order Number'],
  email: ['Email', 'Customer Email'],
  financial: ['Financial Status'],
  created: ['Created at', 'Processed at', 'Paid at'],
  total: ['Total'],
  currency: ['Currency'],
  quantity: ['Lineitem quantity'],
  discount: ['Discount Code'],
  accepts: ['Accepts Marketing', 'Accepts Email Marketing'],
  name: ['Billing Name', 'Shipping Name'],
};
export function consentValue(v) {
  const s = String(v || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['subscribed', 'true', 'yes', 'opted_in', 'confirmed'].includes(s)) return 'subscribed';
  if (['unsubscribed', 'false_unsubscribed', 'opted_out', 'suppressed'].includes(s)) return 'unsubscribed';
  if (['never_subscribed', 'never', '', 'no', 'false'].includes(s)) return null;
  throw Error(`Unknown consent value "${v}"`);
}
async function importFile(db, kind, o, actor) {
  const filename = path.resolve(need(o.file, 'file'));
  const input = fs.readFileSync(filename, 'utf8');
  const rows = parseCsv(input);
  if (!rows.length) throw Error('No data rows');
  const aliases = kind === 'klaviyo' ? KLAVIYO : SHOPIFY;
  const mapping = o.map ? JSON.parse(fs.readFileSync(path.resolve(o.map), 'utf8')) : {};
  for (const k of Object.keys(mapping)) if (!k.startsWith('_') && !aliases[k]) throw Error(`Unknown mapping field ${k}; use ${Object.keys(aliases).join(', ')}`);
  const col = (row, k) => pick(row, ...(mapping[k] ? [mapping[k]] : []), ...aliases[k]);
  const sha = createHash('sha256').update(input).digest('hex');
  const out = { kind, rows: rows.length, profiles_created: 0, profiles_updated: 0, consents_recorded: 0, orders_created: 0, unchanged: 0, skipped: [], dry_run: Boolean(o['dry-run']) };
  return tx(db, async () => {
    const s = await settings(db);
    const findOrCreate = async (addr, extra = {}) => {
      let p = (await db.query('SELECT * FROM profiles WHERE lower(email)=$1', [addr]))[0];
      if (!p) {
        p = (await db.query('INSERT INTO profiles(email,first_name,last_name,phone,city,country,source,external_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,coalesce($9::timestamptz, now())) RETURNING *',
          [addr, extra.first_name || null, extra.last_name || null, extra.phone || null, extra.city || null, extra.country || null, `${kind} import`, extra.external_id || null, extra.created || null]))[0];
        out.profiles_created++;
      } else {
        const fill = ['first_name', 'last_name', 'phone', 'city', 'country', 'external_id'].filter((k) => !p[k] && extra[k]);
        if (fill.length) { p = (await db.query(`UPDATE profiles SET ${fill.map((k, i) => `${k}=$${i + 2}`).join(',')} WHERE id=$1 RETURNING *`, [p.id, ...fill.map((k) => extra[k])]))[0]; out.profiles_updated++; }
      }
      return p;
    };
    if (kind === 'klaviyo') {
      const seen = new Set();
      for (const [i, row] of rows.entries()) {
        const line = i + 2;
        const raw = col(row, 'email');
        if (!raw) { out.skipped.push(`row ${line}: no email`); continue; }
        const addr = email(raw, `email in row ${line}`);
        if (seen.has(addr)) throw Error(`Duplicate email in import: ${addr}`);
        seen.add(addr);
        const created = col(row, 'created') ? when(col(row, 'created'), `created in row ${line}`) : null;
        const p = await findOrCreate(addr, { first_name: col(row, 'first_name'), last_name: col(row, 'last_name'), phone: col(row, 'phone'), city: col(row, 'city'), country: col(row, 'country'), external_id: col(row, 'external_id'), created });
        const status = consentValue(col(row, 'consent'));
        const cur = (await db.query('SELECT * FROM v_consent WHERE profile_id=$1', [p.id]))[0];
        if (!status || cur?.status === status) { out.unchanged++; continue; }
        if (cur && !o.update) throw Error(`${addr} is ${cur.status} here and ${status} in the file; add --update to record the change`);
        const at = col(row, 'consent_at') ? when(col(row, 'consent_at'), `consent timestamp in row ${line}`) : null;
        const src = col(row, 'consent_source');
        await db.query('INSERT INTO consents(profile_id,status,kind,source,evidence,actor,recorded_at) VALUES($1,$2,$3,$4,$5,$6,coalesce($7::timestamptz, now()))',
          [p.id, status, status === 'subscribed' ? 'express' : null, src ? `Klaviyo: ${src}` : (status === 'subscribed' ? null : 'Klaviyo export'),
            at ? `Klaviyo consent timestamp ${at} (${path.basename(filename)})` : null, actor, at]);
        out.consents_recorded++;
      }
    } else {
      const orders = new Map();
      for (const [i, row] of rows.entries()) {
        const ref = col(row, 'order');
        if (!ref) { out.skipped.push(`row ${i + 2}: no order number`); continue; }
        const o2 = orders.get(ref) || { ref, line: i + 2, items: 0 };
        for (const k of ['email', 'financial', 'created', 'total', 'currency', 'discount', 'accepts', 'name']) if (!o2[k] && col(row, k)) o2[k] = col(row, k);
        o2.items += Number(col(row, 'quantity') || 0);
        orders.set(ref, o2);
      }
      for (const r of orders.values()) {
        if (!r.email) { out.skipped.push(`${r.ref}: no customer email`); continue; }
        if (/voided/i.test(r.financial || '')) { out.skipped.push(`${r.ref}: voided`); continue; }
        if (!r.total || !r.currency || !r.created) { out.skipped.push(`${r.ref}: missing total, currency or date`); continue; }
        const addr = email(r.email, `email on ${r.ref}`);
        const [first, ...rest] = String(r.name || '').trim().split(/\s+/);
        const p = await findOrCreate(addr, { first_name: first || null, last_name: rest.join(' ') || null });
        const refunded = /refunded/i.test(r.financial || '') && !/partially/i.test(r.financial || '');
        const old = (await db.query('SELECT * FROM orders WHERE order_ref=$1', [r.ref]))[0];
        const total = cents(r.total, `total on ${r.ref}`);
        const placed = when(r.created, `date on ${r.ref}`);
        if (old) {
          const same = Number(old.total_cents) === total && old.refunded === refunded;
          if (same) { out.unchanged++; continue; }
          if (!o.update) throw Error(`${r.ref} has changed (total or refund); add --update to record it`);
          await db.query('UPDATE orders SET total_cents=$2, refunded=$3 WHERE id=$1', [old.id, total, refunded]);
          out.orders_updated = (out.orders_updated || 0) + 1;
          continue;
        }
        await db.query('INSERT INTO orders(profile_id,order_ref,placed_at,total_cents,currency,items,discount_code,refunded,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [p.id, r.ref, placed, total, r.currency.toUpperCase(), r.items || null, r.discount || null, refunded, `shopify: ${path.basename(filename)}`]);
        out.orders_created++;
        const cur = (await db.query('SELECT 1 FROM consents WHERE profile_id=$1', [p.id]))[0];
        if (!cur && /^(yes|true|subscribed)$/i.test(String(r.accepts || '').trim())) {
          await db.query("INSERT INTO consents(profile_id,status,kind,source,evidence,actor,recorded_at) VALUES($1,'subscribed','express','Shopify checkout',$2,$3,$4)",
            [p.id, `Accepts Marketing = yes on order ${r.ref} (${path.basename(filename)})`, actor, placed]);
          out.consents_recorded++;
        }
      }
      if (s.store_currency) out.note = `Orders not in ${s.store_currency} are kept but left out of customer value and revenue.`;
    }
    await db.query('INSERT INTO imports(kind,file_name,file_sha256,actor,summary) VALUES($1,$2,$3,$4,$5)', [kind, path.basename(filename), sha, actor, JSON.stringify(out)]);
    await audit(db, `import ${kind}`, path.basename(filename), actor, null, out, sha.slice(0, 12));
    return out;
  }, Boolean(o['dry-run']));
}

async function recordResults(db, o, actor) {
  const filename = path.resolve(need(o.file, 'file'));
  const rows = parseCsv(fs.readFileSync(filename, 'utf8'));
  const out = { rows: rows.length, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0, unsubscribed: 0, unmatched: [], dry_run: Boolean(o['dry-run']) };
  const KIND = { delivery: 'delivered', delivered: 'delivered', open: 'opened', opened: 'opened', click: 'clicked', clicked: 'clicked', bounce: 'bounced', bounced: 'bounced', hardbounce: 'bounced', spamcomplaint: 'complained', complaint: 'complained', complained: 'complained', subscriptionchange: 'unsubscribed', unsubscribe: 'unsubscribed', unsubscribed: 'unsubscribed' };
  return tx(db, async () => {
    for (const [i, row] of rows.entries()) {
      const ref = pick(row, 'MessageID', 'Message ID', 'message_id', 'message', 'provider_id');
      const kind = KIND[String(pick(row, 'RecordType', 'Record Type', 'event', 'type')).toLowerCase().replace(/[\s_]/g, '')];
      const at = when(pick(row, 'ReceivedAt', 'DeliveredAt', 'BouncedAt', 'At', 'occurred_at', 'timestamp'), `time in row ${i + 2}`);
      if (!kind) { out.unmatched.push(`row ${i + 2}: event "${pick(row, 'RecordType', 'event', 'type')}" not recognised`); continue; }
      const m = (await db.query('SELECT * FROM messages WHERE provider_id=$1 OR id::text=$1', [ref]))[0];
      if (!m) { out.unmatched.push(`row ${i + 2}: no message ${ref}`); continue; }
      const col = `${kind === 'opened' ? 'opened' : kind === 'clicked' ? 'clicked' : kind === 'delivered' ? 'delivered' : kind === 'bounced' ? 'bounced' : kind === 'complained' ? 'complained' : 'unsubscribed'}_at`;
      await db.query(`UPDATE messages SET ${col}=CASE WHEN ${col} IS NULL OR ${col}>$2 THEN $2::timestamptz ELSE ${col} END${kind === 'clicked' ? ', opened_at=coalesce(opened_at,$2::timestamptz)' : ''} WHERE id=$1`, [m.id, at]);
      out[kind]++;
      if (kind === 'complained' || kind === 'unsubscribed') {
        const cur = (await db.query('SELECT status FROM v_consent WHERE profile_id=$1', [m.profile_id]))[0];
        if (cur?.status === 'subscribed') {
          await db.query("INSERT INTO consents(profile_id,status,source,evidence,actor) VALUES($1,'unsubscribed',$2,$3,$4)", [m.profile_id, kind === 'complained' ? 'Reported as spam' : 'Unsubscribe link', `${path.basename(filename)} row ${i + 2}`, actor]);
          await db.query('INSERT INTO unsubscribe_requests(profile_id,requested_at,via,actor) VALUES($1,$2,$3,$4)', [m.profile_id, at, kind === 'complained' ? 'spam report' : 'unsubscribe link', actor]);
        }
      }
    }
    await audit(db, 'record results', path.basename(filename), actor, null, out, null);
    return out;
  }, Boolean(o['dry-run']));
}

// ------------------------------------------------------------ drafts
function writeDraft(name, text) {
  const dir = path.resolve(process.env.OUTPUT_DIR || REPO_ROOT, 'drafts');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, text);
  return path.relative(process.env.OUTPUT_DIR || REPO_ROOT, file);
}
function md(rows) {
  if (!rows.length) return '_Nothing._\n';
  const keys = Object.keys(rows[0]);
  return `| ${keys.join(' | ')} |\n| ${keys.map(() => '---').join(' | ')} |\n${rows.map((r) => `| ${keys.map((k) => String(r[k] ?? '').replace(/\|/g, '/')).join(' | ')} |`).join('\n')}\n`;
}

// ------------------------------------------------------------ run
export async function run(db, cmd, o = {}, args = []) {
  if (cmd === 'help') return commands.map((c) => ({ command: c }));
  if (reads[cmd]) return db.query(reads[cmd]);
  if (cmd === 'revenue') return revenue(db);
  if (cmd === 'rfm') return rfm(db, o);
  if (cmd === 'audience') return audience(db);
  if (cmd === 'weekly-review') return weeklyReview(db);
  if (cmd === 'members') { const s = await matchSegment(db, o.segment); return members(db, s, { marketable: !o.all }); }
  if (cmd === 'profile') {
    const p = strip(await matchProfile(db, o.profile ?? args[0]));
    return {
      profile: [(await db.query("SELECT p.email, p.first_name, p.last_name, p.phone, p.city, p.country, array_to_string(p.tags, ', ') AS tags, p.source, r.band, r.orders, r.spend_cents, r.currency, to_char(p.created_at,'YYYY-MM-DD') AS created FROM v_rfm r JOIN profiles p ON p.id=r.profile_id WHERE p.id=$1", [p.id]))[0]],
      consent_history: await db.query("SELECT to_char(recorded_at,'YYYY-MM-DD HH24:MI') AS at, status, kind, source, evidence, actor FROM consents WHERE profile_id=$1 ORDER BY recorded_at", [p.id]),
      orders: await db.query("SELECT order_ref, to_char(placed_at,'YYYY-MM-DD') AS placed, total_cents, currency, refunded FROM orders WHERE profile_id=$1 ORDER BY placed_at DESC", [p.id]),
      emails: await db.query("SELECT to_char(m.sent_at,'YYYY-MM-DD') AS sent, coalesce(c.name, f.name || ' #' || fs.step_no) AS email, m.opened_at IS NOT NULL AS opened, m.clicked_at IS NOT NULL AS clicked, m.bounced_at IS NOT NULL AS bounced, m.complained_at IS NOT NULL AS complained FROM messages m LEFT JOIN campaigns c ON c.id=m.campaign_id LEFT JOIN flow_steps fs ON fs.id=m.flow_step_id LEFT JOIN flows f ON f.id=fs.flow_id WHERE m.profile_id=$1 ORDER BY m.sent_at DESC LIMIT 20", [p.id]),
    };
  }
  if (cmd === 'export') {
    const dir = path.resolve(o.out || path.join(process.env.OUTPUT_DIR || REPO_ROOT, 'exports', new Date().toISOString().slice(0, 10)));
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const out = [];
    for (const t of TABLES) { const rows = await db.query(`SELECT * FROM ${t}`); fs.writeFileSync(path.join(dir, `${t}.json`), JSON.stringify(rows, null, 2), { mode: 0o600 }); out.push({ table: t, rows: rows.length }); }
    return out;
  }
  if (cmd === 'draft-campaign') {
    const c = strip(await matchCampaign(db, o.campaign));
    const s = await settings(db);
    const html = readTemplate(c.template);
    const r = c.segment_id ? await campaignRecipients(db, c, s) : { segment: '(none)', send: [], capped: 0, already: 0 };
    const sample = r.send[0] || { first_name: 'Sam', email: 'sample@example.com' };
    const preview = writeDraft(`${slug(c.name)}.html`, render(html, varsFor(sample, s, { preheader: c.preheader || '' })));
    const last = await db.query("SELECT campaign, sent, open_pct, click_pct, orders, revenue_cents, currency FROM v_campaign_results ORDER BY sent_at DESC LIMIT 3");
    const brief = `# ${c.name}\n\nStatus: ${c.status}${c.approved_by ? ` (approved by ${c.approved_by})` : ''}. Scheduled: ${c.scheduled_for || 'not set'}.\n\n- Subject: ${c.subject}\n- Preheader: ${c.preheader || '(none)'}\n- Goal: ${c.goal || '(none)'}\n- Audience: ${r.segment}, ${r.send.length} people would get it now (${r.capped} held back by the frequency cap, ${r.already} already sent)\n- Template: templates/${c.template}\n- Preview: ${path.basename(preview)}\n\n## The last three campaigns\n\n${md(last)}\nDraft only. Nothing has been sent. Approve with \`approve --campaign\`, then \`send\`.\n`;
    return { brief: writeDraft(`${slug(c.name)}.md`, brief), preview, recipients: r.send.length };
  }
  if (cmd === 'draft-weekly') {
    const w = await weeklyReview(db);
    const text = `# Email: the week of ${new Date().toISOString().slice(0, 10)}\n\n## Needs attention\n\n${md(w.attention)}\n## Going out in the next 7 days\n\n${md(w.next_7_days)}\n## Sent in the last 14 days\n\n${md(w.last_14_days)}\n## Flows, last 30 days\n\n${md(w.flows)}\n## List health\n\n${md(w.list_health)}\nRevenue is in cents of the store currency. Draft only.\n`;
    return { draft: writeDraft(`weekly-${new Date().toISOString().slice(0, 10)}.md`, text) };
  }
  if (cmd === 'send') {
    const actor = need(o.actor, 'actor');
    const c = strip(await matchCampaign(db, o.campaign));
    if (c.status !== 'approved') throw Error(`${c.name} is ${c.status}. Only an approved campaign can be sent: approve --campaign="${c.name}"`);
    if (c.scheduled_for && new Date(c.scheduled_for) > new Date() && !o.now) throw Error(`${c.name} is scheduled for ${new Date(c.scheduled_for).toISOString()}; add --now to send it early`);
    const s = await settings(db);
    senderCheck(s);
    const html = readTemplate(c.template);
    const r = await campaignRecipients(db, c, s);
    if (!r.send.length) throw Error(`Nobody in ${r.segment} can be sent ${c.name} (${r.capped} held back by the frequency cap, ${r.already} already sent)`);
    const batch = r.send.map((m) => ({ to: m.email, first_name: m.first_name, profile_id: m.profile_id, campaign_id: c.id, subject: c.subject, html: render(html, varsFor(m, s, { preheader: c.preheader || '' })) }));
    if (!o.live) { const d = await deliver(db, s, batch, false, c.name); return { campaign: c.name, segment: r.segment, would_send: batch.length, held_by_frequency_cap: r.capped, already_sent: r.already, ...d, note: 'Outbox written. Nothing sent, nothing recorded. Add --live to send.' }; }
    const d = await deliver(db, s, batch, true, c.name);
    await db.query("UPDATE campaigns SET status='sent', sent_at=now() WHERE id=$1", [c.id]);
    await audit(db, 'send campaign', c.name, actor, null, { sent: d.recorded, failed: d.failed.length }, `segment ${r.segment}`);
    return { campaign: c.name, sent: d.recorded, failed: d.failed, held_by_frequency_cap: r.capped };
  }
  if (cmd === 'send-flows') {
    const actor = need(o.actor, 'actor');
    const s = await settings(db);
    senderCheck(s);
    const due = await db.query('SELECT * FROM v_flows_due ORDER BY due_at');
    if (o.flow) { const f = await matchFlow(db, o.flow); for (let i = due.length - 1; i >= 0; i--) if (due[i].flow !== f.name) due.splice(i, 1); }
    const batch = due.map((d) => ({ to: d.email, first_name: d.first_name, profile_id: d.profile_id, flow_step_id: d.flow_step_id, trigger_ref: d.trigger_ref, subject: d.subject, html: render(readTemplate(d.template), varsFor(d, s)) }));
    if (!batch.length) return { due: 0, note: 'No flow emails are due.' };
    if (!o.live) { const d = await deliver(db, s, batch, false, 'flows'); return { due: batch.length, by_flow: Object.entries(due.reduce((a, d2) => ((a[d2.flow] = (a[d2.flow] || 0) + 1), a), {})).map(([flow, n]) => `${flow}: ${n}`).join('; '), ...d, note: 'Outbox written. Nothing sent, nothing recorded. Add --live to send.' }; }
    const d = await deliver(db, s, batch, true, 'flows');
    await audit(db, 'send flows', null, actor, null, { sent: d.recorded, failed: d.failed.length }, null);
    return { sent: d.recorded, failed: d.failed };
  }

  // ---------------------------------------------------------- writes
  const actor = need(o.actor, 'actor');
  if (cmd === 'import') {
    const kind = need(args[0], 'import kind (klaviyo or shopify)');
    if (!['klaviyo', 'shopify'].includes(kind)) throw Error('import takes klaviyo (profiles export) or shopify (orders export)');
    return importFile(db, kind, o, actor);
  }
  if (cmd === 'record-results') return recordResults(db, o, actor);
  return tx(db, async () => {
    if (cmd === 'add-profile') {
      const addr = email(o.email);
      if ((await db.query('SELECT 1 FROM profiles WHERE lower(email)=$1', [addr])).length) throw Error(`${addr} already exists`);
      const row = (await db.query('INSERT INTO profiles(email,first_name,last_name,phone,city,country,source) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [addr, o['first-name'] || null, o['last-name'] || null, o.phone || null, o.city || null, o.country || null, need(o.source, 'source')]))[0];
      await audit(db, 'add profile', addr, actor, null, row, o.source);
      await db.query("INSERT INTO events(profile_id,kind,occurred_at,detail) VALUES($1,'signed_up',now(),$2)", [row.id, o.source]);
      return row;
    }
    if (cmd === 'tag') {
      const p = strip(await matchProfile(db, o.profile));
      const add = o.add ? String(o.add).toLowerCase().split(',').map((t) => t.trim()).filter(Boolean) : [];
      const rem = o.remove ? String(o.remove).toLowerCase().split(',').map((t) => t.trim()) : [];
      const tags = [...new Set([...p.tags.filter((t) => !rem.includes(t)), ...add])].sort();
      const row = (await db.query('UPDATE profiles SET tags=$2 WHERE id=$1 RETURNING email, tags', [p.id, tags]))[0];
      await audit(db, 'tag', p.email, actor, { tags: p.tags }, { tags }, null);
      return row;
    }
    if (cmd === 'consent') {
      const p = strip(await matchProfile(db, o.profile));
      const status = need(o.status, 'status');
      if (status !== 'subscribed') throw Error('consent records a subscription (--status=subscribed). Use unsubscribe to record an opt-out');
      const kind = need(o.kind, 'kind');
      if (!['express', 'inferred'].includes(kind)) throw Error('--kind must be express or inferred');
      const row = (await db.query('INSERT INTO consents(profile_id,status,kind,source,evidence,actor,recorded_at) VALUES($1,$2,$3,$4,$5,$6,coalesce($7::timestamptz, now())) RETURNING *',
        [p.id, status, kind, need(o.source, 'source'), need(o.evidence, 'evidence'), actor, o.at ? when(o.at, 'at') : null]))[0];
      await audit(db, 'consent', p.email, actor, null, row, o.evidence);
      return row;
    }
    if (cmd === 'unsubscribe') {
      const p = strip(await matchProfile(db, o.profile));
      const requested = o['requested-at'] ? when(o['requested-at'], 'requested-at') : new Date().toISOString();
      if (new Date(requested) > new Date()) throw Error('requested-at cannot be in the future');
      const via = need(o.via, 'via');
      const req = (await db.query('INSERT INTO unsubscribe_requests(profile_id,requested_at,via,actor) VALUES($1,$2,$3,$4) RETURNING *', [p.id, requested, via, actor]))[0];
      await db.query("INSERT INTO consents(profile_id,status,source,evidence,actor) VALUES($1,'unsubscribed',$2,$3,$4)", [p.id, via, o.evidence || `asked ${requested.slice(0, 10)}`, actor]);
      await audit(db, 'unsubscribe', p.email, actor, null, req, o.evidence);
      const days = (await db.query('SELECT working_days_between($1::timestamptz, now()) AS d', [requested]))[0].d;
      return { email: p.email, requested_at: requested, actioned_at: req.actioned_at, working_days: days, within_limit: days <= Number((await settings(db)).unsubscribe_working_days) };
    }
    if (cmd === 'add-order') {
      const p = strip(await matchProfile(db, o.profile));
      const s = await settings(db);
      const row = (await db.query('INSERT INTO orders(profile_id,order_ref,placed_at,total_cents,currency,items,discount_code,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
        [p.id, need(o.ref, 'ref'), o.at ? when(o.at, 'at') : new Date().toISOString(), cents(o.total, 'total'), (o.currency || s.store_currency).toUpperCase(), o.items ? int(o.items, 'items', 1) : null, o['discount-code'] || null, o.source || 'manual']))[0];
      await audit(db, 'add order', row.order_ref, actor, null, row, o.source);
      return row;
    }
    if (cmd === 'log-event') {
      const p = strip(await matchProfile(db, o.profile));
      const kind = need(o.kind, 'kind');
      if (!['signed_up', 'checkout_started', 'viewed_product'].includes(kind)) throw Error('--kind must be signed_up, checkout_started or viewed_product');
      const row = (await db.query('INSERT INTO events(profile_id,kind,occurred_at,value_cents,currency,detail,ref) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [p.id, kind, o.at ? when(o.at, 'at') : new Date().toISOString(), o.value ? cents(o.value, 'value') : null, o.value ? (o.currency || (await settings(db)).store_currency) : null, o.detail || null, o.ref || null]))[0];
      await audit(db, `event ${kind}`, p.email, actor, null, row, o.detail);
      return row;
    }
    if (cmd === 'add-segment' || cmd === 'set-segment') {
      const rules = rulesFromFlags(o);
      if (cmd === 'add-segment') {
        const row = (await db.query('INSERT INTO segments(name,description,rules) VALUES($1,$2,$3) RETURNING *', [need(o.name, 'name'), o.description || null, JSON.stringify(rules)]))[0];
        await audit(db, 'add segment', row.name, actor, null, row, o.description);
        return { ...row, can_email: (await members(db, row)).length };
      }
      const s = strip(await matchSegment(db, o.segment));
      const merged = o.replace ? rules : { ...s.rules, ...rules };
      const row = (await db.query('UPDATE segments SET rules=$2, description=coalesce($3, description) WHERE id=$1 RETURNING *', [s.id, JSON.stringify(merged), o.description || null]))[0];
      await audit(db, 'set segment', s.name, actor, s, row, o.evidence);
      return { ...row, can_email: (await members(db, row)).length };
    }
    if (cmd === 'add-campaign') {
      readTemplate(o.template);
      const seg = o.segment ? await matchSegment(db, o.segment) : null;
      const row = (await db.query('INSERT INTO campaigns(name,subject,preheader,template,segment_id,scheduled_for,goal) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [need(o.name, 'name'), need(o.subject, 'subject'), o.preheader || null, o.template, seg?.id || null, o.schedule ? when(o.schedule, 'schedule') : null, o.goal || null]))[0];
      await audit(db, 'add campaign', row.name, actor, null, row, o.goal);
      return row;
    }
    if (cmd === 'set-campaign') {
      const c = strip(await matchCampaign(db, o.campaign));
      if (c.status === 'sent') throw Error(`${c.name} has been sent; it cannot change`);
      const sets = [], params = [c.id];
      const put = (col, v) => { params.push(v); sets.push(`${col}=$${params.length}`); };
      if (o.subject) put('subject', o.subject);
      if (o.preheader !== undefined) put('preheader', o.preheader);
      if (o.template) { readTemplate(o.template); put('template', o.template); }
      if (o.segment) put('segment_id', (await matchSegment(db, o.segment)).id);
      if (o.schedule) put('scheduled_for', when(o.schedule, 'schedule'));
      if (o.goal) put('goal', o.goal);
      if (o.status) { if (!['draft', 'cancelled'].includes(o.status)) throw Error('--status can be draft or cancelled here; use approve and send for the rest'); put('status', o.status); put('approved_by', null); put('approved_at', null); }
      if (!sets.length) throw Error('Nothing to change');
      // Any change to what goes out sends an approved campaign back to draft.
      if (c.status === 'approved' && !o.status && sets.some((x) => /^(subject|preheader|template|segment_id)=/.test(x))) { put('status', 'draft'); put('approved_by', null); put('approved_at', null); }
      const row = (await db.query(`UPDATE campaigns SET ${sets.join(',')} WHERE id=$1 RETURNING *`, params))[0];
      await audit(db, 'set campaign', c.name, actor, c, row, o.evidence);
      return row;
    }
    if (cmd === 'approve') {
      const c = strip(await matchCampaign(db, o.campaign));
      if (c.status !== 'draft') throw Error(`${c.name} is ${c.status}; only a draft can be approved`);
      if (!c.segment_id) throw Error(`${c.name} has no segment`);
      if (!c.scheduled_for) throw Error(`${c.name} has no send time: set-campaign --schedule=...`);
      readTemplate(c.template);
      senderCheck(await settings(db));
      const row = (await db.query("UPDATE campaigns SET status='approved', approved_by=$2, approved_at=now() WHERE id=$1 RETURNING *", [c.id, actor]))[0];
      await audit(db, 'approve campaign', c.name, actor, c, row, need(o.evidence, 'evidence'));
      return row;
    }
    if (cmd === 'add-flow') {
      const trigger = need(o.trigger, 'trigger');
      const row = (await db.query('INSERT INTO flows(name,trigger,lapsed_days,description) VALUES($1,$2,$3,$4) RETURNING *', [need(o.name, 'name'), trigger, o['lapsed-days'] ? int(o['lapsed-days'], 'lapsed-days', 1) : null, o.description || null]))[0];
      await audit(db, 'add flow', row.name, actor, null, row, o.description);
      return row;
    }
    if (cmd === 'add-step') {
      const f = strip(await matchFlow(db, o.flow));
      readTemplate(o.template);
      const next = (await db.query('SELECT coalesce(max(step_no),0)+1 AS n FROM flow_steps WHERE flow_id=$1', [f.id]))[0].n;
      const row = (await db.query('INSERT INTO flow_steps(flow_id,step_no,delay_hours,subject,template,stop_if_ordered) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
        [f.id, next, int(o['delay-hours'], 'delay-hours'), need(o.subject, 'subject'), o.template, o['keep-if-ordered'] ? false : true]))[0];
      await audit(db, 'add flow step', `${f.name} #${next}`, actor, null, row, null);
      return row;
    }
    if (cmd === 'set-flow') {
      const f = strip(await matchFlow(db, o.flow));
      const active = need(o.active, 'active');
      if (!['on', 'off'].includes(active)) throw Error('--active must be on or off');
      if (active === 'on' && !(await db.query('SELECT 1 FROM flow_steps WHERE flow_id=$1', [f.id])).length) throw Error(`${f.name} has no steps`);
      const row = (await db.query('UPDATE flows SET active=$2 WHERE id=$1 RETURNING *', [f.id, active === 'on']))[0];
      await audit(db, `flow ${active}`, f.name, actor, f, row, need(o.evidence, 'evidence'));
      return { ...row, due_now: (await db.query('SELECT count(*)::int AS n FROM v_flows_due WHERE flow=$1', [f.name]))[0].n };
    }
    if (cmd === 'set') {
      const key = need(o.key, 'key');
      const old = (await db.query('SELECT * FROM settings WHERE key=$1', [key]))[0];
      if (!old && !['unsubscribe_link', 'postmark_stream'].includes(key)) throw Error(`No setting ${key}; see settings`);
      const value = String(o.value ?? '');
      if (/_(days|hours)$/.test(key) && !/^\d+$/.test(value)) throw Error(`${key} must be a whole number`);
      if (/_pct$/.test(key) && !/^\d+(\.\d+)?$/.test(value)) throw Error(`${key} must be a number`);
      if (key === 'sender_email' && value) email(value, 'value');
      const row = (await db.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value RETURNING *', [key, value]))[0];
      await audit(db, 'setting', key, actor, old || null, row, o.evidence);
      return row;
    }
    throw Error(`Unknown command ${cmd}. Try help`);
  }, Boolean(o['dry-run']));
}

// ------------------------------------------------------------ command line
const FLAGS = new Set(['json', 'profile', 'segment', 'campaign', 'flow', 'actor', 'evidence', 'email', 'first-name', 'last-name', 'phone', 'city', 'country', 'source', 'add', 'remove', 'status', 'kind', 'at', 'requested-at', 'via', 'ref', 'total', 'currency', 'items', 'discount-code', 'value', 'detail', 'name', 'description', 'rules', 'band', 'min-orders', 'max-orders', 'ordered-within-days', 'not-ordered-within-days', 'engaged-within-days', 'not-engaged-within-days', 'signed-up-within-days', 'tag', 'min-spend', 'replace', 'subject', 'preheader', 'template', 'schedule', 'goal', 'now', 'live', 'trigger', 'lapsed-days', 'delay-hours', 'keep-if-ordered', 'active', 'key', 'file', 'map', 'update', 'dry-run', 'out', 'all']);
const BOOL = new Set(['json', 'replace', 'now', 'live', 'keep-if-ordered', 'update', 'dry-run', 'all']);
export function parse(argv) {
  const args = [], o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { args.push(a); continue; }
    const [k, ...rest] = a.slice(2).split('=');
    if (!FLAGS.has(k)) throw Error(`Unknown flag --${k}`);
    if (BOOL.has(k)) { if (rest.length) throw Error(`--${k} takes no value`); o[k] = true; continue; }
    o[k] = rest.length ? rest.join('=') : argv[++i];
    if (o[k] === undefined || o[k].startsWith('--')) throw Error(`Missing value for --${k}`);
  }
  return { cmd: args.shift() || 'help', args, o };
}
// Human output shows money as dollars (the column loses its _cents suffix). --json keeps whole cents.
const dollars = (v) => (v === null || v === undefined || v === '' ? '' : (Number(v) / 100).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
function display(result) {
  if (Array.isArray(result)) return result.length ? table(result, Object.keys(result[0]).map((key) => ({ key, label: key.replace(/_cents$/, ''), align: key.endsWith('_cents') ? 'right' : 'left', width: 90, format: (v) => (key.endsWith('_cents') ? dollars(v) : v instanceof Date ? v.toISOString().slice(0, 16).replace('T', ' ') : v && typeof v === 'object' ? JSON.stringify(v) : v) }))) : '(nothing)';
  return Object.entries(result).map(([k, v]) => (v instanceof Date ? `${k}: ${v.toISOString()}` : Array.isArray(v) ? `\n${k}\n${display(v)}` : v && typeof v === 'object' ? `\n${k}\n${display(v)}` : `${k}: ${v}`)).join('\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let db;
  try {
    const { cmd, args, o } = parse(process.argv.slice(2));
    db = await getDb();
    const result = await run(db, cmd, o, args);
    console.log(o.json ? JSON.stringify(result, null, 2) : display(result));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    if (db) await db.close();
  }
}
