---
description: Add one person who signed up somewhere the store does not see, like a market stall or an event.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- add-profile --email=<email> --first-name=<name> --source="<where>" --actor="<name>"
```

Adding a person is not consent. Record consent separately with /consent, with the evidence.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
