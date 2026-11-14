---
description: Switch a flow on or off.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- set-flow --flow="<flow>" --active=on|off --actor="<name>" --evidence="<why>"
```

Switching on only picks up triggers from the last 14 days. Report how many emails become due.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
