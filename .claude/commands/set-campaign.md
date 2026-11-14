---
description: Change a campaign's subject, template, audience, time or goal, or cancel it.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- set-campaign --campaign="<name>" --schedule=<date-time with zone> --actor="<name>"
```

Changing what goes out on an approved campaign sends it back to draft; say so.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
