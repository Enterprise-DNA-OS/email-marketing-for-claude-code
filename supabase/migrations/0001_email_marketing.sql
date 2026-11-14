-- Email Marketing for Claude Code: the schema.
-- Plain Postgres. Runs on PostgreSQL 15+ and on embedded PGlite.
-- Money is stored in cents (bigint) with its currency on the row. Currencies are never added together.

CREATE TABLE settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  note text
);

CREATE TABLE profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  first_name text,
  last_name text,
  phone text,
  city text,
  country text,
  tags text[] NOT NULL DEFAULT '{}',
  source text,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
CREATE UNIQUE INDEX profiles_email ON profiles (lower(email));

-- Consent is a history, never overwritten. The latest row per profile is the current state.
CREATE TABLE consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id),
  status text NOT NULL CHECK (status IN ('subscribed', 'unsubscribed')),
  kind text CHECK (kind IN ('express', 'inferred')),
  source text,
  evidence text,
  actor text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'unsubscribed' OR kind IS NOT NULL)
);
CREATE INDEX consents_profile ON consents (profile_id, recorded_at DESC);

CREATE TABLE unsubscribe_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id),
  requested_at timestamptz NOT NULL,
  via text NOT NULL,
  actioned_at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id),
  order_ref text NOT NULL UNIQUE,
  placed_at timestamptz NOT NULL,
  total_cents bigint NOT NULL CHECK (total_cents >= 0),
  currency text NOT NULL,
  items integer,
  discount_code text,
  refunded boolean NOT NULL DEFAULT false,
  source text
);
CREATE INDEX orders_profile ON orders (profile_id, placed_at);

-- What people did: signed up, started a checkout, viewed a product. Orders live in orders.
CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id),
  kind text NOT NULL CHECK (kind IN ('signed_up', 'checkout_started', 'viewed_product')),
  occurred_at timestamptz NOT NULL,
  value_cents bigint,
  currency text,
  detail text,
  ref text
);
CREATE INDEX events_kind ON events (kind, occurred_at);

CREATE TABLE segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  rules jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX segments_name ON segments (lower(name));

CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL,
  preheader text,
  template text NOT NULL,
  segment_id uuid REFERENCES segments(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sent', 'cancelled')),
  scheduled_for timestamptz,
  approved_by text,
  approved_at timestamptz,
  sent_at timestamptz,
  goal text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX campaigns_name ON campaigns (lower(name));

CREATE TABLE flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger text NOT NULL CHECK (trigger IN ('signed_up', 'checkout_started', 'order_placed', 'lapsed')),
  lapsed_days integer CHECK (lapsed_days IS NULL OR lapsed_days > 0),
  active boolean NOT NULL DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (trigger <> 'lapsed' OR lapsed_days IS NOT NULL)
);
CREATE UNIQUE INDEX flows_name ON flows (lower(name));

CREATE TABLE flow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES flows(id),
  step_no integer NOT NULL CHECK (step_no > 0),
  delay_hours integer NOT NULL CHECK (delay_hours >= 0),
  subject text NOT NULL,
  template text NOT NULL,
  stop_if_ordered boolean NOT NULL DEFAULT true,
  UNIQUE (flow_id, step_no)
);

-- One row per email to one person, from a campaign or a flow step.
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id),
  campaign_id uuid REFERENCES campaigns(id),
  flow_step_id uuid REFERENCES flow_steps(id),
  trigger_ref text,
  sent_at timestamptz NOT NULL,
  provider_id text,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  unsubscribed_at timestamptz,
  CHECK ((campaign_id IS NULL) <> (flow_step_id IS NULL))
);
CREATE UNIQUE INDEX messages_campaign_once ON messages (campaign_id, profile_id) WHERE campaign_id IS NOT NULL;
CREATE UNIQUE INDEX messages_flow_once ON messages (flow_step_id, profile_id, trigger_ref) WHERE flow_step_id IS NOT NULL;
CREATE INDEX messages_profile ON messages (profile_id, sent_at);

