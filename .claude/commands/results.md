---
description: What each sent campaign did: delivered, opens, clicks, bounces, spam reports, unsubscribes, and the orders and revenue credited to it.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- results
```

Explain the attribution rule once (an order within the attribution window after a click; see docs/how-it-counts.md). Opens are a weak signal since mail apps preload images; lean on clicks and orders.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
