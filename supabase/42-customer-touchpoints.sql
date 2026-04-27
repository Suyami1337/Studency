-- ─── Phase: Multiple touchpoints history 2026-04-27 ───
-- Хранит ВСЕ касания клиента с воронкой, не только первое.
-- customers.first_touch_* остаётся как denormalized "первое касание" для
-- быстрого фильтра и сортировки. Полная история — в этой таблице.

CREATE TABLE IF NOT EXISTS customer_touchpoints (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ts          timestamptz NOT NULL DEFAULT now(),
  kind        text NOT NULL,    -- 'landing' | 'bot' | 'channel' | 'direct'
  source      text,             -- utm_source / blogger_ivan / "Реклама ВК" / etc
  landing_id  uuid REFERENCES landings(id) ON DELETE SET NULL,
  referrer    text,
  url         text,
  utm         jsonb
);

CREATE INDEX IF NOT EXISTS idx_touchpoints_customer ON customer_touchpoints(customer_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_touchpoints_project ON customer_touchpoints(project_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_touchpoints_source ON customer_touchpoints(project_id, source);
CREATE INDEX IF NOT EXISTS idx_touchpoints_kind ON customer_touchpoints(project_id, kind);

ALTER TABLE customer_touchpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Project members read touchpoints" ON customer_touchpoints;
CREATE POLICY "Project members read touchpoints" ON customer_touchpoints
  FOR ALL USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));