CREATE TABLE activity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  ref text,
  actor text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  evidence text
);

CREATE TABLE imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  file_name text NOT NULL,
  file_sha256 text NOT NULL,
  actor text NOT NULL,
  summary jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER segments_touch BEFORE UPDATE ON segments FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER campaigns_touch BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER flows_touch BEFORE UPDATE ON flows FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Settings the views read. Change them with `set`.
INSERT INTO settings(key, value, note) VALUES
  ('store_currency', 'NZD', 'Orders in this currency count towards customer value and attributed revenue'),
  ('attribution_days', '5', 'An order within this many days of a click on an email is credited to that email'),
  ('unengaged_days', '180', 'No open, click or order for this long and a subscriber is a sunset candidate'),
  ('frequency_cap_hours', '48', 'Nobody gets a second campaign within this many hours of the last one'),
  ('unsubscribe_working_days', '5', 'AU Spam Act 2003, Schedule 2 clause 6: five business days. NZ DIA guidance on the UEMA 2007: five working days'),
  ('complaint_rate_limit_pct', '0.3', 'Google email sender guidelines: keep reported spam below 0.3%, and aim for 0.1%'),
  ('bounce_rate_limit_pct', '2', 'House rule: a bounce rate above this needs list cleaning'),
  ('sender_name', '', 'The business name every email is sent from'),
  ('sender_email', '', 'The address every email is sent from'),
  ('postal_address', '', 'How a recipient can contact the sender; printed in every footer');

-- ------------------------------------------------------------------ views

CREATE VIEW v_setting AS
SELECT
  (SELECT value FROM settings WHERE key = 'store_currency') AS store_currency,
  (SELECT value::int FROM settings WHERE key = 'attribution_days') AS attribution_days,
  (SELECT value::int FROM settings WHERE key = 'unengaged_days') AS unengaged_days,
  (SELECT value::int FROM settings WHERE key = 'frequency_cap_hours') AS frequency_cap_hours,
  (SELECT value::int FROM settings WHERE key = 'unsubscribe_working_days') AS unsubscribe_working_days,
  (SELECT value::numeric FROM settings WHERE key = 'complaint_rate_limit_pct') AS complaint_rate_limit_pct,
  (SELECT value::numeric FROM settings WHERE key = 'bounce_rate_limit_pct') AS bounce_rate_limit_pct;

CREATE VIEW v_consent AS
SELECT DISTINCT ON (c.profile_id)
  c.profile_id, c.status, c.kind, c.source, c.evidence, c.recorded_at
FROM consents c
ORDER BY c.profile_id, c.recorded_at DESC, c.id;

-- One row per profile: consent, orders in the store currency, engagement.
CREATE VIEW v_customer AS
SELECT
  p.id AS profile_id, p.email, p.first_name, p.last_name, p.country, p.tags, p.created_at,
  coalesce(c.status, 'never') AS consent, c.kind AS consent_kind, c.recorded_at AS consent_at,
  coalesce(o.orders, 0) AS orders,
  coalesce(o.spend_cents, 0) AS spend_cents,
  s.store_currency AS currency,
  o.first_order_at, o.last_order_at,
  m.last_open_at, m.last_click_at, m.last_sent_at, m.bounced, m.complained,
  greatest(m.last_open_at, m.last_click_at, o.last_order_at, c.recorded_at, p.created_at) AS last_engaged_at
FROM profiles p
CROSS JOIN v_setting s
LEFT JOIN v_consent c ON c.profile_id = p.id
LEFT JOIN LATERAL (
  SELECT count(*) AS orders, sum(total_cents) AS spend_cents, min(placed_at) AS first_order_at, max(placed_at) AS last_order_at
  FROM orders WHERE profile_id = p.id AND NOT refunded AND currency = s.store_currency
) o ON true
LEFT JOIN LATERAL (
  SELECT max(opened_at) AS last_open_at, max(clicked_at) AS last_click_at, max(sent_at) AS last_sent_at,
         bool_or(bounced_at IS NOT NULL) AS bounced, bool_or(complained_at IS NOT NULL) AS complained
  FROM messages WHERE profile_id = p.id
) m ON true;

