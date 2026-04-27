-- ─── Phase: Sites/Bot tracking pro 2026-04-27 ───
-- 1. Расширяем action_type enum: новые виды событий с лендинга и видеоплеера
-- 2. Добавляем first_touch_* поля на customers — атрибуция трафика
-- 3. Индекс на customers(project_id, telegram_id) для cron auto-merge
-- 4. Индекс на customers(project_id, email) и (project_id, phone) для дедупа

-- ───────────── enum action_type ─────────────
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'page_view_end';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'scroll_25';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'scroll_50';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'scroll_75';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'scroll_100';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'video_milestone_25';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'video_milestone_50';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'video_milestone_75';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'video_started';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'video_completed';

-- ───────────── first_touch attribution ─────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS first_touch_at        timestamptz,
  ADD COLUMN IF NOT EXISTS first_touch_kind      text,    -- 'landing' | 'bot' | 'channel' | 'direct'
  ADD COLUMN IF NOT EXISTS first_touch_source    text,    -- произвольное название (utm_source, source.name, ...)
  ADD COLUMN IF NOT EXISTS first_touch_landing_id uuid,
  ADD COLUMN IF NOT EXISTS first_touch_referrer  text,
  ADD COLUMN IF NOT EXISTS first_touch_url       text,
  ADD COLUMN IF NOT EXISTS first_touch_utm       jsonb;

CREATE INDEX IF NOT EXISTS idx_customers_first_touch_at ON customers(project_id, first_touch_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_first_touch_kind ON customers(project_id, first_touch_kind);

-- ───────────── индексы для cron-merge ─────────────
CREATE INDEX IF NOT EXISTS idx_customers_proj_tg ON customers(project_id, telegram_id) WHERE telegram_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_proj_email ON customers(project_id, email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_proj_phone ON customers(project_id, phone) WHERE phone IS NOT NULL;
