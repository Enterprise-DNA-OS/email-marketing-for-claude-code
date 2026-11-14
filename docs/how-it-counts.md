# How every number is worked out

All of it is plain SQL in `supabase/migrations/0001_email_marketing.sql`. Change a rule there (or ask `/customise`) and every command, view and document follows.

## Money

Amounts are stored in cents with their currency. Customer value, campaign revenue and flow revenue count only orders in the store currency (`settings`: `store_currency`). An order in another currency is kept and shown on the person's record, but never added to a total. Refunded orders count nowhere.

## Attribution: which email gets credit for an order

An order is credited to the most recent email the person **clicked** in the `attribution_days` before the order (5 by default). Opens do not earn credit: many mail apps load images automatically, so an open is a weak signal. One order is credited to one email at most, so campaigns and flows never double count. An order with no click in the window belongs to the store, not to email.

This is a stricter rule than many platforms use. If you want opens to count, or a different window, change `v_attribution` or the setting.

## Customer bands

From orders in the store currency:

| Band | Rule |
|---|---|
| champion | 4 or more orders, the last within 60 days |
| loyal | 2 or more orders, the last within 90 days |
| new | 1 order, placed within 30 days |
| at risk | 2 or more orders, the last 90 to 180 days ago |
| lapsed | the last order more than 180 days ago |
| one-off | 1 order, 30 to 180 days ago |
| never ordered | no orders |

## Who can be emailed

Subscribed now (the latest consent row says subscribed), never bounced, never reported spam. A campaign also skips anyone who got another campaign within `frequency_cap_hours` (48 by default), and anyone who already got this one.

## Flows

Each flow has a trigger and numbered steps with a delay. A step is due when the trigger happened in the last 14 days, the delay has passed, the person can be emailed, the step before it was sent for the same trigger, and they have not had this step in the last 30 days. For sign-ups and abandoned checkouts, a step marked `stop_if_ordered` is skipped once they order. The lapsed trigger fires `lapsed_days` after the last order. Switching a flow on never reaches back past 14 days.

## Sunset candidates

Subscribed, with no open, click, order, consent or sign-up in `unengaged_days` (180 by default). Emailing them drags your sending reputation down; send them one last email asking if they want to stay, then stop.
