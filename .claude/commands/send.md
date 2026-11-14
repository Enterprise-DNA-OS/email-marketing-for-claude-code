---
description: Send an approved campaign. Without --live it writes the outbox (recipients and a preview) and sends nothing.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- send --campaign="<name>" --actor="<name>"
npm run email -- send --campaign="<name>" --actor="<name>" --live
```

Always run without `--live` first and report who would get it and who the frequency cap holds back. Send live only when the operator says "send it" in this session. Needs POSTMARK_SERVER_TOKEN in .env.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
