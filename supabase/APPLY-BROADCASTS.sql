-- ============================================================================
-- Рассылки: массовая отправка сообщений по сегменту клиентов
-- ============================================================================

CREATE TABLE IF NOT EXISTS broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  telegram_bot_id uuid REFERENCES telegram_bots(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft', -- draft | sending | sent | failed
  -- Контент
  text text,
  media_id uuid REFERENCES media_library(id) ON DELETE SET NULL,
  media_type text,
  media_url text,
  -- Сегмент
  segment_type text NOT NULL DEFAULT 'all', -- all | funnel_stage | tag | source
  segment_value text,                 -- ID этапа / имя тега / slug источника
  -- Расписание
  scheduled_at timestamptz,
  sent_at timestamptz,
  -- Статистика
  total_recipients int DEFAULT 0,
  sent_count int DEFAULT 0,
  failed_count int DEFAULT 0,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_project ON broadcasts(project_id);
CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON broadcasts(status);
CREATE INDEX IF NOT EXISTS idx_broadcasts_scheduled ON broadcasts(scheduled_at) WHERE status = 'draft';

-- Журнал отправленных сообщений (для аналитики и дедупликации)
CREATE TABLE IF NOT EXISTS broadcast_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | sent | failed
  error text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_deliveries_broadcast ON broadcast_deliveries(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_deliveries_status ON broadcast_deliveries(broadcast_id, status);

-- RLS
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their broadcasts" ON broadcasts;
CREATE POLICY "Users manage their broadcasts" ON broadcasts
  FOR ALL USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

ALTER TABLE broadcast_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see their deliveries" ON broadcast_deliveries;
CREATE POLICY "Users see their deliveries" ON broadcast_deliveries
  FOR SELECT USING (
    broadcast_id IN (SELECT id FROM broadcasts WHERE project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()))
  );
