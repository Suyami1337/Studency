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
