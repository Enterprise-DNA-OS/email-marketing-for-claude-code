---
description: Create an automated flow: on sign-up, a started checkout, an order, or after a customer goes quiet.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- add-flow --name="<name>" --trigger=signed_up|checkout_started|order_placed|lapsed [--lapsed-days=120] --description="<what it is for>" --actor="<name>"
```

Flows start switched off. Add steps, then switch it on with /set-flow.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
