-- ─── Phase: Users redesign 2026-04-26 ───
-- Adds:
--   1. customer_segments  — saved filter presets per project
--   2. customer_timeline_events VIEW — unified action log (UNION ALL)
--   3. customer_aggregates VIEW — last_activity, revenue, type-flags

-- ───────────────────────── 1. customer_segments ─────────────────────────
CREATE TABLE IF NOT EXISTS customer_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort jsonb NOT NULL DEFAULT '{"column":"last_activity_at","direction":"desc"}'::jsonb,
  visible_columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_segments_project ON customer_segments(project_id);

ALTER TABLE customer_segments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Project members manage segments" ON customer_segments;
CREATE POLICY "Project members manage segments" ON customer_segments
  FOR ALL USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- ───────────────────────── 2. customer_timeline_events ─────────────────────────
DROP VIEW IF EXISTS customer_timeline_events CASCADE;
CREATE VIEW customer_timeline_events AS

  -- Bot messages: out (наши действия)
  SELECT
    cc.customer_id,
    b.project_id,
    cm.created_at AS ts,
    'message_out'::text AS kind,
    'us'::text AS side,
    jsonb_build_object(
      'content', cm.content,
      'message_id', cm.id,
      'scenario_id', cm.scenario_id,
      'message_type', cm.message_type
    ) AS data
  FROM chatbot_messages cm
  JOIN chatbot_conversations cc ON cc.id = cm.conversation_id
  JOIN telegram_bots b ON b.id = cc.telegram_bot_id
  WHERE cm.direction = 'outgoing' AND cc.customer_id IS NOT NULL

  UNION ALL

  -- Bot messages: in (его действия)
  SELECT
    cc.customer_id,
    b.project_id,
    cm.created_at,
    'message_in'::text,
    'them'::text,
    jsonb_build_object(
      'content', cm.content,
      'message_id', cm.id,
      'message_type', cm.message_type
    )
  FROM chatbot_messages cm
  JOIN chatbot_conversations cc ON cc.id = cm.conversation_id
  JOIN telegram_bots b ON b.id = cc.telegram_bot_id
  WHERE cm.direction = 'incoming' AND cc.customer_id IS NOT NULL

  UNION ALL

  -- Button clicks (URL-кнопки)
  SELECT
    bc.customer_id,
    bc.project_id,
    bc.created_at,
    'button_click'::text,
    'them'::text,
    jsonb_build_object(
      'destination_url', bc.destination_url,
      'button_id', bc.button_id,
      'referrer', bc.referrer
    )
  FROM button_clicks bc
  WHERE bc.customer_id IS NOT NULL

  UNION ALL

  -- customer_actions (универсальный лог: bot_start, gate_passed и пр.)
  SELECT
    ca.customer_id,
    ca.project_id,
    ca.created_at,
    ca.action::text,
    'them'::text,
    COALESCE(ca.data, '{}'::jsonb)
  FROM customer_actions ca

  UNION ALL

  -- Landing visits
  SELECT
    lv.customer_id,
    l.project_id,
    lv.created_at,
    'landing_view'::text,
    'them'::text,
    jsonb_build_object(
      'landing_id', lv.landing_id,
      'landing_name', l.name,
      'landing_slug', l.slug,
      'referrer', lv.referrer
    )
  FROM landing_visits lv
  JOIN landings l ON l.id = lv.landing_id
  WHERE lv.customer_id IS NOT NULL

  UNION ALL

  -- Order created
  SELECT
    o.customer_id,
    o.project_id,
    o.created_at,
    'order_created'::text,
    'them'::text,
    jsonb_build_object(
      'order_id', o.id,
      'amount', o.amount,
      'paid_amount', o.paid_amount,
      'status', o.status,
      'product_id', o.product_id,
      'tariff_id', o.tariff_id
    )
  FROM orders o
  WHERE o.customer_id IS NOT NULL

  UNION ALL

  -- Order paid (используем updated_at когда статус = paid)
  SELECT
    o.customer_id,
    o.project_id,
    o.updated_at,
    'order_paid'::text,
    'them'::text,
    jsonb_build_object(
      'order_id', o.id,
      'amount', o.amount,
      'paid_amount', o.paid_amount
    )
  FROM orders o
  WHERE o.customer_id IS NOT NULL
    AND o.status::text = 'paid'
    AND o.updated_at IS NOT NULL
    AND o.updated_at > o.created_at

  UNION ALL

  -- Broadcast deliveries (наши рассылки)
  SELECT
    bd.customer_id,
    b.project_id,
    bd.sent_at AS ts,
    CASE WHEN bd.status = 'sent' THEN 'broadcast_sent' ELSE 'broadcast_failed' END::text,
    'us'::text,
    jsonb_build_object(
      'broadcast_id', bd.broadcast_id,
      'broadcast_name', b.name,
      'text', b.text,
      'channel', b.channel,
      'status', bd.status,
      'error', bd.error
    )
  FROM broadcast_deliveries bd
  JOIN broadcasts b ON b.id = bd.broadcast_id
  WHERE bd.customer_id IS NOT NULL AND bd.sent_at IS NOT NULL

  UNION ALL

  -- Video views
  SELECT
    vv.customer_id,
    vv.project_id,
    vv.last_seen_at,
    'video_view'::text,
    'them'::text,
    jsonb_build_object(
      'video_id', vv.video_id,
      'title', v.title,
      'watch_time_seconds', vv.watch_time_seconds,
      'completed', vv.completed
    )
  FROM video_views vv
  JOIN videos v ON v.id = vv.video_id
  WHERE vv.customer_id IS NOT NULL AND vv.last_seen_at IS NOT NULL

  UNION ALL

  -- Funnel stage entered
  SELECT
    cfp.customer_id,
    f.project_id,
    cfp.entered_at,
    'funnel_stage_entered'::text,
    'them'::text,
    jsonb_build_object(
      'funnel_id', cfp.funnel_id,
      'funnel_name', f.name,
      'stage_id', cfp.stage_id,
      'stage_name', fs.name
    )
  FROM customer_funnel_positions cfp
  JOIN funnels f ON f.id = cfp.funnel_id
  LEFT JOIN funnel_stages fs ON fs.id = cfp.stage_id
  WHERE cfp.entered_at IS NOT NULL

  UNION ALL

  -- Notes (наши заметки)
  SELECT
    cn.customer_id,
    cn.project_id,
    cn.created_at,
    'note_added'::text,
    'us'::text,
    jsonb_build_object(
      'text', COALESCE(cn.content, cn.text),
      'author_id', cn.author_id
    )
  FROM customer_notes cn
  WHERE cn.project_id IS NOT NULL

  UNION ALL

  -- Generic events (трекер на сайтах)
  SELECT
    e.customer_id,
    e.project_id,
    e.created_at,
    e.event_type::text,
    'them'::text,
    COALESCE(e.metadata, '{}'::jsonb) || jsonb_build_object('event_name', e.event_name, 'source', e.source)
  FROM events e
  WHERE e.customer_id IS NOT NULL
;

-- ───────────────────────── 3. customer_aggregates ─────────────────────────
DROP VIEW IF EXISTS customer_aggregates CASCADE;
CREATE VIEW customer_aggregates AS
  SELECT
    c.id AS customer_id,
    c.project_id,
    GREATEST(
      c.created_at,
      COALESCE((SELECT MAX(ts) FROM customer_timeline_events e WHERE e.customer_id = c.id), c.created_at)
    ) AS last_activity_at,
    (SELECT COUNT(*)::int FROM orders o WHERE o.customer_id = c.id) AS orders_count,
    (SELECT COALESCE(SUM(paid_amount), 0)::int FROM orders o WHERE o.customer_id = c.id AND o.status::text = 'paid') AS revenue,
    EXISTS(SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.status::text = 'paid') AS has_paid,
    EXISTS(SELECT 1 FROM customer_funnel_positions cfp WHERE cfp.customer_id = c.id) AS in_funnel
  FROM customers c;

-- Готово.
