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
