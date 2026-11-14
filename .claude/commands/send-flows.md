---
description: Send the flow emails that are due. Without --live it writes the outbox only.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- send-flows --actor="<name>"
npm run email -- send-flows --actor="<name>" --live
```

Run without `--live` first and report how many per flow. Run `--live` only when the operator says so, or when this is the scheduled job they set up. Needs POSTMARK_SERVER_TOKEN in .env.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
