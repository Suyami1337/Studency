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
