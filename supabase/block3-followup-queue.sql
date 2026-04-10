-- Очередь для отправки дожимов
-- Создаётся запись когда сообщение отправлено и у него есть активные followups

CREATE TABLE IF NOT EXISTS followup_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  followup_id uuid NOT NULL REFERENCES message_followups(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES chatbot_conversations(id) ON DELETE CASCADE,
  chat_id bigint NOT NULL,
  bot_token text NOT NULL,
  send_at timestamptz NOT NULL,
  sent_at timestamptz,
  cancelled_at timestamptz,
  status text NOT NULL DEFAULT 'pending', -- 'pending' | 'sent' | 'cancelled'
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followup_queue_status_send_at ON followup_queue(status, send_at);
CREATE INDEX IF NOT EXISTS idx_followup_queue_conversation ON followup_queue(conversation_id, status);
