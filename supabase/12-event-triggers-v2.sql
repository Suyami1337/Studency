-- =====================================================
-- Event triggers v2: негативные триггеры с окном ожидания
-- =====================================================
-- Позволяет настраивать сценарии которые запускаются:
--   - Когда произошло событие (позитивный триггер) — как было
--   - Когда событие НЕ произошло за N минут после другого события
--     (негативный триггер) — новое

-- 1. Расширяем scenario_event_triggers
ALTER TABLE scenario_event_triggers ADD COLUMN IF NOT EXISTS is_negative boolean NOT NULL DEFAULT false;
ALTER TABLE scenario_event_triggers ADD COLUMN IF NOT EXISTS wait_minutes int NOT NULL DEFAULT 0;
ALTER TABLE scenario_event_triggers ADD COLUMN IF NOT EXISTS event_params jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE scenario_event_triggers ADD COLUMN IF NOT EXISTS cancel_on_event_type text;
ALTER TABLE scenario_event_triggers ADD COLUMN IF NOT EXISTS cancel_on_event_name text;
ALTER TABLE scenario_event_triggers ADD COLUMN IF NOT EXISTS label text;

-- Пояснения:
-- is_negative=false (позитивный):  событие event_type[:event_name] случилось → стартуем сценарий сразу
-- is_negative=true (негативный):   событие event_type[:event_name] случилось → планируем запуск
--                                  через wait_minutes. Если до этого срока случилось
--                                  cancel_on_event_type[:cancel_on_event_name] у того же customer —
--                                  запланированный запуск отменяется.
-- event_params — доп. фильтры: { videoId, landingSlug, productId, minPercent, и т.д. }
-- label — удобное имя для UI ("Недосмотрел видео про оффер")

CREATE INDEX IF NOT EXISTS idx_trigger_is_negative ON scenario_event_triggers(is_negative);
CREATE INDEX IF NOT EXISTS idx_trigger_cancel_on ON scenario_event_triggers(cancel_on_event_type, cancel_on_event_name) WHERE is_negative = true;

-- 2. Новая таблица: запланированные триггеры (для негативных)
CREATE TABLE IF NOT EXISTS scheduled_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id uuid NOT NULL REFERENCES scenario_event_triggers(id) ON DELETE CASCADE,
  scenario_id uuid NOT NULL REFERENCES chatbot_scenarios(id) ON DELETE CASCADE,
  start_message_id uuid NOT NULL REFERENCES scenario_messages(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  telegram_bot_id uuid REFERENCES telegram_bots(id) ON DELETE SET NULL,
  telegram_chat_id bigint,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',  -- 'pending' | 'fired' | 'cancelled'
  cancel_reason text,
  cancelled_by_event_id uuid,               -- какое событие отменило
  fired_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_status_time ON scheduled_triggers(status, scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_scheduled_customer ON scheduled_triggers(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_scheduled_cancel_lookup ON scheduled_triggers(customer_id, trigger_id, status);
CREATE INDEX IF NOT EXISTS idx_scheduled_project ON scheduled_triggers(project_id, status);

ALTER TABLE scheduled_triggers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see their project scheduled triggers" ON scheduled_triggers;
CREATE POLICY "Users see their project scheduled triggers" ON scheduled_triggers
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

-- Service role обходит RLS, поэтому cron и webhooks работают. Insert/update/delete
-- через auth-клиент пока не нужен (только сервер пишет), но добавим для полноты.
DROP POLICY IF EXISTS "Users manage their project scheduled triggers" ON scheduled_triggers;
CREATE POLICY "Users manage their project scheduled triggers" ON scheduled_triggers
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );
