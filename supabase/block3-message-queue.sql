-- Очередь для отправки цепочных сообщений с задержкой
CREATE TABLE IF NOT EXISTS scenario_message_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  next_message_id uuid NOT NULL REFERENCES scenario_messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES chatbot_conversations(id) ON DELETE CASCADE,
  chat_id bigint NOT NULL,
  bot_token text NOT NULL,
  user_id bigint,
  scenario_id uuid,
  send_at timestamptz NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scenario_message_queue_status_send_at ON scenario_message_queue(status, send_at);
