# Moving off Klaviyo

Plan on a day. Most of it is checking, not typing.

## 1. Export your people from Klaviyo

Export your full list (or an all-profiles segment) to CSV. Include email, first and last name, phone, city, country, and the email marketing consent fields: the consent status, when it was given and where. The importer reads these column names by default:

| Our field | Column names it looks for |
|---|---|
| email | Email, Email Address |
| first_name, last_name | First Name, Last Name |
| consent | Email Marketing Consent, Email Consent, Consent, Subscribed |
| consent_at | Email Marketing Consent Timestamp, Email Consent Timestamp, Consent Timestamp |
| consent_source | Email Marketing Consent Source, Consent Source, Source |
| created | Profile Created On, Created, Date Added |
| external_id | Klaviyo ID, Profile ID, Id |

If your file uses other names, copy `fixtures/field-map.json`, put your headers in it, and pass `--map`. Consent values `SUBSCRIBED`, `UNSUBSCRIBED` and `NEVER_SUBSCRIBED` (and yes, no, true, false) are understood; anything else stops the import with the value named.

```bash
npm run email -- import klaviyo --file=imports/klaviyo-profiles.csv --actor="Your name" --dry-run
npm run email -- import klaviyo --file=imports/klaviyo-profiles.csv --actor="Your name"
```

The dry run reports people created, consents recorded, unchanged and skipped, then rolls back. A person whose consent differs from what is already here stops the import until you add `--update`. A failed import leaves nothing behind.

## 2. Export your orders from Shopify

In Shopify admin, export orders to CSV (all orders, or the last two years). One row per line item is fine: rows are grouped by order number.

```bash
npm run email -- import shopify --file=imports/orders.csv --actor="Your name" --dry-run
npm run email -- import shopify --file=imports/orders.csv --actor="Your name"
```

Voided orders are skipped and listed. Refunded orders are kept and left out of every total. A buyer not yet on the list is added; if the order says Accepts Marketing and they have no consent on record, that is recorded as their consent, with the order number as evidence.

Not on Shopify? Any order export with an order number, email, date with time zone, total and currency maps the same way with `--map`.

## 3. Check what came across

```bash
npm run email -- compliance
npm run email -- list-health
npm run email -- rfm
```

Expect `CONSENT-NO-EVIDENCE` findings for anyone whose export had no consent timestamp or source. That is the importer being honest, not an error: decide whether to find the evidence or send them a re-permission email.

## 4. Rebuild segments, campaigns and flows

Describe each Klaviyo segment and flow to Claude Code in plain words; it writes the rules (`/add-segment`) and the steps (`/add-flow`, `/add-step`). Copy the HTML of the emails you want to keep into `templates/`, add `{{unsubscribe_url}}` and `{{postal_address}}` to the footer, and preview each with `/draft-campaign`.

## 5. Switch sending over

Set up Postmark (docs/sending.md), send one campaign to a test segment, then switch the flows on here and off in Klaviyo on the same day, so nobody gets two welcome emails.

## What does not carry over

- **Past campaign results and flow history.** Klaviyo keeps your opens, clicks and attributed revenue. Export the reports you want to keep before you close the account; results here start from your first send.
- **Klaviyo's predicted fields** (predicted lifetime value, churn risk, next order date). The customer bands here are plain rules you can read and change.
- **Hosted sign-up forms.** Point your website's forms at your own database instead (part of what Enterprise DNA sets up).
- **SMS subscribers.** SMS consent is a separate permission and is not imported.
- **Website activity tracking** (viewed product, active on site). Events arrive by import or a store connection.
