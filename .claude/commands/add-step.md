---
description: Add the next email to a flow, with its delay from the trigger.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- add-step --flow="<flow>" --delay-hours=24 --subject="<subject>" --template=<file> --actor="<name>"
```

Steps stop once the person orders, unless --keep-if-ordered.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
