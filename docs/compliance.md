# Consent, unsubscribe and sender rules, with sources

`npm run email -- compliance` checks the records against the rules below. Each rule has a name, what a finding looks like in the data, and where the rule comes from. The checks live in the `v_compliance` view in `supabase/migrations/0001_email_marketing.sql`; change this file and the view together.

Nothing here is legal advice. It records the rules this system checks, with the source for each, so a person can read the source and decide. Check the current law at the source before relying on it.

## The checks

| Rule | What the check finds | Source |
|---|---|---|
| SENT-WITHOUT-CONSENT | An email went to someone with no subscribed consent on record at the time it was sent. | AU: Spam Act 2003, s16 (unsolicited commercial electronic messages must not be sent; the exception in s16(2) is consent). NZ: DIA guidance on the Unsolicited Electronic Messages Act 2007 (the sender must have consent, and the onus of proving it is on the sender). |
| CONSENT-NO-EVIDENCE | Someone is marked subscribed, but the record does not say how or where they agreed. | Same as above. Consent you cannot show is consent you cannot rely on: the sender carries the burden of proof (DIA FAQ, citing section 9(3) of the NZ Act). |
| CONSENT-INFERRED | Consent was inferred, not given, more than a year ago. Inferred consent only holds in narrow cases (an existing business or other relationship, or a conspicuously published business address relevant to the message). | AU: Spam Act 2003, Schedule 2 (consent: express, or reasonably inferred from conduct and business or other relationships; clause 4 on published addresses). NZ: DIA guidance (express, inferred and deemed consent). This is a prompt to review, not a breach. |
| UNSUB-LATE | An unsubscribe was actioned more than five working days after the person asked. | AU: Spam Act 2003, Schedule 2 clause 6 (withdrawal of consent takes effect at the end of five business days). NZ: DIA FAQ (honour an unsubscribe within five working days; the clock starts the day after the request). |
| SENT-AFTER-UNSUB | An email went to someone after they asked to stop, with no fresh consent since. | Same as above. Once the period has run, every further marketing email is sent without consent. |
| SENDER-ID | The sender name, sender address or contact address setting is empty. Every template must carry `{{postal_address}}` and `{{unsubscribe_url}}`, and the CLI refuses a template without them. | AU: Spam Act 2003, s17 (accurate sender information, valid for at least 30 days) and s18 (a functional unsubscribe facility, able to receive requests for at least 30 days). NZ: DIA guidance (say clearly and accurately who you are; a functional unsubscribe facility for at least 30 days). |
| COMPLAINT-RATE | More than 0.3% of the emails sent in the last 30 days were reported as spam. | Google email sender guidelines: keep the spam rate reported in Postmaster Tools below 0.3%, aim for below 0.1%. Senders of more than 5,000 messages a day to Gmail must also authenticate (SPF, DKIM, DMARC) and support one-click unsubscribe. |

The bounce-rate line in `list-health` (2% by default) is a house rule, not a law. Change it with `set --key=bounce_rate_limit_pct`.

## Working days

`working_days_between` counts Monday to Friday. It does not know public holidays, so around Christmas, Easter or a regional anniversary day it can count a holiday as a working day. That errs on the strict side: a finding near a holiday may be a day early. Action every unsubscribe the day it arrives and the question never comes up.

## Sources

- Spam Act 2003 (Australia), compilation on the Federal Register of Legislation: https://www.legislation.gov.au/C2004A01214/latest/text
- ACMA, avoid sending spam: https://www.acma.gov.au/avoid-sending-spam
- Unsolicited Electronic Messages Act 2007 (New Zealand): https://www.legislation.govt.nz/act/public/2007/0007/latest/whole.html
- Department of Internal Affairs, NZ spam law for businesses: https://www.dia.govt.nz/Spam-NZ-Spam-Law-for-Businesses and the FAQ: https://www.dia.govt.nz/Spam-Frequently-Asked-Questions
- Google, email sender guidelines: https://support.google.com/a/answer/81126
- Privacy: the OAIC's guidance on Australian Privacy Principle 7, direct marketing: https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-7-app-7-direct-marketing, and the NZ Privacy Commissioner: https://www.privacy.org.nz

Sources checked 14 November 2026. The NZ section numbers are not given here because the legislation site could not be read when this was written; the rules are cited from the Department of Internal Affairs guidance instead.

## What this system does and does not do

It keeps consent as a history that is never overwritten, records every unsubscribe with the time the person asked and the time it was actioned, refuses to send a campaign that has not been approved by a named person, refuses a template without an unsubscribe link and a contact address, and never emails anyone who bounced or reported spam. It has no delete command and exports every record to JSON.

It cannot check that your sign-up forms collect consent properly, that your sending provider's unsubscribe link works, or that your domain is authenticated. Check those yourself, once, and again whenever you change provider.
