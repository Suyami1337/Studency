-- Блок 3: Дожимы как подсистема сообщений (не отдельный тип)
-- Каждый дожим привязан к конкретному scenario_message

CREATE TABLE IF NOT EXISTS message_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_message_id uuid NOT NULL REFERENCES scenario_messages(id) ON DELETE CASCADE,
  order_index int NOT NULL DEFAULT 0,
  delay_value int NOT NULL DEFAULT 1,          -- числовое значение задержки
  delay_unit text NOT NULL DEFAULT 'hour',     -- 'sec' | 'min' | 'hour' | 'day'
  text text NOT NULL DEFAULT '',
  channel text NOT NULL DEFAULT 'telegram',    -- 'telegram' | 'email' | 'both'
  cancel_on_reply boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_followups_message_id ON message_followups(scenario_message_id);
