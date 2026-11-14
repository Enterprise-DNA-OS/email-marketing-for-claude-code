---
description: Check the records against the Spam Act 2003 (AU), the Unsolicited Electronic Messages Act 2007 (NZ) and the bulk-sender rules in docs/compliance.md, and report what is late, missing or breached, with the rule cited.
---

Read CLAUDE.md and docs/compliance.md first.

Run:

```bash
npm run email -- compliance
npm run email -- list-health
```

1. Report as a table: rule, who or what, the finding, the source from docs/compliance.md. Breaches first (sent after an unsubscribe, sent with no consent, unsubscribe actioned late), then evidence gaps (consent with no record, inferred consent to review, sender details missing), then rates (spam reports, bounces).
2. For each finding, draft the fix the operator can approve: the unsubscribe to record with the real time they asked (`/unsubscribe`), the evidence to find or the re-permission email to draft, the setting to fill in. Draft to `drafts/`; never send.
3. For anyone a breach touches, offer `npm run docs -- consent-record` so the operator has their full record in one page.
4. If a rule in docs/compliance.md looks out of date, say so and stop. Do not guess at law. The operator confirms the rule, then you update the doc and the `v_compliance` view together.

Nothing here is legal advice. The doc records the rules the operator has told the system to check, with sources, and this command checks the data against them.
