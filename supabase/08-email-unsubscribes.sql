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
