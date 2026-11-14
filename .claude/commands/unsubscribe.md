---
description: Record an unsubscribe and action it now, however it arrived: a reply, a phone call, a message.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- unsubscribe --profile=<email> --via="<how they asked>" --requested-at=<when they asked> --actor="<name>"
```

Use the time they actually asked, not now. The result says whether it was actioned within the five working days the law allows.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
