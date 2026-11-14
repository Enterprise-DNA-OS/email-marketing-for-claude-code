---
description: The campaign calendar: drafts, approved sends and what went out in the last fortnight.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- calendar
```

Show it in date order. Flag anything scheduled with no approval.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
