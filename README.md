<h1 align="center">Email Marketing for Claude Code</h1>

<p align="center">
  <strong>The open-source email marketing system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your Klaviyo data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=klaviyo">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/klaviyo?utm_source=github&utm_medium=readme&utm_campaign=klaviyo">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-klaviyo">Instead of Klaviyo</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Email Marketing for Claude Code does the job you pay Klaviyo for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the Klaviyo dashboard cannot.

Klaviyo charges by active profiles: every contact you can market to, whether they open or not. Its pricing page starts the Email plan at USD 20 a month for 500 active profiles and the Marketing plan at USD 25, rising with every profile, with custom pricing above 150,000 profiles and SMS as an add-on ([klaviyo.com/pricing](https://www.klaviyo.com/pricing), checked 14 November 2026). Here, a bigger list costs only what your sending provider charges per email.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=klaviyo).

It runs the email program for an online store: the list and its consent, customer bands from orders, segments, campaigns with a named approver, automated flows (welcome, abandoned checkout, post-purchase, win-back), delivery results, and the revenue credited to each email. The consent and unsubscribe rules of the Spam Act 2003 (Australia) and New Zealand's Unsolicited Electronic Messages Act 2007 are checked on every run. It is for the owner or marketer of a store in New Zealand or Australia who sends email every week and wants to know what it earns.

## The week as commands

| When | Ask Claude Code | What it runs |
|---|---|---|
| Monday | "What needs me this week?" | `/weekly-review` |
| Planning | "Who bought twice and has gone quiet? Make that a segment." | `/rfm`, `/add-segment`, `/audience` |
| Writing | "Write the launch email for the engaged list, send Thursday 9am" | `/add-campaign`, `/draft-campaign` |
| Approving | "I've read it. Approve it." | `/approve` |
| Sending | "Show me who gets it, then send it" | `/send`, then `/send --live` |
| Every hour | The flows: welcome, abandoned checkout, post-purchase | `/send-flows` on a timer |
| After a send | "What did it earn?" | `/record-results`, `/results`, `/revenue` |
| Any time | "Did anyone get an email after they unsubscribed?" | `/compliance` |

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your list sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No price per profile, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/email-marketing-for-claude-code.git
cd email-marketing-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/weekly-review`. The demo is a fictional coffee roaster in Nelson with 36 people on the list, two campaigns sent, a Black Friday email due tomorrow that nobody approved, a win-back flow someone switched off, post-purchase emails piling up, two people who got the spring sale after they asked to stop, and a spam-report rate over Google's line.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-profile fee. Never run the demo seed on your own database.

### Sending

Nothing is sent until you add `--live` and a Postmark server token. Without it, `send` writes an outbox (who would get it, and a preview) and records nothing. See [docs/sending.md](docs/sending.md).

## The commands

| Command | What it does |
|---|---|
| `/weekly-review` | The Monday review: what needs a person, what goes out this week, what last week earned, and the health of the list. |
| `/attention` | Everything in the email program that needs a person now: unapproved sends, overdue campaigns, flows switched off or backed up, list health and compliance findings. |
| `/calendar` | The campaign calendar: drafts, approved sends and what went out in the last fortnight. |
| `/results` | What each sent campaign did: delivered, opens, clicks, bounces, spam reports, unsubscribes, and the orders and revenue credited to it. |
| `/revenue` | Store revenue by month for six months, with the share credited to campaigns and to flows. |
| `/flows` | The automated flows: on or off, emails sent, clicks, orders and revenue in the last 30 days. |
| `/flows-due` | Who is due which flow email right now: welcome, abandoned checkout, post-purchase, win-back. |
| `/send-flows` | Send the flow emails that are due. Without --live it writes the outbox only. |
| `/list-health` | The list: subscribed, unsubscribed, sunset candidates, inferred consent, bounce and spam-report rates for 30 days. |
| `/rfm` | Customer value bands from recency, frequency and spend: champion, loyal, new, at risk, lapsed, one-off, never ordered. |
| `/audience` | Every segment with how many people are in it, how many are subscribed and how many can be emailed now. |
| `/members` | The people in one segment who can be emailed (add --all for everyone in it). |
| `/segments` | Every segment and its rules. |
| `/campaigns` | Every campaign, its status, send time, audience and who approved it. |
| `/profiles` | Every person on the list with consent, band, orders and spend. |
| `/profile` | One person in full: details, consent history, orders and every email they got. |
| `/compliance` | Check the records against the Spam Act 2003 (AU), the Unsolicited Electronic Messages Act 2007 (NZ) and the bulk-sender rules in docs/compliance.md, and report what is late, missing or breached, with the rule cited. |
| `/add-segment` | Create a segment from plain rules: customer band, orders, spend, recent engagement, tag, country. |
| `/set-segment` | Change a segment's rules (merged, or --replace). |
| `/add-campaign` | Create a campaign from a template, a subject and a segment. |
| `/set-campaign` | Change a campaign's subject, template, audience, time or goal, or cancel it. |
| `/draft-campaign` | Write a campaign brief and a rendered preview to drafts/ for the operator to read before approving. |
| `/approve` | Record the operator's approval of a campaign after they have seen the preview. |
| `/send` | Send an approved campaign. Without --live it writes the outbox (recipients and a preview) and sends nothing. |
| `/add-flow` | Create an automated flow: on sign-up, a started checkout, an order, or after a customer goes quiet. |
| `/add-step` | Add the next email to a flow, with its delay from the trigger. |
| `/set-flow` | Switch a flow on or off. |
| `/record-results` | Load delivery results from the sending provider: deliveries, opens, clicks, bounces, spam reports, unsubscribes. |
| `/add-profile` | Add one person who signed up somewhere the store does not see, like a market stall or an event. |
| `/consent` | Record that a person agreed to marketing email, how and where, with the evidence. |
| `/unsubscribe` | Record an unsubscribe and action it now, however it arrived: a reply, a phone call, a message. |
| `/tag` | Add or remove tags on a person. |
| `/add-order` | Record an order that did not come through the store import. |
| `/log-event` | Record a sign-up, a started checkout or a product view, so the flows can act on it. |
| `/settings` | The settings the views use: store currency, attribution window, frequency cap, sender details, limits. |
| `/set` | Change one setting: sender name, address, store currency, attribution days, frequency cap, limits. |
| `/activity` | The last 100 changes: who changed what, and the evidence they gave. |
| `/import` | Bring people and consent across from a Klaviyo profile export, or orders from a Shopify orders export. |
| `/export` | Export every record to JSON files the business keeps. |
| `/draft-weekly` | Save the Monday review as a markdown note in drafts/. |
| `/docs` | Render the branded documents: a report for every sent campaign, and a consent record for anyone who unsubscribed or reported spam. |
| `/view` | Render the read-only dashboards: this week, what email earned, list health. |
| `/customise` | Make this system yours in plain language. Add a field, rename stages, change a rule, add a column to a document. Writes the migration, applies it, updates the commands that touch it. |
| `/new-view` | Add a read-only HTML view (a dashboard page) from a plain-language description, rendered in the operator's brand by `npm run view`. |
| `/help` | Every CLI command. |

## Instead of Klaviyo

Export your profiles from Klaviyo and your orders from Shopify to CSV, then:

```bash
npm run email -- import klaviyo --file=imports/klaviyo-profiles.csv --actor="Your name" --dry-run
npm run email -- import klaviyo --file=imports/klaviyo-profiles.csv --actor="Your name"
npm run email -- import shopify --file=imports/orders.csv --actor="Your name"
```

Consent status, when it was given and where come across with each person. A subscription with no timestamp or source is imported and flagged by `/compliance`, never treated as proven. A changed consent stops the import until you add `--update`, and a failed import leaves nothing behind. Full steps and what does not carry over: [docs/replace-klaviyo.md](docs/replace-klaviyo.md).

## Ten questions this build answers

Each is a real command on the demo data.

1. How much of this month's store revenue came from email, and how much of that from the automated flows? `revenue`
2. What did each campaign we sent actually earn, counting only orders after a click? `results`
3. Did anyone get an email after they asked us to stop? `compliance`
4. Which unsubscribes took us longer than five working days to action? `compliance`
5. Who has bought two or more times but gone quiet for three months? `rfm --band="at risk"`
6. How many of our best customers can we actually email right now? `audience`
7. Who is due an abandoned checkout or welcome email right now, and how long have they waited? `flows-due`
8. Which flow is switched off, or on but sending nothing? `attention`
9. What is our spam-report rate over 30 days against Google's 0.3% line? `list-health`
10. Show me everything we ever sent Finn, his consent history, and when he asked to stop. `profile --profile=finn`

## Your first hour: ten things to ask for

1. Put our business name, address and colours on the emails and reports.
2. Test our Klaviyo export without saving it, then load it.
3. Load two years of Shopify orders.
4. Who on the list has no proof of consent? Draft a re-permission email for them.
5. Make a segment of everyone who bought espresso beans twice but not in 90 days.
6. Write this week's newsletter from these three product notes, in our voice.
7. Show me the preview and who gets it. I approve it; send it Thursday at 9am.
8. Switch the win-back flow on at 120 days, and tell me how many it will email.
9. Change the attribution window to three days.
10. Write the Monday note for the team.

`/customise` writes, tests and applies the database change for any of these. `/new-view` adds a read-only dashboard page. There is no application front end.

## Documents, views and record checks

Change `brand.json` once. `npm run docs` renders a report for every sent campaign and a consent record for anyone who unsubscribed or reported spam: every consent change, every request to stop and every email sent, on one page. `npm run view` renders this week, what email earned, and list health as read-only pages. Print to PDF from the browser. `/compliance` checks the rules in [docs/compliance.md](docs/compliance.md). How every number is worked out: [docs/how-it-counts.md](docs/how-it-counts.md).

## Verification

`npm test` runs every one of the 41 CLI commands on a throwaway database: attribution checked against a separate recount, customer bands, segment rules, flows due (including stop-on-order and once-in-30-days), the frequency cap, approvals that reset when the email changes, the outbox, a live send answered by a stand-in for Postmark, delivery results with unsubscribes actioned on load, the consent and unsubscribe checks, Klaviyo and Shopify imports (dry run, field map, changed consent, rollback), drafts, documents, views and escaped HTML. Nothing is sent. It passes on the embedded database and on PostgreSQL 17 (`TEST_DATABASE_URL` must name an empty, disposable database). CI defines Node 20 and 22 on Linux and Windows.

## Architecture

```
email-marketing-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/email.mjs         the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema and views
  supabase/seed.sql         demo data
  templates/                the emails, as HTML with {{placeholders}}
  docs/                     compliance, sending, how it counts, moving off Klaviyo
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Email Marketing for Claude Code for your business, brings your Klaviyo list and consent records across, connects it to your store so the flows run on time, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=klaviyo)
- Read more: [enterprisedna.co/omni/instead-of/klaviyo](https://enterprisedna.co/omni/instead-of/klaviyo?utm_source=github&utm_medium=readme&utm_campaign=klaviyo)

## License

MIT. Copyright (c) 2026 Enterprise DNA. Not affiliated with Klaviyo, Shopify, Postmark or Anthropic. Hosting, sending and agent usage have their own costs. Nothing here is legal advice.
