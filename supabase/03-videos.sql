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
