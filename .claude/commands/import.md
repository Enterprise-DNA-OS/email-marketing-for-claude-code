---
description: Bring people and consent across from a Klaviyo profile export, or orders from a Shopify orders export.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- import klaviyo --file=<csv> --actor="<name>" --dry-run
npm run email -- import shopify --file=<csv> --actor="<name>" --dry-run
npm run email -- import klaviyo --file=<csv> --actor="<name>" [--map=<field-map>] [--update]
```

Read docs/replace-klaviyo.md first. Inspect the real headers; if they differ, write a field map (see fixtures/field-map.json). Always dry-run first and report created, consents, unchanged and skipped. A changed consent stops the import until the operator adds --update. Subscriptions with no timestamp are imported and flagged by /compliance, never treated as proven.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
