# Sending

The database decides who gets what. A sending provider delivers it. They are kept apart on purpose: sending is a commodity, and the decisions are the part worth owning.

## Without --live (the default)

`send` and `send-flows` write `outbox/<name>/recipients.csv` and `outbox/<name>/preview.html`, and record nothing. Use this to check the audience and the email before anything goes out, or to load the list into another tool by hand.

## With --live

The free version sends through [Postmark](https://postmarkapp.com) on a broadcast message stream:

1. Create a Postmark server and a broadcast stream, verify your sending domain (SPF, DKIM, and a DMARC record on the domain).
2. Put the server token in `.env` as `POSTMARK_SERVER_TOKEN`. Never commit it.
3. Fill in `sender_name`, `sender_email` and `postal_address` with `set`.
4. `send --campaign=... --actor=... --live`.

Every template's `{{unsubscribe_url}}` becomes Postmark's own unsubscribe placeholder unless you set `unsubscribe_link` to a page of your own. Check in Postmark's settings that its unsubscribe handling and headers are on for the stream; Google requires one-click unsubscribe from anyone sending more than 5,000 messages a day to Gmail.

Each email is recorded in `messages` with Postmark's message ID. Load the delivery results back with `record-results` from Postmark's webhook or activity export (RecordType, MessageID, ReceivedAt). Unsubscribes and spam reports are actioned the moment they load.

## Flows on a schedule

Flows need `send-flows --live` to run on a timer, every 15 to 60 minutes. A cron line on a small server does it:

```
*/15 * * * * cd /path/to/email-marketing-for-claude-code && npm run email -- send-flows --actor=scheduler --live >> flows.log 2>&1
```

Sign-ups, checkouts and orders have to reach the database for the flows to see them. The free version takes them by import (`import shopify`) or by `log-event`. A live connection to your store, so a checkout reminder goes within the hour, is part of what Enterprise DNA sets up.

## Another provider

Amazon SES, Resend, Mailgun and SendGrid all take the same inputs. The `deliver` function in `scripts/email.mjs` is about forty lines; ask Claude Code to add one, with a test that stands in for the provider the way `npm test` does for Postmark.
