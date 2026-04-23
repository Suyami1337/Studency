-- APPLY ALL — единый SQL для миграций Studency. Идемпотентен.

-- ============================================================================
-- 01-media-library.sql
-- ============================================================================
-- ============================================================================
-- ЕДИНЫЙ SQL ДЛЯ МЕДИА-БИБЛИОТЕКИ
-- Запусти этот файл целиком в Supabase SQL Editor
--
-- ВАЖНО: перед запуском создай Storage bucket вручную:
--   Supabase Dashboard → Storage → New bucket
--   Name: chatbot-media
--   Public bucket: ДА (галочка)
-- ============================================================================

-- 1. Колонки в scenario_messages для хранения ссылки на медиа
ALTER TABLE scenario_messages ADD COLUMN IF NOT EXISTS media_type text;
ALTER TABLE scenario_messages ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE scenario_messages ADD COLUMN IF NOT EXISTS media_file_name text;

-- 2. Центральная медиа-библиотека
CREATE TABLE IF NOT EXISTS media_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  public_url text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  media_type text NOT NULL,
  size_bytes bigint NOT NULL,
  uploaded_by uuid,
  uploaded_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_library_project ON media_library(project_id);
CREATE INDEX IF NOT EXISTS idx_media_library_uploaded_at ON media_library(uploaded_at DESC);

-- 3. Связи — где используется каждый файл
CREATE TABLE IF NOT EXISTS media_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id uuid NOT NULL REFERENCES media_library(id) ON DELETE CASCADE,
  usage_type text NOT NULL,
  usage_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(media_id, usage_type, usage_id)
);

CREATE INDEX IF NOT EXISTS idx_media_usages_media ON media_usages(media_id);
CREATE INDEX IF NOT EXISTS idx_media_usages_entity ON media_usages(usage_type, usage_id);

-- 4. Связь scenario_messages → media_library (с автоочисткой при удалении медиа)
ALTER TABLE scenario_messages ADD COLUMN IF NOT EXISTS media_id uuid REFERENCES media_library(id) ON DELETE SET NULL;

-- 5. RLS для media_library (доступ только к своим проектам)
ALTER TABLE media_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view media from their projects" ON media_library;
CREATE POLICY "Users can view media from their projects" ON media_library
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert media to their projects" ON media_library;
CREATE POLICY "Users can insert media to their projects" ON media_library
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete media from their projects" ON media_library;
CREATE POLICY "Users can delete media from their projects" ON media_library
  FOR DELETE USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

-- 6. RLS для media_usages
ALTER TABLE media_usages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their usages" ON media_usages;
CREATE POLICY "Users can view their usages" ON media_usages
  FOR SELECT USING (
    media_id IN (SELECT id FROM media_library WHERE project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Users can insert their usages" ON media_usages;
CREATE POLICY "Users can insert their usages" ON media_usages
  FOR INSERT WITH CHECK (
    media_id IN (SELECT id FROM media_library WHERE project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Users can delete their usages" ON media_usages;
CREATE POLICY "Users can delete their usages" ON media_usages
  FOR DELETE USING (
    media_id IN (SELECT id FROM media_library WHERE project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()))
  );

-- 7. Storage политики для bucket chatbot-media
--    (bucket создаётся вручную через UI, но политики можно применить через SQL)
DROP POLICY IF EXISTS "Public read chatbot-media" ON storage.objects;
CREATE POLICY "Public read chatbot-media" ON storage.objects
  FOR SELECT USING (bucket_id = 'chatbot-media');

DROP POLICY IF EXISTS "Authenticated upload chatbot-media" ON storage.objects;
CREATE POLICY "Authenticated upload chatbot-media" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'chatbot-media' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated delete chatbot-media" ON storage.objects;
CREATE POLICY "Authenticated delete chatbot-media" ON storage.objects
  FOR DELETE USING (bucket_id = 'chatbot-media' AND auth.role() = 'authenticated');

-- ============================================================================
-- 02-followup-media.sql
-- ============================================================================
-- ============================================================================
-- Медиа в дожимах: колонки в message_followups
-- Запускать ПОСЛЕ APPLY-MEDIA-LIBRARY.sql
-- ============================================================================

ALTER TABLE message_followups ADD COLUMN IF NOT EXISTS media_type text;
ALTER TABLE message_followups ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE message_followups ADD COLUMN IF NOT EXISTS media_file_name text;
ALTER TABLE message_followups ADD COLUMN IF NOT EXISTS media_id uuid REFERENCES media_library(id) ON DELETE SET NULL;

-- ============================================================================
-- 03-videos.sql
-- ============================================================================
-- ============================================================================
-- Видеохостинг (интеграция Kinescope)
-- ============================================================================

-- 1. Таблица видео
CREATE TABLE IF NOT EXISTS videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Без названия',
  description text,
  kinescope_id text,                  -- ID видео в Kinescope
  kinescope_status text DEFAULT 'pending', -- pending | processing | ready | error
  embed_url text,                     -- iframe URL для встраивания
  thumbnail_url text,                 -- превью
  duration_seconds int,               -- длительность
  file_size_bytes bigint,             -- размер файла
  folder_id uuid,                     -- для группировки (на будущее)
  uploaded_by uuid,                   -- кто загрузил
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_videos_project ON videos(project_id);
CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at DESC);

-- 2. Просмотры видео (аналитика)
CREATE TABLE IF NOT EXISTS video_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Прогресс просмотра
  watch_time_seconds int DEFAULT 0,   -- сколько секунд посмотрели
  max_position_seconds int DEFAULT 0, -- до какого момента досмотрели
  completed boolean DEFAULT false,    -- досмотрел до конца (>= 90%)
  -- Контекст
  started_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  session_id text,                    -- для дедупликации
  user_agent text,
  referrer text
);

CREATE INDEX IF NOT EXISTS idx_video_views_video ON video_views(video_id);
CREATE INDEX IF NOT EXISTS idx_video_views_customer ON video_views(customer_id);
CREATE INDEX IF NOT EXISTS idx_video_views_project ON video_views(project_id);

-- 3. RLS для videos
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see their project videos" ON videos;
CREATE POLICY "Users see their project videos" ON videos
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users insert to their projects" ON videos;
CREATE POLICY "Users insert to their projects" ON videos
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users update their project videos" ON videos;
CREATE POLICY "Users update their project videos" ON videos
  FOR UPDATE USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users delete their project videos" ON videos;
CREATE POLICY "Users delete their project videos" ON videos
  FOR DELETE USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

-- 4. RLS для video_views (read only для владельцев проекта, вставка с service role через API)
ALTER TABLE video_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see their project views" ON video_views;
CREATE POLICY "Users see their project views" ON video_views
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

-- ============================================================================
-- 04-kinescope-folders.sql
-- ============================================================================
-- ============================================================================
-- Kinescope master account: папки per-project + настройки плеера
-- ============================================================================

-- Папка в Kinescope для изоляции видео проекта от видео других проектов
ALTER TABLE projects ADD COLUMN IF NOT EXISTS kinescope_folder_id text;

-- Настройки плеера (общие для всех видео проекта):
-- { accent_color, logo_url, logo_media_id, watermark, autoplay, muted, show_title }
ALTER TABLE projects ADD COLUMN IF NOT EXISTS player_settings jsonb DEFAULT '{}'::jsonb;

-- ============================================================================
-- 05-events.sql
-- ============================================================================
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

-- ============================================================================
-- 06-crm-pro.sql
-- ============================================================================
-- ============================================================================
-- CRM Pro: гибкие столбцы + timeline
-- ============================================================================

-- 1. Кастомные поля клиента (динамические атрибуты)
CREATE TABLE IF NOT EXISTS customer_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  field_key text NOT NULL,              -- машинное имя (notes, company, vip_status и т.д.)
  field_label text NOT NULL,            -- отображаемое имя
  field_type text NOT NULL DEFAULT 'text', -- text | number | boolean | select | date
  field_options jsonb,                  -- варианты для select
  order_index int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(project_id, field_key)
);

