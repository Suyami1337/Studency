-- ============================================================================
-- APPLY ALL — единый SQL файл для миграций Studency
-- Запусти целиком в Supabase SQL Editor. Идемпотентен.
--
-- ВАЖНО: перед запуском создай Storage bucket вручную:
--   Supabase → Storage → New bucket → chatbot-media → Public ✅
-- ============================================================================


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

