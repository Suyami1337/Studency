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
