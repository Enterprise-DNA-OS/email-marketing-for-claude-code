---
description: Every segment with how many people are in it, how many are subscribed and how many can be emailed now.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- audience
```

"Can email" leaves out anyone unsubscribed, bounced or who reported spam.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
