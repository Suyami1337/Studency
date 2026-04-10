-- ============================================================================
-- Events API + синхронизация сайт↔бот
-- ============================================================================

-- 1. Таблица событий (все события на сайтах, в лендингах, в ботах)
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  event_type text NOT NULL,           -- 'page_view' | 'button_click' | 'form_submit' | 'custom' | ...
  event_name text,                    -- конкретное имя (для custom events)
  source text,                        -- 'landing' | 'bot' | 'site' | ...
  source_id uuid,                     -- ID источника (landing_id, bot_id и т.д.)
  metadata jsonb DEFAULT '{}',        -- произвольные данные
  session_id text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_customer ON events(customer_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source, source_id);

-- 2. Событийные триггеры в чат-ботах
-- Позволяют запускать сценарии на основе действий на сайте
CREATE TABLE IF NOT EXISTS scenario_event_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL REFERENCES chatbot_scenarios(id) ON DELETE CASCADE,
  start_message_id uuid NOT NULL REFERENCES scenario_messages(id) ON DELETE CASCADE,
  event_type text NOT NULL,           -- какое событие слушать
  event_name text,                    -- конкретное имя (опционально)
  source text,                        -- фильтр по источнику
  conditions jsonb DEFAULT '{}',      -- доп. условия (например, конкретный URL)
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scenario_event_triggers_scenario ON scenario_event_triggers(scenario_id);
CREATE INDEX IF NOT EXISTS idx_scenario_event_triggers_event ON scenario_event_triggers(event_type, event_name);

-- 3. Email-дубликация для дожимов
ALTER TABLE message_followups ADD COLUMN IF NOT EXISTS duplicate_to_email boolean NOT NULL DEFAULT false;

-- 4. Email в карточке customer (если ещё не было)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email text;

-- 5. RLS для events
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see their project events" ON events;
CREATE POLICY "Users see their project events" ON events
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

-- 6. RLS для triggers
ALTER TABLE scenario_event_triggers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see their project triggers" ON scenario_event_triggers;
CREATE POLICY "Users see their project triggers" ON scenario_event_triggers
  FOR SELECT USING (
    scenario_id IN (
      SELECT id FROM chatbot_scenarios WHERE telegram_bot_id IN (
        SELECT id FROM telegram_bots WHERE project_id IN (
          SELECT id FROM projects WHERE owner_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "Users manage their project triggers" ON scenario_event_triggers;
CREATE POLICY "Users manage their project triggers" ON scenario_event_triggers
  FOR ALL USING (
    scenario_id IN (
      SELECT id FROM chatbot_scenarios WHERE telegram_bot_id IN (
        SELECT id FROM telegram_bots WHERE project_id IN (
          SELECT id FROM projects WHERE owner_id = auth.uid()
        )
      )
    )
  );
