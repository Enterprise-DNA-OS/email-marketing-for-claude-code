---
description: Everything in the email program that needs a person now: unapproved sends, overdue campaigns, flows switched off or backed up, list health and compliance findings.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- attention
```

Group by issue. For each, say the one action that clears it and the command that does it.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
