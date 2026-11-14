---
description: The people in one segment who can be emailed (add --all for everyone in it).
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- members --segment="<segment>"
```

Show the top of the list and the count.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
