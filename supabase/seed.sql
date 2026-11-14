-- Demo data: Harbour Coffee Roasters, a fictional online coffee roaster in Nelson, New Zealand.
-- Every date is relative to now(), so the demo always has something due, something late and something to fix.
-- Idempotent: a second run does nothing.
DO $$
DECLARE
  firsts text[] := ARRAY['Mere','Tom','Priya','Sione','Hannah','Rawiri','Lucy','Arjun','Kiri','Oliver','Mei','Tama','Sophie','Nikau','Ruby','Leo','Anahera','Jacob','Zoe','Wiremu','Amelia','Hugo','Ngaio','Max'];
  lasts text[] := ARRAY['Rangi','Fraser','Shah','Tuilagi','Reid','Parata','Chen','Kumar','Henare','Smith','Lin','Ruru','Martin','Tane','Hall','Young','Kereama','Scott','King','Paki','Clarke','Evans','Moana','Ward'];
  i int; k int; pid uuid; n int;
  seg_all uuid; seg_engaged uuid; seg_best uuid; seg_lapsed uuid;
  c_news uuid; c_sale uuid; c_launch uuid; c_bf uuid; c_win uuid;
  f_welcome uuid; f_cart uuid; f_post uuid; f_win uuid;
  s_welcome1 uuid; s_welcome2 uuid; s_cart1 uuid; s_cart2 uuid; s_post uuid; s_win uuid;
  ev uuid; ord uuid; mid uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE email = 'aroha.ngata@example.com') THEN RETURN; END IF;

  UPDATE settings SET value = 'Harbour Coffee Roasters' WHERE key = 'sender_name';
  UPDATE settings SET value = 'hello@harbourcoffee.example' WHERE key = 'sender_email';
  UPDATE settings SET value = '12 Wharf Street, Nelson 7010, New Zealand' WHERE key = 'postal_address';

  -- 24 ordinary customers: a pattern, not random, so the tests can check the arithmetic.
  FOR i IN 1..24 LOOP
    INSERT INTO profiles(email, first_name, last_name, country, source, created_at)
    VALUES (lower(firsts[i]) || '.' || lower(lasts[i]) || '@example.com', firsts[i], lasts[i], CASE WHEN i % 6 = 0 THEN 'Australia' ELSE 'New Zealand' END,
            CASE WHEN i % 3 = 0 THEN 'Checkout' ELSE 'Website sign-up form' END, now() - make_interval(days => 400 - i * 5))
    RETURNING id INTO pid;
    INSERT INTO consents(profile_id, status, kind, source, evidence, actor, recorded_at)
    VALUES (pid, 'subscribed', 'express', CASE WHEN i % 3 = 0 THEN 'Shopify checkout' ELSE 'Website sign-up form' END,
            CASE WHEN i % 3 = 0 THEN 'Ticked "Email me with news and offers" at checkout' ELSE 'Sign-up form on the home page, double opt-in confirmed' END,
            'Import', now() - make_interval(days => 400 - i * 5));
    n := i % 5;  -- 0 to 4 earlier orders
    FOR k IN 1..n LOOP
      INSERT INTO orders(profile_id, order_ref, placed_at, total_cents, currency, items, source)
      VALUES (pid, '#' || (1000 + i * 10 + k), now() - make_interval(days => 20 + k * 45 + i * 7), 3800 + ((i * 7 + k * 13) % 40) * 100, 'NZD', 1 + (k % 3), 'shopify');
    END LOOP;
    IF i % 3 <> 0 THEN  -- a recent order that came from the website, not from an email
      INSERT INTO orders(profile_id, order_ref, placed_at, total_cents, currency, items, source)
      VALUES (pid, '#' || (1500 + i), now() - make_interval(days => 2 + i % 12), 4500 + (i % 4) * 1000, 'NZD', 1, 'shopify');
    END IF;
    IF i % 4 = 0 THEN  -- tag the espresso drinkers
      UPDATE profiles SET tags = ARRAY['espresso'] WHERE id = pid;
    END IF;
  END LOOP;

  -- The cast: each one shows something the weekly review has to catch.
  INSERT INTO profiles(email, first_name, last_name, country, source, tags, created_at) VALUES
    ('aroha.ngata@example.com', 'Aroha', 'Ngata', 'New Zealand', 'Website sign-up form', ARRAY['espresso','subscriber'], now() - interval '500 days'),
    ('ben.carter@example.com', 'Ben', 'Carter', 'New Zealand', 'Checkout', '{}', now() - interval '420 days'),
    ('chloe.wu@example.com', 'Chloe', 'Wu', 'Australia', 'Website sign-up form', '{}', now() - interval '380 days'),
    ('dan.murphy@example.com', 'Dan', 'Murphy', 'New Zealand', 'Website sign-up form', '{}', now() - interval '60 days'),
    ('ella.singh@example.com', 'Ella', 'Singh', 'New Zealand', 'Website pop-up', '{}', now() - interval '30 hours'),
    ('finn.obrien@example.com', 'Finn', 'O''Brien', 'New Zealand', 'Checkout', '{}', now() - interval '300 days'),
    ('grace.lee@example.com', 'Grace', 'Lee', 'New Zealand', 'Website sign-up form', '{}', now() - interval '250 days'),
    ('hemi.walker@example.com', 'Hemi', 'Walker', 'New Zealand', 'Market stall list', '{}', now() - interval '200 days'),
    ('isla.brown@example.com', 'Isla', 'Brown', 'New Zealand', 'Wholesale customer', ARRAY['cafe'], now() - interval '700 days'),
    ('jack.taylor@example.com', 'Jack', 'Taylor', 'New Zealand', 'Website sign-up form', '{}', now() - interval '150 days'),
    ('kate.wilson@example.com', 'Kate', 'Wilson', 'Australia', 'Website sign-up form', '{}', now() - interval '90 days'),
    ('liam.patel@example.com', 'Liam', 'Patel', 'New Zealand', 'Checkout', '{}', now() - interval '12 days');

  INSERT INTO consents(profile_id, status, kind, source, evidence, actor, recorded_at)
  SELECT id, 'subscribed', 'express', 'Website sign-up form', 'Sign-up form on the home page, double opt-in confirmed', 'Import', created_at
  FROM profiles WHERE email IN ('aroha.ngata@example.com','ben.carter@example.com','chloe.wu@example.com','dan.murphy@example.com','ella.singh@example.com','finn.obrien@example.com','grace.lee@example.com','jack.taylor@example.com','kate.wilson@example.com','liam.patel@example.com');
  -- Hemi: on the list from a paper sign-up sheet nobody kept.
  INSERT INTO consents(profile_id, status, kind, source, evidence, actor, recorded_at)
  SELECT id, 'subscribed', 'express', 'Market stall list', NULL, 'Import', created_at FROM profiles WHERE email = 'hemi.walker@example.com';
  -- Isla: a cafe customer added because they buy from us. Inferred, never confirmed.
  INSERT INTO consents(profile_id, status, kind, source, evidence, actor, recorded_at)
  SELECT id, 'subscribed', 'inferred', 'Existing wholesale account', 'Buys beans for the cafe every month; email address on their invoices', 'Import', created_at FROM profiles WHERE email = 'isla.brown@example.com';

  -- Aroha: a champion, six orders, the last one a week ago.
  SELECT id INTO pid FROM profiles WHERE email = 'aroha.ngata@example.com';
  FOR k IN 1..6 LOOP
    INSERT INTO orders(profile_id, order_ref, placed_at, total_cents, currency, items, source) VALUES (pid, '#20' || k, now() - make_interval(days => k * 9 - 2), 6400, 'NZD', 2, 'shopify');
  END LOOP;
  -- Ben: three orders, the last four months ago. At risk.
  SELECT id INTO pid FROM profiles WHERE email = 'ben.carter@example.com';
  FOR k IN 1..3 LOOP
    INSERT INTO orders(profile_id, order_ref, placed_at, total_cents, currency, items, source) VALUES (pid, '#30' || k, now() - make_interval(days => 90 + k * 30), 5200, 'NZD', 1, 'shopify');
  END LOOP;
  -- Chloe: two orders eight and nine months ago, one in Australian dollars. Lapsed; the AUD order stays out of NZD totals.
  SELECT id INTO pid FROM profiles WHERE email = 'chloe.wu@example.com';
  INSERT INTO orders(profile_id, order_ref, placed_at, total_cents, currency, items, source) VALUES
    (pid, '#401', now() - interval '240 days', 4900, 'AUD', 1, 'shopify'),
    (pid, '#402', now() - interval '270 days', 5400, 'NZD', 1, 'shopify');
  -- Liam: one order ten days ago. New.
  SELECT id INTO pid FROM profiles WHERE email = 'liam.patel@example.com';
  INSERT INTO orders(profile_id, order_ref, placed_at, total_cents, currency, items, source) VALUES (pid, '#501', now() - interval '10 days', 4200, 'NZD', 1, 'shopify') RETURNING id INTO ord;
  -- Isla: a regular wholesale order, last one five weeks ago.
  SELECT id INTO pid FROM profiles WHERE email = 'isla.brown@example.com';
  INSERT INTO orders(profile_id, order_ref, placed_at, total_cents, currency, items, source) VALUES
    (pid, '#601', now() - interval '35 days', 28000, 'NZD', 10, 'shopify'),
    (pid, '#602', now() - interval '65 days', 28000, 'NZD', 10, 'shopify');

  -- Events: sign-ups and checkouts.
  INSERT INTO events(profile_id, kind, occurred_at, detail) SELECT id, 'signed_up', now() - interval '30 hours', 'Website pop-up' FROM profiles WHERE email = 'ella.singh@example.com';
  INSERT INTO events(profile_id, kind, occurred_at, value_cents, currency, detail, ref)
  SELECT id, 'checkout_started', now() - interval '3 hours', 7600, 'NZD', 'House blend 1 kg, Single origin 250 g', 'chk-9001' FROM profiles WHERE email = 'dan.murphy@example.com';

  -- Segments.
  INSERT INTO segments(name, description, rules) VALUES ('All subscribers', 'Everyone we can email', '{}') RETURNING id INTO seg_all;
  INSERT INTO segments(name, description, rules) VALUES ('Engaged 90 days', 'Opened, clicked or ordered recently enough to want to hear from us', '{"engaged_within_days": 90}') RETURNING id INTO seg_engaged;
  INSERT INTO segments(name, description, rules) VALUES ('Best customers', 'Champions and loyal customers', '{"band": ["champion", "loyal"]}') RETURNING id INTO seg_best;
  INSERT INTO segments(name, description, rules) VALUES ('Lapsed and at risk', 'Bought before, quiet for three months or more', '{"band": ["at risk", "lapsed"]}') RETURNING id INTO seg_lapsed;

  -- Campaigns: two sent, one approved for later this week, one draft due tomorrow nobody approved, one with no audience.
  INSERT INTO campaigns(name, subject, preheader, template, segment_id, status, scheduled_for, approved_by, approved_at, sent_at, goal)
  VALUES ('October newsletter', 'What we are roasting this month', 'Three coffees, one of them new', 'newsletter.html', seg_all, 'sent', now() - interval '30 days', 'Hana Moore', now() - interval '32 days', now() - interval '30 days', 'Keep the list warm')
  RETURNING id INTO c_news;
  INSERT INTO campaigns(name, subject, preheader, template, segment_id, status, scheduled_for, approved_by, approved_at, sent_at, goal)
  VALUES ('Spring sale', '15% off every bag, this week only', 'Ends Sunday at midnight', 'offer.html', seg_all, 'sent', now() - interval '10 days', 'Hana Moore', now() - interval '11 days', now() - interval '10 days', 'Clear the spring stock')
  RETURNING id INTO c_sale;
  INSERT INTO campaigns(name, subject, preheader, template, segment_id, status, scheduled_for, approved_by, approved_at, goal)
  VALUES ('Summer blend launch', 'Something new on the roaster', 'Subscribers get first pick', 'launch.html', seg_engaged, 'approved', now() + interval '2 days', 'Hana Moore', now() - interval '1 day', 'Sell the first 200 bags to subscribers')
  RETURNING id INTO c_launch;
  INSERT INTO campaigns(name, subject, preheader, template, segment_id, status, scheduled_for, goal)
  VALUES ('Black Friday early access', 'Early access starts now', 'For our best customers, a day early', 'offer.html', seg_best, 'draft', now() + interval '1 day', 'Reward the best customers first')
  RETURNING id INTO c_bf;
  INSERT INTO campaigns(name, subject, template, status, goal)
  VALUES ('Win back the quiet ones', 'It has been a while', 'winback.html', 'draft', 'Bring back lapsed buyers before Christmas')
  RETURNING id INTO c_win;

  -- October newsletter: everyone subscribed at the time, about half open, a quarter click.
  i := 0;
  FOR pid IN SELECT p.id FROM profiles p JOIN consents c ON c.profile_id = p.id AND c.status = 'subscribed'
             WHERE p.created_at < now() - interval '31 days' ORDER BY p.email LOOP
    i := i + 1;
    INSERT INTO messages(profile_id, campaign_id, sent_at, provider_id, delivered_at, opened_at, clicked_at)
    VALUES (pid, c_news, now() - interval '30 days', 'pm-news-' || i, now() - interval '30 days',
            CASE WHEN i % 2 = 0 THEN now() - interval '29 days' END, CASE WHEN i % 4 = 0 THEN now() - interval '29 days' END);
  END LOOP;

  -- Spring sale: same audience. Every fourth person clicks; every eighth orders two days later.
  i := 0;
  FOR pid IN SELECT p.id FROM profiles p JOIN consents c ON c.profile_id = p.id AND c.status = 'subscribed'
             WHERE p.created_at < now() - interval '11 days' AND p.email NOT IN ('kate.wilson@example.com', 'jack.taylor@example.com') ORDER BY p.email LOOP
    i := i + 1;
    INSERT INTO messages(profile_id, campaign_id, sent_at, provider_id, delivered_at, opened_at, clicked_at)
    VALUES (pid, c_sale, now() - interval '10 days', 'pm-sale-' || i, now() - interval '10 days',
            CASE WHEN i % 3 <> 0 THEN now() - interval '9 days 20 hours' END, CASE WHEN i % 4 = 0 THEN now() - interval '9 days 18 hours' END);
    IF i % 8 = 0 THEN
      INSERT INTO orders(profile_id, order_ref, placed_at, total_cents, currency, items, discount_code, source)
      VALUES (pid, '#S' || (700 + i), now() - interval '8 days', 5600, 'NZD', 2, 'SPRING15', 'shopify');
    END IF;
  END LOOP;
  -- Kate bounced and Jack reported the sale email as spam.
  INSERT INTO messages(profile_id, campaign_id, sent_at, provider_id, bounced_at)
  SELECT id, c_sale, now() - interval '10 days', 'pm-sale-kate', now() - interval '10 days' FROM profiles WHERE email = 'kate.wilson@example.com';
  INSERT INTO messages(profile_id, campaign_id, sent_at, provider_id, delivered_at, opened_at, complained_at)
  SELECT id, c_sale, now() - interval '10 days', 'pm-sale-jack', now() - interval '10 days', now() - interval '9 days', now() - interval '9 days' FROM profiles WHERE email = 'jack.taylor@example.com';
  INSERT INTO consents(profile_id, status, source, evidence, actor, recorded_at)
  SELECT id, 'unsubscribed', 'Reported as spam', 'Postmark spam complaint on the Spring sale', 'Import', now() - interval '9 days' FROM profiles WHERE email = 'jack.taylor@example.com';
  INSERT INTO unsubscribe_requests(profile_id, requested_at, via, actioned_at, actor)
  SELECT id, now() - interval '9 days', 'spam report', now() - interval '9 days', 'Import' FROM profiles WHERE email = 'jack.taylor@example.com';

  -- Finn replied "please take me off your list" 16 days ago; someone actioned it a fortnight later.
  INSERT INTO unsubscribe_requests(profile_id, requested_at, via, actioned_at, actor)
  SELECT id, now() - interval '16 days', 'reply to the October newsletter', now() - interval '2 days', 'Hana Moore' FROM profiles WHERE email = 'finn.obrien@example.com';
  INSERT INTO consents(profile_id, status, source, evidence, actor, recorded_at)
  SELECT id, 'unsubscribed', 'Reply by email', 'Replied "please take me off your list"', 'Hana Moore', now() - interval '2 days' FROM profiles WHERE email = 'finn.obrien@example.com';
  -- Grace unsubscribed in the old system 20 days ago. The Spring sale still went to her (it is in the loop above).
  INSERT INTO unsubscribe_requests(profile_id, requested_at, via, actioned_at, actor)
  SELECT id, now() - interval '20 days', 'unsubscribe link', now() - interval '1 day', 'Import' FROM profiles WHERE email = 'grace.lee@example.com';
  INSERT INTO consents(profile_id, status, source, evidence, actor, recorded_at)
  SELECT id, 'unsubscribed', 'Unsubscribe link', 'Unsubscribed in the previous email platform; found in its export', 'Import', now() - interval '1 day' FROM profiles WHERE email = 'grace.lee@example.com';

  -- Chloe has not opened anything since the spring before last: she is a sunset candidate.
  UPDATE messages SET opened_at = NULL, clicked_at = NULL WHERE profile_id = (SELECT id FROM profiles WHERE email = 'chloe.wu@example.com');

  -- Flows.
  INSERT INTO flows(name, trigger, active, description) VALUES ('Welcome series', 'signed_up', true, 'Two emails for every new subscriber') RETURNING id INTO f_welcome;
  INSERT INTO flows(name, trigger, active, description) VALUES ('Abandoned checkout', 'checkout_started', true, 'A reminder an hour after a checkout is left, and one more the next day') RETURNING id INTO f_cart;
  INSERT INTO flows(name, trigger, active, description) VALUES ('Post-purchase brew guide', 'order_placed', true, 'How to brew, three days after an order') RETURNING id INTO f_post;
  INSERT INTO flows(name, trigger, lapsed_days, active, description) VALUES ('Win-back', 'lapsed', 120, false, 'Switched off in winter when the template was being rewritten. Nobody turned it back on.') RETURNING id INTO f_win;
  INSERT INTO flow_steps(flow_id, step_no, delay_hours, subject, template, stop_if_ordered) VALUES (f_welcome, 1, 0, 'Welcome to Harbour Coffee', 'welcome.html', false) RETURNING id INTO s_welcome1;
  INSERT INTO flow_steps(flow_id, step_no, delay_hours, subject, template, stop_if_ordered) VALUES (f_welcome, 2, 24, 'Where to start with fresh beans', 'welcome.html', true) RETURNING id INTO s_welcome2;
  INSERT INTO flow_steps(flow_id, step_no, delay_hours, subject, template) VALUES (f_cart, 1, 1, 'You left something in your cart', 'abandoned.html') RETURNING id INTO s_cart1;
  INSERT INTO flow_steps(flow_id, step_no, delay_hours, subject, template) VALUES (f_cart, 2, 24, 'Still thinking it over?', 'abandoned.html') RETURNING id INTO s_cart2;
  INSERT INTO flow_steps(flow_id, step_no, delay_hours, subject, template, stop_if_ordered) VALUES (f_post, 1, 72, 'How to get the best from your beans', 'post-purchase.html', false) RETURNING id INTO s_post;
  INSERT INTO flow_steps(flow_id, step_no, delay_hours, subject, template) VALUES (f_win, 1, 0, 'It has been a while', 'winback.html') RETURNING id INTO s_win;

  -- Ella got the first welcome email when she signed up.
  INSERT INTO messages(profile_id, flow_step_id, trigger_ref, sent_at, provider_id, delivered_at, opened_at)
  SELECT p.id, s_welcome1, 'event:' || e.id, now() - interval '30 hours', 'pm-welcome-ella', now() - interval '30 hours', now() - interval '29 hours'
  FROM profiles p JOIN events e ON e.profile_id = p.id AND e.kind = 'signed_up' WHERE p.email = 'ella.singh@example.com';

  -- Liam got the brew guide three days after his order and clicked it.
  SELECT id INTO pid FROM profiles WHERE email = 'liam.patel@example.com';
  INSERT INTO messages(profile_id, flow_step_id, trigger_ref, sent_at, provider_id, delivered_at, opened_at, clicked_at)
  VALUES (pid, s_post, 'order:' || ord, now() - interval '7 days', 'pm-post-liam', now() - interval '7 days', now() - interval '7 days', now() - interval '7 days');

  -- Sophie (one of the regulars) left a checkout five days ago, got the reminder, clicked, and bought.
  SELECT id INTO pid FROM profiles WHERE email = 'sophie.martin@example.com';
  INSERT INTO events(profile_id, kind, occurred_at, value_cents, currency, detail, ref) VALUES (pid, 'checkout_started', now() - interval '5 days 2 hours', 8800, 'NZD', 'Espresso blend 1 kg', 'chk-8890') RETURNING id INTO ev;
  INSERT INTO messages(profile_id, flow_step_id, trigger_ref, sent_at, provider_id, delivered_at, opened_at, clicked_at)
  VALUES (pid, s_cart1, 'event:' || ev, now() - interval '5 days 1 hour', 'pm-cart-sophie', now() - interval '5 days 1 hour', now() - interval '5 days', now() - interval '5 days');
  INSERT INTO orders(profile_id, order_ref, placed_at, total_cents, currency, items, source) VALUES (pid, '#801', now() - interval '4 days 23 hours', 8800, 'NZD', 1, 'shopify');
END $$;