-- 2. Значения кастомных полей для каждого клиента
CREATE TABLE IF NOT EXISTS customer_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES customer_custom_fields(id) ON DELETE CASCADE,
  value_text text,
  value_number numeric,
  value_boolean boolean,
  value_date timestamptz,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(customer_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_field_values_customer ON customer_field_values(customer_id);
CREATE INDEX IF NOT EXISTS idx_field_values_field ON customer_field_values(field_id);

-- 3. RLS
ALTER TABLE customer_custom_fields ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their custom fields" ON customer_custom_fields;
CREATE POLICY "Users manage their custom fields" ON customer_custom_fields
  FOR ALL USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

ALTER TABLE customer_field_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their field values" ON customer_field_values;
CREATE POLICY "Users manage their field values" ON customer_field_values
  FOR ALL USING (
    customer_id IN (SELECT id FROM customers WHERE project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()))
  );

-- 4. Заметки клиента (timeline)
-- Старая таблица (если существовала) могла иметь колонку `text` вместо `content`
-- и без project_id — обновляем схему idempotently.
CREATE TABLE IF NOT EXISTS customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Добавляем недостающие колонки для существующих таблиц
ALTER TABLE customer_notes ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE customer_notes ADD COLUMN IF NOT EXISTS author_id uuid;
ALTER TABLE customer_notes ADD COLUMN IF NOT EXISTS content text;

-- Если существует старая колонка `text` — переносим данные в content
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='customer_notes' AND column_name='text'
  ) THEN
    UPDATE customer_notes SET content = text WHERE content IS NULL AND text IS NOT NULL;
  END IF;
END $$;

-- Backfill project_id из customers для старых записей
UPDATE customer_notes cn
SET project_id = c.project_id
FROM customers c
WHERE cn.customer_id = c.id AND cn.project_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_customer_notes_customer ON customer_notes(customer_id, created_at DESC);

ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their customer notes" ON customer_notes;
CREATE POLICY "Users manage their customer notes" ON customer_notes
  FOR ALL USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- ============================================================================
-- 07-broadcasts.sql
-- ============================================================================
-- ============================================================================
-- Рассылки: массовая отправка сообщений по сегменту клиентов
-- ============================================================================

CREATE TABLE IF NOT EXISTS broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  telegram_bot_id uuid REFERENCES telegram_bots(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft', -- draft | sending | sent | failed
  -- Канал отправки
  channel text NOT NULL DEFAULT 'telegram', -- telegram | email | both
  email_subject text,                 -- тема письма (если channel включает email)
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

ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'telegram';
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS email_subject text;

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

-- ============================================================================
-- 08-email-unsubscribes.sql
-- ============================================================================
-- ============================================================================
-- Email unsubscribes — для соответствия закону (GDPR, 152-ФЗ)
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_unsubscribes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email text NOT NULL,
  unsubscribed_at timestamptz DEFAULT now(),
  reason text,
  UNIQUE(project_id, email)
);

CREATE INDEX IF NOT EXISTS idx_email_unsubscribes_project ON email_unsubscribes(project_id);
CREATE INDEX IF NOT EXISTS idx_email_unsubscribes_email ON email_unsubscribes(email);

-- RLS — владельцы проекта видят кто отписался
ALTER TABLE email_unsubscribes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see their unsubscribes" ON email_unsubscribes;
CREATE POLICY "Users see their unsubscribes" ON email_unsubscribes
  FOR SELECT USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- ============================================================================
-- 09-usage-tracking.sql
-- ============================================================================
-- ============================================================================
-- Usage tracking — учёт расхода ресурсов мастер-аккаунтов
-- ============================================================================