-- Customer value bands from recency, frequency and spend. Plain rules, written down in docs/how-it-counts.md.
CREATE VIEW v_rfm AS
SELECT
  v.*,
  CASE WHEN v.last_order_at IS NULL THEN NULL ELSE (current_date - v.last_order_at::date) END AS days_since_order,
  CASE
    WHEN v.orders = 0 THEN 'never ordered'
    WHEN v.orders >= 4 AND v.last_order_at >= now() - interval '60 days' THEN 'champion'
    WHEN v.orders >= 2 AND v.last_order_at >= now() - interval '90 days' THEN 'loyal'
    WHEN v.orders = 1 AND v.first_order_at >= now() - interval '30 days' THEN 'new'
    WHEN v.orders >= 2 AND v.last_order_at < now() - interval '90 days' AND v.last_order_at >= now() - interval '180 days' THEN 'at risk'
    WHEN v.last_order_at < now() - interval '180 days' THEN 'lapsed'
    ELSE 'one-off'
  END AS band
FROM v_customer v;

-- Every order credited to the most recent email clicked within the attribution window before it.
CREATE VIEW v_attribution AS
SELECT o.id AS order_id, o.order_ref, o.profile_id, o.placed_at, o.total_cents, o.currency,
       a.message_id, a.campaign_id, a.flow_id
FROM orders o
CROSS JOIN v_setting s
JOIN LATERAL (
  SELECT m.id AS message_id, m.campaign_id, fs.flow_id
  FROM messages m LEFT JOIN flow_steps fs ON fs.id = m.flow_step_id
  WHERE m.profile_id = o.profile_id AND m.clicked_at IS NOT NULL
    AND m.clicked_at <= o.placed_at AND m.clicked_at > o.placed_at - make_interval(days => s.attribution_days)
  ORDER BY m.clicked_at DESC LIMIT 1
) a ON true
WHERE NOT o.refunded;

CREATE VIEW v_campaign_results AS
SELECT
  c.id AS campaign_id, c.name AS campaign, c.status, c.sent_at,
  count(m.id) AS sent,
  count(m.delivered_at) AS delivered,
  count(m.opened_at) AS opened,
  count(m.clicked_at) AS clicked,
  count(m.bounced_at) AS bounced,
  count(m.complained_at) AS complained,
  count(m.unsubscribed_at) AS unsubscribed,
  CASE WHEN count(m.delivered_at) > 0 THEN round(100.0 * count(m.opened_at) / count(m.delivered_at), 1) END AS open_pct,
  CASE WHEN count(m.delivered_at) > 0 THEN round(100.0 * count(m.clicked_at) / count(m.delivered_at), 1) END AS click_pct,
  CASE WHEN count(m.id) > 0 THEN round(100.0 * count(m.complained_at) / count(m.id), 2) END AS complaint_pct,
  (SELECT count(*) FROM v_attribution a WHERE a.campaign_id = c.id AND a.currency = s.store_currency) AS orders,
  (SELECT coalesce(sum(a.total_cents), 0) FROM v_attribution a WHERE a.campaign_id = c.id AND a.currency = s.store_currency) AS revenue_cents,
  s.store_currency AS currency
FROM campaigns c
CROSS JOIN v_setting s
LEFT JOIN messages m ON m.campaign_id = c.id
WHERE c.status = 'sent'
GROUP BY c.id, s.store_currency;

