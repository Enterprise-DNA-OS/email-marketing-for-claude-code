---
description: The Monday review: what needs a person, what goes out this week, what last week earned, and the health of the list.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- weekly-review
```

Write it as a short note: the three things to act on this week first (unapproved sends, compliance findings, flow emails piling up), then the campaigns going out, then what the last fortnight earned. Revenue is in cents of the store currency; show it as dollars.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
