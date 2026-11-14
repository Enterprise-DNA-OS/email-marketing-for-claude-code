---
description: Who is due which flow email right now: welcome, abandoned checkout, post-purchase, win-back.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- flows-due
```

If emails have been due for more than a few hours, the scheduled send-flows job has probably stopped: say so.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