CREATE VIEW v_flow_health AS
SELECT
  f.id AS flow_id, f.name AS flow, f.trigger, f.active,
  (SELECT count(*) FROM flow_steps fs WHERE fs.flow_id = f.id) AS steps,
  count(m.id) FILTER (WHERE m.sent_at >= now() - interval '30 days') AS sent_30d,
  count(m.clicked_at) FILTER (WHERE m.sent_at >= now() - interval '30 days') AS clicked_30d,
  (SELECT count(*) FROM v_attribution a WHERE a.flow_id = f.id AND a.placed_at >= now() - interval '30 days' AND a.currency = s.store_currency) AS orders_30d,
  (SELECT coalesce(sum(a.total_cents), 0) FROM v_attribution a WHERE a.flow_id = f.id AND a.placed_at >= now() - interval '30 days' AND a.currency = s.store_currency) AS revenue_30d_cents,
  s.store_currency AS currency,
  max(m.sent_at) AS last_sent_at
FROM flows f
CROSS JOIN v_setting s
LEFT JOIN flow_steps fs ON fs.flow_id = f.id
LEFT JOIN messages m ON m.flow_step_id = fs.id
GROUP BY f.id, s.store_currency;

-- The moment each person entered each flow. trigger_ref keeps one entry per trigger.
CREATE VIEW v_flow_triggers AS
SELECT f.id AS flow_id, e.profile_id, e.occurred_at AS triggered_at, 'event:' || e.id AS trigger_ref
FROM flows f JOIN events e ON e.kind = f.trigger
WHERE f.trigger IN ('signed_up', 'checkout_started')
UNION ALL
SELECT f.id, o.profile_id, o.placed_at, 'order:' || o.id
FROM flows f JOIN orders o ON NOT o.refunded
WHERE f.trigger = 'order_placed'
UNION ALL
SELECT f.id, v.profile_id, v.last_order_at + make_interval(days => f.lapsed_days), 'lapsed:' || to_char(v.last_order_at, 'YYYYMMDDHH24MISS')
FROM flows f JOIN v_customer v ON v.last_order_at IS NOT NULL
WHERE f.trigger = 'lapsed';

-- Who is due which flow email now. Only triggers in the last 14 days, so switching a flow on never emails old history.
CREATE VIEW v_flows_due AS
SELECT DISTINCT ON (fs.id, p.id) f.name AS flow, fs.step_no, fs.subject, fs.template, fs.id AS flow_step_id,
       p.id AS profile_id, p.email, p.first_name, t.trigger_ref, t.triggered_at,
       t.triggered_at + make_interval(hours => fs.delay_hours) AS due_at
FROM flows f
JOIN flow_steps fs ON fs.flow_id = f.id
JOIN v_flow_triggers t ON t.flow_id = f.id
JOIN profiles p ON p.id = t.profile_id
JOIN v_consent c ON c.profile_id = p.id AND c.status = 'subscribed'
WHERE f.active
  AND t.triggered_at >= now() - interval '14 days'
  AND t.triggered_at + make_interval(hours => fs.delay_hours) <= now()
  AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.flow_step_id = fs.id AND m.profile_id = p.id AND m.trigger_ref = t.trigger_ref)
  -- Nobody gets the same flow email twice in 30 days, however often they trigger it.
  AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.flow_step_id = fs.id AND m.profile_id = p.id AND m.sent_at > now() - interval '30 days')
  AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.profile_id = p.id AND (m.bounced_at IS NOT NULL OR m.complained_at IS NOT NULL))
  AND (fs.step_no = 1 OR EXISTS (
        SELECT 1 FROM messages m JOIN flow_steps prev ON prev.id = m.flow_step_id
        WHERE prev.flow_id = f.id AND prev.step_no = fs.step_no - 1 AND m.profile_id = p.id AND m.trigger_ref = t.trigger_ref))
  -- A lapsed trigger moves with every new order, so only sign-ups and checkouts need the order check.
  AND NOT (fs.stop_if_ordered AND f.trigger IN ('signed_up', 'checkout_started') AND EXISTS (
        SELECT 1 FROM orders o WHERE o.profile_id = p.id AND NOT o.refunded AND o.placed_at > t.triggered_at))
