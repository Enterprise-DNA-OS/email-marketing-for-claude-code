---
description: One person in full: details, consent history, orders and every email they got.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- profile --profile="<email or name>"
```

Read the whole consent history before saying whether they can be emailed.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
