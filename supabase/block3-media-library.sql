-- Централизованная медиа-библиотека: все файлы проекта в одном месте
-- с автоматическим отслеживанием где используются и автоочисткой

-- ============================================================
-- 1. Таблица медиа-файлов
-- ============================================================
CREATE TABLE IF NOT EXISTS media_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,    -- путь в bucket ({project_id}/{random}.ext)
  public_url text NOT NULL,             -- полный публичный URL
  file_name text NOT NULL,              -- оригинальное имя файла
  mime_type text NOT NULL,              -- image/jpeg, video/mp4 и т.д.
  media_type text NOT NULL,             -- photo | video | animation | audio | document | video_note
  size_bytes bigint NOT NULL,           -- размер в байтах
  uploaded_by uuid,                     -- ID пользователя (auth.users)
  uploaded_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_library_project ON media_library(project_id);
CREATE INDEX IF NOT EXISTS idx_media_library_uploaded_at ON media_library(uploaded_at DESC);

-- ============================================================
-- 2. Связи — где конкретно используется каждый файл
-- ============================================================
CREATE TABLE IF NOT EXISTS media_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id uuid NOT NULL REFERENCES media_library(id) ON DELETE CASCADE,
  usage_type text NOT NULL,             -- 'scenario_message' | 'landing' | 'landing_block' | ...
  usage_id uuid NOT NULL,               -- ID конкретной сущности
  created_at timestamptz DEFAULT now(),
  UNIQUE(media_id, usage_type, usage_id)
);

CREATE INDEX IF NOT EXISTS idx_media_usages_media ON media_usages(media_id);
CREATE INDEX IF NOT EXISTS idx_media_usages_entity ON media_usages(usage_type, usage_id);

-- ============================================================
-- 3. Привязка к scenario_messages (опциональная, URL остаётся для backward compat)
-- ============================================================
ALTER TABLE scenario_messages ADD COLUMN IF NOT EXISTS media_id uuid REFERENCES media_library(id) ON DELETE SET NULL;

-- ============================================================
-- 4. Переименовать bucket не можем — оставляем chatbot-media
--    но файлы будут в папках {project_id}/
-- ============================================================
