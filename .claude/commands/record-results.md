---
description: Load delivery results from the sending provider: deliveries, opens, clicks, bounces, spam reports, unsubscribes.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- record-results --file=<csv> --actor="<name>" --dry-run
npm run email -- record-results --file=<csv> --actor="<name>"
```

Unsubscribes and spam reports are actioned on load, with the time the person asked. Report anything unmatched.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