-- Простой лог вызовов (AI, email, видео uploads) — для мониторинга и будущих квот
CREATE TABLE IF NOT EXISTS usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  resource text NOT NULL,            -- 'ai_message' | 'email_sent' | 'video_upload' | 'video_storage'
  action text,                       -- 'generate_scenario' | 'broadcast' | 'followup' | ...
  units numeric DEFAULT 1,           -- количество (писем, токенов, байт)
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_project ON usage_events(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_resource ON usage_events(resource);

-- RLS
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see their usage" ON usage_events;
CREATE POLICY "Users see their usage" ON usage_events
  FOR SELECT USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- ============================================================================
-- 10-crm-automation.sql
-- ============================================================================
-- ============================================================================
-- 10. CRM автоматизация — per-column правила, логирование перемещений
-- ============================================================================

-- 1. Тип автоматизации на столбце (manual/auto)
ALTER TABLE crm_board_stages ADD COLUMN IF NOT EXISTS automation_mode text NOT NULL DEFAULT 'manual';
-- 'manual' — менеджер перетаскивает руками
-- 'auto' — правила автоматически двигают клиентов

-- 2. Флаг "требовать из предыдущего столбца"
ALTER TABLE crm_board_stages ADD COLUMN IF NOT EXISTS require_from_previous boolean NOT NULL DEFAULT false;

-- 3. Правила входа для auto-столбцов
-- Между правилами одного столбца — OR (достаточно любого)
-- Внутри одного правила — AND (все фильтры должны совпасть)
CREATE TABLE IF NOT EXISTS crm_stage_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES crm_board_stages(id) ON DELETE CASCADE,
  -- Тип события
  event_type text NOT NULL,           -- 'bot_start' | 'landing_visit' | 'video_complete' | 'order_paid' | 'form_submit' | etc.
  -- Фильтры (AND внутри правила) — JSON объект с произвольными условиями
  -- Примеры:
  --   {"landing_slug": "vsl"} — конкретный лендинг
  --   {"video_id": "uuid"} — конкретное видео
  --   {"product_id": "uuid", "status": "paid"} — конкретный продукт оплачен
  --   {"button_text": "Купить"} — конкретная кнопка в боте
  filters jsonb NOT NULL DEFAULT '{}',
  -- Описание для UI (чтобы менеджер видел что настроено)
  description text,
  order_index int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_stage_rules_stage ON crm_stage_rules(stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_stage_rules_event ON crm_stage_rules(event_type);

-- 4. Трекер "уже срабатывало" — чтобы правило не двигало клиента повторно
-- Если запись есть — правило уже один раз отработало для этого клиента на этом столбце
CREATE TABLE IF NOT EXISTS crm_stage_rule_fired (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES crm_board_stages(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES crm_stage_rules(id) ON DELETE CASCADE,
  fired_at timestamptz DEFAULT now(),
  UNIQUE(customer_id, stage_id, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_rule_fired_customer ON crm_stage_rule_fired(customer_id);

-- 5. Лог перемещений по CRM — кто, откуда, куда, когда, почему
CREATE TABLE IF NOT EXISTS crm_movement_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  board_id uuid NOT NULL REFERENCES crm_boards(id) ON DELETE CASCADE,
  from_stage_id uuid REFERENCES crm_board_stages(id) ON DELETE SET NULL,
  to_stage_id uuid NOT NULL REFERENCES crm_board_stages(id) ON DELETE CASCADE,
  moved_by text NOT NULL DEFAULT 'automation',  -- 'automation' | 'manual'
  moved_by_user_id uuid,                         -- ID менеджера (если manual)
  rule_id uuid REFERENCES crm_stage_rules(id) ON DELETE SET NULL,  -- какое правило сработало
  note text,                                     -- комментарий
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_movement_log_customer ON crm_movement_log(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_movement_log_board ON crm_movement_log(board_id);

-- 6. RLS
ALTER TABLE crm_stage_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their stage rules" ON crm_stage_rules;
CREATE POLICY "Users manage their stage rules" ON crm_stage_rules
  FOR ALL USING (
    stage_id IN (
      SELECT s.id FROM crm_board_stages s
      JOIN crm_boards b ON s.board_id = b.id
      JOIN projects p ON b.project_id = p.id
      WHERE p.owner_id = auth.uid()
    )
  );

ALTER TABLE crm_stage_rule_fired ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see their fired rules" ON crm_stage_rule_fired;
CREATE POLICY "Users see their fired rules" ON crm_stage_rule_fired
  FOR SELECT USING (
    customer_id IN (
      SELECT id FROM customers WHERE project_id IN (
        SELECT id FROM projects WHERE owner_id = auth.uid()
      )
    )
  );

ALTER TABLE crm_movement_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see their movement logs" ON crm_movement_log;
CREATE POLICY "Users see their movement logs" ON crm_movement_log
  FOR SELECT USING (
    board_id IN (
      SELECT id FROM crm_boards WHERE project_id IN (
        SELECT id FROM projects WHERE owner_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- 11-traffic-analytics.sql
-- ============================================================================
-- ============================================================================
-- 11. Сквозная аналитика трафика + трекинг подписок Telegram
-- ============================================================================

-- 1. Статус подписки бота в карточке клиента
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bot_subscribed boolean DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bot_blocked boolean DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bot_subscribed_at timestamptz;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bot_blocked_at timestamptz;

-- 2. Статус подписки на канал
ALTER TABLE customers ADD COLUMN IF NOT EXISTS channel_subscribed boolean DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS channel_subscribed_at timestamptz;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS channel_left_at timestamptz;

-- 3. Привязка канала к боту
ALTER TABLE telegram_bots ADD COLUMN IF NOT EXISTS channel_id text;
ALTER TABLE telegram_bots ADD COLUMN IF NOT EXISTS channel_username text;

-- 4. Новые action_type enum значения для timeline
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'bot_subscribed';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'bot_blocked';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'bot_unsubscribed';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'channel_subscribed';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'channel_unsubscribed';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'crm_auto_move';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'crm_manual_move';

-- ============================================================================
-- 12-event-triggers-v2.sql
-- ============================================================================
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

-- ============================================================================
-- 13-trigger-groups.sql
-- ============================================================================
-- =====================================================
-- Trigger groups v3: триггер = событие + immediate сообщение + N дожимов
-- =====================================================
-- Логика:
--   1 "триггер" в UI = group_id
--   Строки scenario_event_triggers с одинаковым group_id — связаны.
--   Все сообщения этой группы хранятся в scenario_messages с parent_trigger_group_id=group_id
--   и НЕ показываются в основной вкладке Сценарий.
--
--   Immediate (сразу при событии): is_negative=false, wait_minutes=0
--   Дожим (если НЕ случилось): is_negative=true, wait_minutes=X, cancel_on_event_type=...

ALTER TABLE scenario_event_triggers ADD COLUMN IF NOT EXISTS group_id uuid;
ALTER TABLE scenario_event_triggers ADD COLUMN IF NOT EXISTS sort_in_group int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_event_trigger_group ON scenario_event_triggers(group_id);

ALTER TABLE scenario_messages ADD COLUMN IF NOT EXISTS parent_trigger_group_id uuid;
CREATE INDEX IF NOT EXISTS idx_scenario_msg_trigger_group ON scenario_messages(parent_trigger_group_id) WHERE parent_trigger_group_id IS NOT NULL;

-- ============================================================================
-- 14-trigger-wait-units.sql
-- ============================================================================
-- Wait units for trigger followups: сек/мин/час/день (как в сценарных сообщениях)
ALTER TABLE scenario_event_triggers ADD COLUMN IF NOT EXISTS wait_value int NOT NULL DEFAULT 0;
ALTER TABLE scenario_event_triggers ADD COLUMN IF NOT EXISTS wait_unit text NOT NULL DEFAULT 'min';
-- Backfill from existing wait_minutes
UPDATE scenario_event_triggers
SET wait_value = wait_minutes, wait_unit = 'min'
WHERE wait_minutes > 0 AND wait_value = 0;

-- ============================================================================
-- 15-trigger-enabled.sql
-- ============================================================================
-- enabled flag: чтобы галочка в UI просто включала/выключала триггер,
-- а не удаляла сообщение. Сообщение остаётся, спойлер не дёргается.
ALTER TABLE scenario_event_triggers ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_event_trigger_enabled ON scenario_event_triggers(enabled);

-- ============================================================================
-- 16-telegram-invite-links.sql
-- ============================================================================
-- =====================================================
-- Telegram invite links для источников трафика (как у Vortex)
-- =====================================================
-- Источник трафика типа "ведёт в канал" получает автоматически созданную
-- именную invite-ссылку через Telegram Bot API. При подписке по ней
-- webhook chat_member приносит invite_link.name — по нему находим source.

ALTER TABLE traffic_sources ADD COLUMN IF NOT EXISTS telegram_bot_id uuid REFERENCES telegram_bots(id) ON DELETE SET NULL;
ALTER TABLE traffic_sources ADD COLUMN IF NOT EXISTS telegram_channel_id bigint;
ALTER TABLE traffic_sources ADD COLUMN IF NOT EXISTS telegram_channel_title text;
ALTER TABLE traffic_sources ADD COLUMN IF NOT EXISTS telegram_invite_link text;
ALTER TABLE traffic_sources ADD COLUMN IF NOT EXISTS telegram_invite_name text;
ALTER TABLE traffic_sources ADD COLUMN IF NOT EXISTS telegram_invite_member_count int NOT NULL DEFAULT 0;

-- Уникальное имя ссылки на проект — чтобы при webhook быстро найти source
CREATE UNIQUE INDEX IF NOT EXISTS uniq_traffic_invite_name ON traffic_sources(project_id, telegram_invite_name) WHERE telegram_invite_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_traffic_invite_name_lookup ON traffic_sources(telegram_invite_name) WHERE telegram_invite_name IS NOT NULL;

-- ============================================================================
-- 17-landing-mini-app.sql
-- ============================================================================
-- Mini App flag для лендингов.
-- Когда is_mini_app=true — страница /s/[slug] дополнительно грузит
-- telegram-web-app.js и при открытии внутри Telegram читает initData
-- (telegram_id клиента). Это закрывает identity stitching для сайтов.
ALTER TABLE landings ADD COLUMN IF NOT EXISTS is_mini_app boolean NOT NULL DEFAULT false;

-- ============================================================================
-- 18-social-module.sql
-- ============================================================================
-- =====================================================
-- Модуль "Соцсети" — фундамент
-- =====================================================
-- Пока — только Telegram. Схема универсальная: platform-поле позволяет
-- добавить Instagram/YouTube/TikTok без миграций.

-- 1. Подключённые соцаккаунты проекта
CREATE TABLE IF NOT EXISTS social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform text NOT NULL,                    -- 'telegram' | 'instagram' | 'youtube' | 'tiktok'
  external_id text NOT NULL,                 -- channel_id / ig_user_id / yt_channel_id (строка для универсальности)
  external_username text,                    -- @channelname / @igusername / handle
  external_title text,                       -- отображаемое имя
  external_avatar_url text,
  telegram_bot_id uuid REFERENCES telegram_bots(id) ON DELETE SET NULL, -- для Telegram: какой бот админит канал
  credentials_encrypted text,                -- для будущих OAuth-токенов (MTProto session, IG access_token и т.д.)
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  connected_at timestamptz DEFAULT now(),
  last_sync_at timestamptz,
  sync_error text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_social_project_platform_external
  ON social_accounts(project_id, platform, external_id);
CREATE INDEX IF NOT EXISTS idx_social_platform ON social_accounts(platform) WHERE is_active = true;

-- 2. Единицы контента (посты / Reels / ролики)
CREATE TABLE IF NOT EXISTS social_content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  external_id text NOT NULL,                 -- message_id для Telegram, ig_media_id для Instagram, video_id для YT
  type text NOT NULL,                        -- 'tg_post' | 'ig_post' | 'ig_reel' | 'yt_video' и т.д.
  title text,                                -- первая строка поста / название ролика
  body text,                                 -- текст поста (для Telegram можем хранить)
  url text,                                  -- публичный URL единицы контента
  thumbnail_url text,
  published_at timestamptz,
  -- Метрики: views, reactions, comments, saves, clicks и т.д. Живут в JSON чтобы не плодить колонки
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_metrics_update_at timestamptz,
  -- Привязка к источнику трафика — если для этой единицы создана наша trackable-ссылка
  traffic_source_id uuid REFERENCES traffic_sources(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_social_item_external
  ON social_content_items(account_id, external_id);
CREATE INDEX IF NOT EXISTS idx_social_item_published ON social_content_items(account_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_item_source ON social_content_items(traffic_source_id) WHERE traffic_source_id IS NOT NULL;

-- 3. История подписок/отписок
CREATE TABLE IF NOT EXISTS social_subscribers_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  external_user_id text NOT NULL,            -- telegram_id / ig_user_id / yt_channel_id
  username text,
  first_name text,
  action text NOT NULL,                      -- 'join' | 'leave'
  invite_link_name text,                     -- для Telegram: какой invite-link использован (связка с traffic_source)
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subs_log_account_at ON social_subscribers_log(account_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_subs_log_user ON social_subscribers_log(account_id, external_user_id);
CREATE INDEX IF NOT EXISTS idx_subs_log_customer ON social_subscribers_log(customer_id) WHERE customer_id IS NOT NULL;

-- 4. Снапшоты счётчика подписчиков (для графика прироста за период)
CREATE TABLE IF NOT EXISTS social_subscribers_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  subscribers_count int NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subs_snap_account_at ON social_subscribers_snapshots(account_id, at DESC);

-- RLS
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_subscribers_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_subscribers_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see their project social_accounts" ON social_accounts;
CREATE POLICY "Users see their project social_accounts" ON social_accounts
  FOR ALL USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Users see their project social_content" ON social_content_items;
CREATE POLICY "Users see their project social_content" ON social_content_items
  FOR ALL USING (account_id IN (SELECT id FROM social_accounts WHERE project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())));

DROP POLICY IF EXISTS "Users see their project social_subs_log" ON social_subscribers_log;
CREATE POLICY "Users see their project social_subs_log" ON social_subscribers_log
  FOR ALL USING (account_id IN (SELECT id FROM social_accounts WHERE project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())));

DROP POLICY IF EXISTS "Users see their project social_subs_snap" ON social_subscribers_snapshots;
CREATE POLICY "Users see their project social_subs_snap" ON social_subscribers_snapshots
  FOR ALL USING (account_id IN (SELECT id FROM social_accounts WHERE project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())));

-- ============================================================================
-- 19-mtproto.sql
-- ============================================================================
-- =====================================================
-- MTProto — продвинутая статистика Telegram-каналов через user-аккаунт
-- =====================================================
-- Все чувствительные поля (api_hash, session, phone) хранятся как
-- bytea — зашифрованы AES-256-GCM на application-уровне.
-- Ключ шифрования: env var MTPROTO_ENCRYPTION_KEY (32 bytes hex).

ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS mtproto_api_id int;
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS mtproto_api_hash_enc text;
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS mtproto_session_enc text;
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS mtproto_phone_enc text;
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS mtproto_status text;  -- null | 'connected' | 'error'
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS mtproto_connected_at timestamptz;
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS mtproto_last_sync_at timestamptz;
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS mtproto_last_error text;

-- Временные login-потоки (между "ввёл телефон" и "ввёл код из SMS")
-- Живут ~10 минут.
CREATE TABLE IF NOT EXISTS social_mtproto_login_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid,                              -- auth.uid() владельца
  api_id int NOT NULL,
  api_hash_enc text NOT NULL,
  phone_enc text NOT NULL,
  phone_code_hash_enc text NOT NULL,         -- возвращает Telegram после auth.sendCode
  session_seed_enc text NOT NULL,            -- StringSession в процессе подключения
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes')
);

CREATE INDEX IF NOT EXISTS idx_mtproto_login_project ON social_mtproto_login_flows(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mtproto_login_expires ON social_mtproto_login_flows(expires_at);

ALTER TABLE social_mtproto_login_flows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see their project mtproto flows" ON social_mtproto_login_flows;
CREATE POLICY "Users see their project mtproto flows" ON social_mtproto_login_flows
  FOR ALL USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- ============================================================================
-- 20-manager-conversations.sql
-- ============================================================================
-- =====================================================
-- Менеджер-аккаунты (MTProto user) + личные переписки с клиентами
-- =====================================================
-- manager_accounts — подключённые через MTProto Telegram-аккаунты для
--   ведения личных переписок с клиентами. Session шифрована, воркер
--   раз в минуту тянет новые входящие сообщения в ЛС.
-- manager_conversations — один диалог = один клиент × один менеджер-аккаунт.
-- manager_messages — лента сообщений конкретного диалога (в обе стороны).

CREATE TABLE IF NOT EXISTS manager_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text,                                 -- юзер может задать метку: "Хасан (продажи)"
  telegram_user_id bigint,                    -- id пользователя Telegram (после первого подключения)
  telegram_username text,
  telegram_first_name text,
  telegram_phone text,                        -- последние 4 цифры для UI, полный номер в _enc
  mtproto_api_id int NOT NULL,
  mtproto_api_hash_enc text NOT NULL,
  mtproto_session_enc text NOT NULL,
  mtproto_phone_enc text NOT NULL,
  status text NOT NULL DEFAULT 'active',      -- 'active' | 'error' | 'disabled'
  last_error text,
  last_pulled_update_id bigint,               -- для updates-dedup
  initial_import_done boolean NOT NULL DEFAULT false,
  connected_at timestamptz DEFAULT now(),
  last_sync_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manager_accounts_project ON manager_accounts(project_id) WHERE status = 'active';

-- Один диалог = менеджер-аккаунт + telegram_user_id собеседника
CREATE TABLE IF NOT EXISTS manager_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_account_id uuid NOT NULL REFERENCES manager_accounts(id) ON DELETE CASCADE,
  peer_telegram_id bigint NOT NULL,
  peer_username text,
  peer_first_name text,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',         -- 'open' | 'closed'
  last_incoming_at timestamptz,
  last_outgoing_at timestamptz,
  last_message_at timestamptz,
  unread_count int NOT NULL DEFAULT 0,         -- непрочитанные со стороны менеджера
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_manager_conv ON manager_conversations(manager_account_id, peer_telegram_id);
CREATE INDEX IF NOT EXISTS idx_manager_conv_customer ON manager_conversations(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_manager_conv_last_msg ON manager_conversations(manager_account_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_manager_conv_unread ON manager_conversations(manager_account_id, unread_count) WHERE unread_count > 0;

CREATE TABLE IF NOT EXISTS manager_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES manager_conversations(id) ON DELETE CASCADE,
  telegram_message_id bigint NOT NULL,
  direction text NOT NULL,                     -- 'incoming' | 'outgoing'
  text text,
  media_type text,                             -- 'photo' | 'video' | 'document' | 'voice' | 'sticker'
  media_url text,
  sent_at timestamptz NOT NULL,
  read_by_manager_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_manager_msg ON manager_messages(conversation_id, telegram_message_id);
CREATE INDEX IF NOT EXISTS idx_manager_msg_conv_sent ON manager_messages(conversation_id, sent_at DESC);

-- RLS
ALTER TABLE manager_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Project members can manage manager accounts" ON manager_accounts;
CREATE POLICY "Project members can manage manager accounts" ON manager_accounts
  FOR ALL USING (is_project_member(project_id));

DROP POLICY IF EXISTS "Project members can see conversations" ON manager_conversations;
CREATE POLICY "Project members can see conversations" ON manager_conversations
  FOR ALL USING (manager_account_id IN (SELECT id FROM manager_accounts WHERE is_project_member(project_id)));

DROP POLICY IF EXISTS "Project members can see messages" ON manager_messages;
CREATE POLICY "Project members can see messages" ON manager_messages
  FOR ALL USING (conversation_id IN (
    SELECT mc.id FROM manager_conversations mc
    JOIN manager_accounts ma ON ma.id = mc.manager_account_id
    WHERE is_project_member(ma.project_id)
  ));

-- =====================================================
-- Клики по кнопкам (для прокси-редиректа /btn/<token>)
-- =====================================================
CREATE TABLE IF NOT EXISTS button_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  button_id uuid REFERENCES scenario_buttons(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  destination_url text NOT NULL,
  user_agent text,
  ip_hash text,
  referrer text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_btn_clicks_project_at ON button_clicks(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_btn_clicks_button ON button_clicks(button_id) WHERE button_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_btn_clicks_customer ON button_clicks(customer_id) WHERE customer_id IS NOT NULL;

ALTER TABLE button_clicks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Project members see button clicks" ON button_clicks;
CREATE POLICY "Project members see button clicks" ON button_clicks
  FOR ALL USING (is_project_member(project_id));

-- =====================================================
-- Проверка подписки на канал — новый тип сообщения в сценарии
-- =====================================================
-- Используем существующие scenario_messages, добавляем поля:
ALTER TABLE scenario_messages ADD COLUMN IF NOT EXISTS is_subscription_gate boolean NOT NULL DEFAULT false;
ALTER TABLE scenario_messages ADD COLUMN IF NOT EXISTS gate_channel_account_id uuid REFERENCES social_accounts(id) ON DELETE SET NULL;

-- Pending gates: клиенты, которые не прошли gate и ждут подписки на канал.
-- При webhook chat_member (join) → находим pending и продолжаем цепочку.
CREATE TABLE IF NOT EXISTS pending_subscription_gates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chatbot_conversations(id) ON DELETE CASCADE,
  gate_message_id uuid NOT NULL REFERENCES scenario_messages(id) ON DELETE CASCADE,
  channel_account_id uuid REFERENCES social_accounts(id) ON DELETE CASCADE,
  channel_telegram_id bigint,
  telegram_user_id bigint NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_gates_lookup ON pending_subscription_gates(channel_telegram_id, telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_pending_gates_user ON pending_subscription_gates(telegram_user_id);

-- ============================================================================
-- 21-manager-grants.sql
-- ============================================================================
-- Доступы к менеджер-аккаунтам (для сотрудников/ролей)
-- Owner проекта видит все аккаунты. Остальным доступ выдаётся явно.
CREATE TABLE IF NOT EXISTS manager_account_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_account_id uuid NOT NULL REFERENCES manager_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_manager_grant ON manager_account_grants(manager_account_id, user_id);
CREATE INDEX IF NOT EXISTS idx_manager_grants_user ON manager_account_grants(user_id);

ALTER TABLE manager_account_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Project members see grants" ON manager_account_grants;
CREATE POLICY "Project members see grants" ON manager_account_grants
  FOR ALL USING (manager_account_id IN (SELECT id FROM manager_accounts WHERE is_project_member(project_id)));

-- Описание (для заметок менеджера)
ALTER TABLE manager_accounts ADD COLUMN IF NOT EXISTS description text;

-- ============================================================================
-- 22-conversation-preview.sql
-- ============================================================================
-- Превью последнего сообщения в manager_conversations (для списка диалогов)
ALTER TABLE manager_conversations ADD COLUMN IF NOT EXISTS last_message_preview text;
ALTER TABLE manager_conversations ADD COLUMN IF NOT EXISTS last_message_direction text;

-- Бэкфилл по существующим диалогам (для уже импортированных)
UPDATE manager_conversations mc SET
  last_message_preview = sub.text,
  last_message_direction = sub.direction
FROM (
  SELECT DISTINCT ON (conversation_id) conversation_id, text, direction
  FROM manager_messages
  ORDER BY conversation_id, sent_at DESC
) sub
WHERE sub.conversation_id = mc.id AND (mc.last_message_preview IS NULL);

-- ============================================================================
-- 23-manager-unread-trigger.sql
-- ============================================================================
-- Надёжный счётчик непрочитанных: триггер на insert в manager_messages
-- плюс бэкфилл по существующим диалогам.

-- Функция-триггер: на каждое incoming-сообщение инкрементит unread_count
CREATE OR REPLACE FUNCTION bump_manager_unread() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.direction = 'incoming' THEN
    UPDATE manager_conversations
    SET unread_count = COALESCE(unread_count, 0) + 1
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS manager_messages_bump_unread ON manager_messages;
CREATE TRIGGER manager_messages_bump_unread
  AFTER INSERT ON manager_messages
  FOR EACH ROW EXECUTE FUNCTION bump_manager_unread();

-- Бэкфилл: у существующих диалогов считаем реальное количество непрочитанных
-- как все incoming-сообщения после последнего исходящего от менеджера.
-- Если менеджер никогда не писал — все incoming считаются непрочитанными.
UPDATE manager_conversations mc SET unread_count = sub.cnt
FROM (
  SELECT
    mm.conversation_id,
    COUNT(*) AS cnt
  FROM manager_messages mm
  JOIN manager_conversations mc2 ON mc2.id = mm.conversation_id
  WHERE mm.direction = 'incoming'
    AND (mc2.last_outgoing_at IS NULL OR mm.sent_at > mc2.last_outgoing_at)
  GROUP BY mm.conversation_id
) sub
WHERE sub.conversation_id = mc.id;

-- ============================================================================
-- 24-manager-last-read.sql
-- ============================================================================
-- Переделка unread на основе last_read_at:
-- непрочитанное = incoming сообщения с sent_at > last_read_at
-- При клике на диалог в UI ставим last_read_at = NOW(), unread_count=0.
-- При новом INSERT incoming — триггер пересчитывает unread_count для этого диалога.

ALTER TABLE manager_conversations ADD COLUMN IF NOT EXISTS last_read_at timestamptz DEFAULT now();

-- Существующие диалоги считаем «прочитанными» (last_read_at = max last_incoming_at)
-- — все текущие сообщения в Telegram юзер уже видел, считать их как unread некорректно.
UPDATE manager_conversations SET last_read_at = NOW(), unread_count = 0 WHERE last_read_at IS NULL OR unread_count > 0;

-- Перерисовываем триггер: теперь пересчитывает unread корректно на основе last_read_at
CREATE OR REPLACE FUNCTION bump_manager_unread() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.direction = 'incoming' THEN
    UPDATE manager_conversations
    SET unread_count = (
      SELECT COUNT(*) FROM manager_messages mm
      WHERE mm.conversation_id = NEW.conversation_id
        AND mm.direction = 'incoming'
        AND mm.sent_at > COALESCE(manager_conversations.last_read_at, '1970-01-01'::timestamptz)
    )
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END $$;

-- ============================================================================
-- 25-drop-unread-trigger.sql
-- ============================================================================
-- Убираем bump_manager_unread: unread_count теперь управляется целиком
-- из Telegram (поле dialog.unreadCount в GetDialogs). Триггер больше не нужен.
DROP TRIGGER IF EXISTS manager_messages_bump_unread ON manager_messages;
DROP FUNCTION IF EXISTS bump_manager_unread();

-- last_read_at больше не используется — оставляем колонку для совместимости
-- (не трогаем данные).

-- ============================================================================
-- 26-gate-button-label.sql
-- ============================================================================
-- =====================================================
-- Кастомный лейбл для автогенерируемой кнопки gate
-- =====================================================
-- Сам URL кнопки жёстко формируется в рантайме (прокси /gate/<msgId>),
-- пользователь может поменять только её текст. Default: "Подписаться".

ALTER TABLE scenario_messages ADD COLUMN IF NOT EXISTS gate_button_label text;

-- ============================================================================
-- 27-normalize-message-positions.sql
-- ============================================================================
-- =====================================================
-- Нормализация order_position у сообщений сценария
-- =====================================================
-- После создания/удаления через AI-агента позиции могут иметь дыры
-- (0,1,2,3,7,11 вместо 0,1,2,3,4,5). Функция пересчитывает последовательно.
-- Работает только на сообщениях основного пула (parent_trigger_group_id IS NULL),
-- триггерные сообщения имеют свою раскладку.

CREATE OR REPLACE FUNCTION normalize_scenario_message_positions(p_scenario_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY order_position, created_at) - 1 AS new_pos
    FROM scenario_messages
    WHERE scenario_id = p_scenario_id
      AND parent_trigger_group_id IS NULL
  )
  UPDATE scenario_messages m
  SET order_position = o.new_pos::int
  FROM ordered o
  WHERE m.id = o.id AND m.order_position <> o.new_pos::int;
END;
$$;

-- ============================================================================
-- 28-followup-buttons.sql
-- ============================================================================
-- =====================================================
-- Кнопки у дожимов (message_followups)
-- =====================================================
-- Раньше scenario_buttons была привязана строго к scenario_messages.
-- Теперь кнопка может принадлежать либо сообщению, либо дожиму — ровно одному.

ALTER TABLE scenario_buttons ALTER COLUMN message_id DROP NOT NULL;
ALTER TABLE scenario_buttons ADD COLUMN IF NOT EXISTS followup_id uuid REFERENCES message_followups(id) ON DELETE CASCADE;

-- Ровно один из двух должен быть заполнен
ALTER TABLE scenario_buttons DROP CONSTRAINT IF EXISTS scenario_buttons_owner_check;
ALTER TABLE scenario_buttons ADD CONSTRAINT scenario_buttons_owner_check
  CHECK ((message_id IS NOT NULL AND followup_id IS NULL) OR (message_id IS NULL AND followup_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_scenario_buttons_followup ON scenario_buttons(followup_id) WHERE followup_id IS NOT NULL;

-- ============================================================================
-- 29-broadcasts-v2.sql
-- ============================================================================
-- ============================================================================
-- 29: Рассылки v2 — синхронизация схемы с кодом + трекинг блоков сценария
-- ============================================================================
-- Проблема: БД содержит старую схему broadcasts (content/delivered/failed/filter_tags),
-- а код ожидает новую (text/segment_type/segment_value/media_*/sent_count/failed_count).
-- При создании рассылки insert падал с ошибкой "column does not exist" → ничего не сохранялось.
--
-- Фикс: добавляем недостающие колонки, синхронизируем данные, снимаем NOT NULL
-- с устаревших полей чтобы код мог игнорировать их.
--
-- Плюс: добавляем scenario_message_id в chatbot_messages — чтобы можно было
-- сегментировать рассылку по «был/не был в конкретном блоке сценария».
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. broadcasts: привести схему к виду которого ожидает код
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS text text;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS media_id uuid REFERENCES media_library(id) ON DELETE SET NULL;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS media_type text;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS segment_type text NOT NULL DEFAULT 'all';
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS segment_value text;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS sent_count int DEFAULT 0;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS failed_count int DEFAULT 0;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS email_subject text;

-- Переносим данные из старых колонок если они есть
UPDATE broadcasts SET text = content WHERE text IS NULL AND content IS NOT NULL;
UPDATE broadcasts SET sent_count = delivered WHERE sent_count = 0 AND delivered IS NOT NULL;
UPDATE broadcasts SET failed_count = failed WHERE failed_count = 0 AND failed IS NOT NULL;

-- Снимаем NOT NULL с legacy-колонок чтобы insert не требовал их
ALTER TABLE broadcasts ALTER COLUMN content DROP NOT NULL;
ALTER TABLE broadcasts ALTER COLUMN telegram_bot_id DROP NOT NULL;

-- Индекс для cron-сканирования запланированных рассылок
CREATE INDEX IF NOT EXISTS idx_broadcasts_scheduled
  ON broadcasts(scheduled_at) WHERE status = 'scheduled';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. chatbot_messages: трекинг какой блок сценария был отправлен клиенту
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE chatbot_messages
  ADD COLUMN IF NOT EXISTS scenario_message_id uuid
  REFERENCES scenario_messages(id) ON DELETE SET NULL;

-- Индексы для быстрого поиска «клиенты у которых был блок X»
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_scenario_message
  ON chatbot_messages(scenario_message_id)
  WHERE scenario_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chatbot_messages_conv_scenario_msg
  ON chatbot_messages(conversation_id, scenario_message_id)
  WHERE scenario_message_id IS NOT NULL;

-- ============================================================================
-- 30-bot-chat-blocked.sql
-- ============================================================================
-- ============================================================================
-- 30: chat_blocked флаг для conversations — трекинг заблокировавших бота
-- ============================================================================
-- Проблема: рассылка на «всех клиентов проекта» слала 25 сообщений, хотя
-- боту /start нажали только 3. Telegram не даёт боту инициировать диалог —
-- возвращает 403 / chat not found. В итоге показывало «получателей 25, ошибок 21».
--
-- Фикс: рассылки теперь берут получателей из chatbot_conversations этого бота
-- (=реальные подписчики). Плюс при ошибке 403 от Telegram ставим chat_blocked=true
-- и больше не шлём этому клиенту.
-- ============================================================================

ALTER TABLE chatbot_conversations
  ADD COLUMN IF NOT EXISTS chat_blocked boolean DEFAULT false;

-- Индекс для быстрой выборки активных подписчиков конкретного бота при рассылке
CREATE INDEX IF NOT EXISTS idx_chatbot_conversations_active_subscribers
  ON chatbot_conversations(telegram_bot_id, customer_id)
  WHERE chat_blocked = false AND customer_id IS NOT NULL;

-- ============================================================================
-- 31-broadcasts-buttons-media.sql
-- ============================================================================
-- ============================================================================
-- 31: Кнопки в рассылках + медиа уже было в 29
-- ============================================================================
-- Формат: массив объектов [{text: string, url: string}]
-- Поддерживаем только url-кнопки — callback/goto/trigger не имеют смысла
-- для рассылки (она вне сценария бота).
-- ============================================================================

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS buttons jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ============================================================================
-- 32-restore-lost-conversations.sql
-- ============================================================================
-- ============================================================================
-- 32: Восстановить потерянные conversations для исторических /start
-- ============================================================================
-- Проблема: у некоторых клиентов есть customer_actions.action='bot_start'
-- (делали /start боту в прошлом), есть telegram_id в customers, но НЕТ
-- записи в chatbot_conversations — видимо бот переподключался или был
-- ручной DELETE.
--
-- Старые рассылки слали напрямую по customers.telegram_id и им доходило.
-- Новая логика (после 30) фильтрует по chatbot_conversations — такие
-- клиенты выпадают из подсчёта и рассылки.
--
-- Фикс: для каждого клиента с bot_start и без conversation — создаём
-- conversation. Если клиент тем временем заблокировал бота, при первой
-- же рассылке Telegram вернёт 403, и мы корректно пометим chat_blocked.
-- ============================================================================

INSERT INTO chatbot_conversations (
  telegram_bot_id,
  telegram_chat_id,
  telegram_user_id,
  telegram_username,
  telegram_first_name,
  customer_id,
  chat_blocked
)
SELECT DISTINCT
  tb.id,
  CAST(c.telegram_id AS bigint),
  CAST(c.telegram_id AS bigint),
  c.telegram_username,
  c.full_name,
  c.id,
  false
FROM customers c
JOIN telegram_bots tb ON tb.project_id = c.project_id AND tb.is_active = true
WHERE c.telegram_id IS NOT NULL
  AND c.telegram_id ~ '^[0-9]+$'
  AND CAST(c.telegram_id AS bigint) > 0
  AND EXISTS (
    SELECT 1 FROM customer_actions ca
    WHERE ca.customer_id = c.id AND ca.action = 'bot_start'
  )
  AND NOT EXISTS (
    SELECT 1 FROM chatbot_conversations cc
    WHERE cc.customer_id = c.id AND cc.telegram_bot_id = tb.id
  )
ON CONFLICT (telegram_bot_id, telegram_chat_id) DO UPDATE SET
  customer_id = EXCLUDED.customer_id,
  chat_blocked = false;

-- ============================================================================
-- 33-bot-blocked-source.sql
-- ============================================================================
-- ============================================================================
-- 33: Источник пометки bot_blocked — различаем точное vs приблизительное время
-- ============================================================================
-- Когда клиент заблокировал бота, мы узнаём об этом тремя путями:
--  - 'webhook' — Telegram шлёт my_chat_member в реальном времени (точно)
--  - 'sync'    — cron ping через sendChatAction обнаружил 403 (не позднее этого)
--  - 'broadcast' — рассылка получила 403 при попытке отправки (не позднее этого)
--
-- В UI показываем пользователю так: для 'webhook' — «Заблокировал в HH:MM»,
-- для 'sync'/'broadcast' — «Обнаружено HH:MM» (реально мог заблокировать раньше).
-- ============================================================================

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS bot_blocked_source text;

-- ============================================================================
-- 34-landing-blocks.sql
-- ============================================================================
-- ============================================================================
-- 34: Блочный редактор лендингов
-- ============================================================================
-- Лендинг теперь состоит из упорядоченных БЛОКОВ. У каждого блока:
--   - общий контент (HTML / или структурированные поля в зависимости от типа)
--   - отдельные стили для desktop и mobile (mobile применяется через @media)
--   - свой тип (custom_html / hero / text / image / video / cta / zero)
--
-- Существующие лендинги (у которых html_content монолитный) НЕ ломаются:
-- landings.html_content остаётся. Публичный рендер на /s/[slug] сначала
-- смотрит landing_blocks — если там есть блоки, собирает из них. Если нет —
-- фолбэк на старый html_content.
--
-- Миграция существующих: отдельный скрипт / lazy-миграция при первом
-- открытии лендинга в редакторе (заворачиваем html_content в один блок
-- типа custom_html). Здесь только схема — данные мигрируем в коде.
-- ============================================================================

CREATE TABLE IF NOT EXISTS landing_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_id uuid NOT NULL REFERENCES landings(id) ON DELETE CASCADE,
  order_position int NOT NULL DEFAULT 0,
  block_type text NOT NULL DEFAULT 'custom_html',
    -- Типы блоков:
    --   custom_html — сырой HTML, для продвинутых и для импорта старых лендингов
    --   hero        — заголовок + подзаголовок + CTA (типизированный)
    --   text        — параграф(ы) текста
    --   image       — одна картинка (URL + alt + размер)
    --   video       — встроенное видео ({{video:UUID}})
    --   cta         — большая кнопка-призыв
    --   zero        — холст с абсолютно позиционированными элементами (добавим во 2-й день)
  name text,                        -- человеко-читаемое имя («Hero с видео», «Призыв купить»)
  html_content text,                -- для custom_html / hero / text / cta — сгенерированный или вручную написанный HTML
  content jsonb DEFAULT '{}'::jsonb, -- структурированные данные для типизированных блоков
                                     -- пример для hero: { headline, subheadline, ctaText, ctaUrl, bgColor }
  desktop_styles jsonb DEFAULT '{}'::jsonb, -- { "selector": { "prop": "value" } }
  mobile_styles  jsonb DEFAULT '{}'::jsonb, -- override'ы для @media (max-width: 640px)
  layout jsonb DEFAULT '{}'::jsonb,  -- { paddingY, maxWidth, align, hideOnMobile, hideOnDesktop, bgColor, bgImage }
  is_hidden boolean NOT NULL DEFAULT false, -- временно скрыть блок не удаляя
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Быстро получить все блоки лендинга в порядке
CREATE INDEX IF NOT EXISTS idx_landing_blocks_landing
  ON landing_blocks(landing_id, order_position);

-- Триггер на updated_at
CREATE OR REPLACE FUNCTION update_landing_blocks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS landing_blocks_updated_at ON landing_blocks;
CREATE TRIGGER landing_blocks_updated_at
  BEFORE UPDATE ON landing_blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_landing_blocks_updated_at();

-- RLS — блоки видны тому же, кому виден сам лендинг
ALTER TABLE landing_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS landing_blocks_read ON landing_blocks;
CREATE POLICY landing_blocks_read ON landing_blocks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM landings l
      WHERE l.id = landing_blocks.landing_id
        AND l.project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS landing_blocks_write ON landing_blocks;
CREATE POLICY landing_blocks_write ON landing_blocks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM landings l
      WHERE l.id = landing_blocks.landing_id
        AND l.project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM landings l
      WHERE l.id = landing_blocks.landing_id
        AND l.project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
    )
  );

-- Service role бекенд ходит мимо RLS (наши API-роуты используют SUPABASE_SERVICE_ROLE_KEY)

-- Флаг на landings: переведён ли лендинг на блочную архитектуру.
-- Нужен чтобы публичный рендер /s/[slug] знал: читать блоки или html_content.
ALTER TABLE landings ADD COLUMN IF NOT EXISTS is_blocks_based boolean NOT NULL DEFAULT false;

COMMENT ON TABLE landing_blocks IS
  'Блоки лендинга — упорядоченные секции со своим контентом и раздельными стилями для desktop/mobile.';
COMMENT ON COLUMN landing_blocks.block_type IS
  'Тип блока: custom_html / hero / text / image / video / cta / zero';
COMMENT ON COLUMN landing_blocks.desktop_styles IS
  'CSS-override для десктопа: {"h1": {"font-size": "54px"}}';
COMMENT ON COLUMN landing_blocks.mobile_styles IS
  'CSS-override для мобилки — попадёт внутрь @media (max-width: 640px)';
COMMENT ON COLUMN landing_blocks.layout IS
  'Лейаут-параметры блока: paddingY, maxWidth, align, bgColor, bgImage, hideOnMobile, hideOnDesktop';

