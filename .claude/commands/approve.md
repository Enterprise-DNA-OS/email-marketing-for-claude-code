---
description: Record the operator's approval of a campaign after they have seen the preview.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- approve --campaign="<name>" --actor="<operator>" --evidence="<what they checked>"
```

Only when the operator says they approve this version, after /draft-campaign. The actor is the person approving, not you.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
