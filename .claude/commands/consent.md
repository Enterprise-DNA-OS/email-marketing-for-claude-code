---
description: Record that a person agreed to marketing email, how and where, with the evidence.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- consent --profile=<email> --status=subscribed --kind=express|inferred --source="<where>" --evidence="<what proves it>" --actor="<name>"
```

Express is a person saying yes. Inferred is only for the narrow cases the law allows; see docs/compliance.md. Never record consent without evidence the operator gives you.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