-- One email per person per step: the latest trigger wins.
ORDER BY fs.id, p.id, t.triggered_at DESC;

CREATE VIEW v_list_health AS
SELECT
  count(*) FILTER (WHERE consent = 'subscribed') AS subscribed,
  count(*) FILTER (WHERE consent = 'unsubscribed') AS unsubscribed,
  count(*) FILTER (WHERE consent = 'never') AS no_consent,
  count(*) FILTER (WHERE consent = 'subscribed' AND last_engaged_at < now() - make_interval(days => (SELECT unengaged_days FROM v_setting))) AS sunset_candidates,
  count(*) FILTER (WHERE consent = 'subscribed' AND consent_kind = 'inferred') AS inferred_consent,
  (SELECT count(*) FROM messages WHERE sent_at >= now() - interval '30 days') AS sent_30d,
  (SELECT round(100.0 * count(bounced_at) / nullif(count(*), 0), 2) FROM messages WHERE sent_at >= now() - interval '30 days') AS bounce_pct_30d,
  (SELECT round(100.0 * count(complained_at) / nullif(count(*), 0), 2) FROM messages WHERE sent_at >= now() - interval '30 days') AS complaint_pct_30d
FROM v_customer;

-- Weekdays between two moments, Monday to Friday. Public holidays are not counted out: see docs/compliance.md.
CREATE FUNCTION working_days_between(a timestamptz, b timestamptz) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT count(*)::int FROM generate_series(a::date + 1, b::date, interval '1 day') d WHERE extract(isodow FROM d) < 6
$$;

CREATE VIEW v_compliance AS
SELECT 'UNSUB-LATE' AS rule, p.email AS ref,
       'Unsubscribe asked for ' || to_char(u.requested_at, 'YYYY-MM-DD') || ' (' || u.via || '), actioned ' || to_char(u.actioned_at, 'YYYY-MM-DD') || ': ' || working_days_between(u.requested_at, u.actioned_at) || ' working days' AS finding
FROM unsubscribe_requests u JOIN profiles p ON p.id = u.profile_id
WHERE working_days_between(u.requested_at, u.actioned_at) > (SELECT unsubscribe_working_days FROM v_setting)
UNION ALL
SELECT 'SENT-AFTER-UNSUB', p.email,
       coalesce(c.name, 'a flow email') || ' sent ' || to_char(m.sent_at, 'YYYY-MM-DD') || ', after an unsubscribe on ' || to_char(u.requested_at, 'YYYY-MM-DD')
FROM messages m JOIN profiles p ON p.id = m.profile_id
JOIN unsubscribe_requests u ON u.profile_id = m.profile_id AND u.requested_at < m.sent_at
LEFT JOIN campaigns c ON c.id = m.campaign_id
WHERE NOT EXISTS (SELECT 1 FROM consents k WHERE k.profile_id = m.profile_id AND k.status = 'subscribed' AND k.recorded_at > u.requested_at AND k.recorded_at < m.sent_at)
UNION ALL
SELECT 'SENT-WITHOUT-CONSENT', p.email,
       coalesce(c.name, 'a flow email') || ' sent ' || to_char(m.sent_at, 'YYYY-MM-DD') || ' with no subscribed consent on record at that time'
