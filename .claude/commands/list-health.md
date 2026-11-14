---
description: The list: subscribed, unsubscribed, sunset candidates, inferred consent, bounce and spam-report rates for 30 days.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- list-health
```

Compare the rates with the limits in `settings`. A spam-report rate over 0.3% puts delivery at risk with Gmail and Yahoo.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
