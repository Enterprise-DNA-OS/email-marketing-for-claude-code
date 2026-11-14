---
description: Change one setting: sender name, address, store currency, attribution days, frequency cap, limits.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- set --key=<key> --value="<value>" --actor="<name>" --evidence="<why>"
```

Say what the change does to the numbers before making it.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