FROM messages m JOIN profiles p ON p.id = m.profile_id
LEFT JOIN campaigns c ON c.id = m.campaign_id
WHERE NOT EXISTS (SELECT 1 FROM consents k WHERE k.profile_id = m.profile_id AND k.status = 'subscribed' AND k.recorded_at <= m.sent_at)
UNION ALL
SELECT 'CONSENT-NO-EVIDENCE', v.email, 'Subscribed with no record of how or where consent was given'
FROM v_consent c JOIN profiles v ON v.id = c.profile_id
WHERE c.status = 'subscribed' AND (coalesce(trim(c.source), '') = '' OR coalesce(trim(c.evidence), '') = '')
UNION ALL
SELECT 'CONSENT-INFERRED', v.email, 'Consent inferred (' || coalesce(c.source, 'no source') || ') on ' || to_char(c.recorded_at, 'YYYY-MM-DD') || ': check it still fits the law''s tests, or ask for express consent'
FROM v_consent c JOIN profiles v ON v.id = c.profile_id
WHERE c.status = 'subscribed' AND c.kind = 'inferred' AND c.recorded_at < now() - interval '365 days'
UNION ALL
SELECT 'SENDER-ID', s.key, 'Setting ' || s.key || ' is empty: every email must say who sent it and how to contact them'
FROM settings s WHERE s.key IN ('sender_name', 'sender_email', 'postal_address') AND trim(s.value) = ''
UNION ALL
SELECT 'COMPLAINT-RATE', 'last 30 days', 'Reported as spam: ' || h.complaint_pct_30d || '% of ' || h.sent_30d || ' emails, over the ' || (SELECT complaint_rate_limit_pct FROM v_setting) || '% limit'
FROM v_list_health h WHERE h.complaint_pct_30d > (SELECT complaint_rate_limit_pct FROM v_setting);

CREATE VIEW v_calendar AS
SELECT c.name AS campaign, c.status, c.scheduled_for, c.subject, s.name AS segment, c.approved_by, c.goal
FROM campaigns c LEFT JOIN segments s ON s.id = c.segment_id
WHERE c.status IN ('draft', 'approved') OR (c.status = 'sent' AND c.sent_at >= now() - interval '14 days');

CREATE VIEW v_attention AS
SELECT 'campaign not approved' AS issue, c.name AS ref, to_char(c.scheduled_for, 'YYYY-MM-DD HH24:MI') AS "when",
       'Scheduled within 3 days and nobody has approved it' AS detail
FROM campaigns c WHERE c.status = 'draft' AND c.scheduled_for IS NOT NULL AND c.scheduled_for < now() + interval '3 days'
UNION ALL
SELECT 'campaign overdue', c.name, to_char(c.scheduled_for, 'YYYY-MM-DD HH24:MI'), 'Approved and past its send time, not sent'
FROM campaigns c WHERE c.status = 'approved' AND c.scheduled_for < now()
UNION ALL
SELECT 'campaign has no audience', c.name, to_char(c.scheduled_for, 'YYYY-MM-DD HH24:MI'), 'No segment chosen'
FROM campaigns c WHERE c.status IN ('draft', 'approved') AND c.segment_id IS NULL
UNION ALL
SELECT 'flow switched off', f.name, NULL, 'Off. ' || coalesce(f.description, '')
FROM flows f WHERE NOT f.active
UNION ALL
SELECT 'flow emails due', f.flow, to_char(min(f.due_at), 'YYYY-MM-DD HH24:MI'), count(*) || ' email(s) due now: run send-flows'
FROM v_flows_due f GROUP BY f.flow
UNION ALL
SELECT 'flow quiet', h.flow, to_char(h.last_sent_at, 'YYYY-MM-DD'), 'On, but nothing sent in 30 days'
FROM v_flow_health h WHERE h.active AND h.sent_30d = 0
UNION ALL
SELECT 'list health', 'sunset candidates', NULL, h.sunset_candidates || ' subscribers with no open, click or order in ' || (SELECT unengaged_days FROM v_setting) || ' days'
FROM v_list_health h WHERE h.sunset_candidates > 0
UNION ALL
SELECT 'list health', 'bounce rate', NULL, h.bounce_pct_30d || '% of emails bounced in the last 30 days'
FROM v_list_health h WHERE h.bounce_pct_30d > (SELECT bounce_rate_limit_pct FROM v_setting)
UNION ALL
SELECT 'compliance', c.rule, NULL, c.ref || ': ' || c.finding FROM v_compliance c;
