# Research notes

Checked 14 November 2026.

- Klaviyo pricing (https://www.klaviyo.com/pricing): plans are Free (up to 250 active profiles and 500 emails a month), Email (from USD 20 a month for 500 active profiles and 5,000 emails), Marketing (from USD 25 a month) and Custom (over 150,000 active profiles, talk to sales). Prices are in USD and rise with active profiles, defined as "any contact in your database that you can market to". SMS, Composer, Customer Agent and Helpdesk are add-ons on the paid plans.
- The rules in docs/compliance.md: Spam Act 2003 (AU) ss 16, 17, 18 and Schedule 2 (clause 6 for the five business days); NZ rules from the Department of Internal Affairs guidance on the Unsolicited Electronic Messages Act 2007; Google's email sender guidelines for the 0.3% spam-rate ceiling and one-click unsubscribe above 5,000 messages a day to Gmail.
- Postmark batch API: POST https://api.postmarkapp.com/email/batch with the server token header, up to 500 messages per call, MessageStream naming a broadcast stream.
