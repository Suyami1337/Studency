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
