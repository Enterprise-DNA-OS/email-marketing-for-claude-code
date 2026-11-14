---
description: Create a campaign from a template, a subject and a segment.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve people, segments, campaigns and flows by name; if a name matches more than one, show the candidates and ask. Never invent a person, an order, a consent, a date or a result.

Run:

```bash
npm run email -- add-campaign --name="<name>" --subject="<subject>" --preheader="<preheader>" --template=<file in templates/> --segment="<segment>" --schedule=<date-time with zone> --goal="<goal>" --actor="<name>"
```

Write a new template in templates/ when needed: copy an existing one, keep {{unsubscribe_url}} and {{postal_address}} in the footer, and never prefix a noun with AI or use hype. Then run /draft-campaign so the operator sees it.

Never run `--live` without the operator's yes in this session naming the campaign or flow. Never delete records. Never change another system.
