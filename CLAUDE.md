# Email Marketing for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a person, read their full record first (`/profile`).
3. **Plain language.** Short sentences. No filler. Numbers in tables, money in dollars.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| "What needs me this week?", the Monday review | `/weekly-review` |
| "What is overdue or stuck?" | `/attention` |
| What is going out and when | `/calendar` |
| What a campaign did | `/results` |
| How much revenue came from email | `/revenue` |
| How the flows are doing | `/flows` |
| Who is due a flow email now | `/flows-due` |
| Send the flow emails that are due | `/send-flows` |
| Bounces, spam reports, quiet subscribers | `/list-health` |
| Best, at-risk and lapsed customers | `/rfm` |
| How big is each segment | `/audience` |
| Who is in a segment | `/members` |
| The segments and their rules | `/segments` |
| Every campaign | `/campaigns` |
| Everyone on the list | `/profiles` |
| Everything about one person | `/profile` |
| Consent and unsubscribe checks | `/compliance` |
| A new segment | `/add-segment` |
| Change a segment | `/set-segment` |
| A new campaign or email | `/add-campaign` |
| Change or cancel a campaign | `/set-campaign` |
| Show me the email before it goes | `/draft-campaign` |
| "I approve it" | `/approve` |
| Send a campaign | `/send` |
| A new flow | `/add-flow` |
| Another email in a flow | `/add-step` |
| Switch a flow on or off | `/set-flow` |
| Load opens, clicks, bounces, unsubscribes | `/record-results` |
| Add someone by hand | `/add-profile` |
| Record that someone said yes | `/consent` |
| Someone asked to stop | `/unsubscribe` |
| Tag people | `/tag` |
| An order outside the store import | `/add-order` |
| A sign-up, checkout or product view | `/log-event` |
| The settings | `/settings` |
| Change a setting, sender details | `/set` |
| Who changed what | `/activity` |
| Bring data across from Klaviyo or Shopify | `/import` |
| Take every record out | `/export` |
| Save the Monday review as a draft | `/draft-weekly` |
| Campaign reports, consent records | `/docs` |
| Read-only dashboards | `/view` |
| Change a field, band or rule | `/customise` |
| A new dashboard page | `/new-view` |
| Every CLI command | `/help` |

If an ask fits nothing here, run the CLI directly (`npm run email -- help`) and then propose a new command for it.

## Hard rules

- Never run `send --live` or `send-flows --live` without the operator's yes in this session naming the campaign or flow. The one exception is a scheduled `send-flows` job the operator set up themselves.
- Approval is the operator's. Record `approve` only when they say they approve this version, with their name as the actor. Changing an approved email sends it back to draft.
- Never record consent without evidence the operator gives you. Never mark someone subscribed because they bought something unless the store recorded that they said yes.
- Record an unsubscribe the moment you hear of one, with the time the person asked, however it arrived.
- Every email carries the unsubscribe link and the contact address. Never remove `{{unsubscribe_url}}` or `{{postal_address}}` from a template.
- Email copy: no em dashes, no hype, never prefix a noun with "AI", no false urgency. Say what is on offer and when it ends.
- Never add currencies together.
- Never delete records without an explicit yes in this session. Prefer cancelling or unsubscribing.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.

## Where things live

- `scripts/email.mjs` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema and views, plain SQL. `npm run migrate` applies it.
- `templates/` the emails. `outbox/` what would be sent. `drafts/` briefs and previews.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` compliance with sources, how every number is counted, sending, and moving off Klaviyo.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/klaviyo
