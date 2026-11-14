---
description: Record a sign-up, a started checkout or a product view, so the flows can act on it.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- log-event --profile=<email> --kind=checkout_started --value=<amount> --ref=<checkout id> --actor="<name>"
```

Usually the scheduled store sync does this; use it by hand to test a flow.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
