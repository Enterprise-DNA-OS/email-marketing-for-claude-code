---
description: Create a segment from plain rules: customer band, orders, spend, recent engagement, tag, country.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- add-segment --name="<name>" --band="at risk,lapsed" --not-engaged-within-days=90 --actor="<name>"
```

Turn the operator's words into rules, say the rules back in plain language and the number of people it holds, then create it.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
