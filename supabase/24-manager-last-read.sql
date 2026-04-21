-- Переделка unread на основе last_read_at:
-- непрочитанное = incoming сообщения с sent_at > last_read_at
-- При клике на диалог в UI ставим last_read_at = NOW(), unread_count=0.
-- При новом INSERT incoming — триггер пересчитывает unread_count для этого диалога.

ALTER TABLE manager_conversations ADD COLUMN IF NOT EXISTS last_read_at timestamptz DEFAULT now();

-- Существующие диалоги считаем «прочитанными» (last_read_at = max last_incoming_at)
-- — все текущие сообщения в Telegram юзер уже видел, считать их как unread некорректно.
UPDATE manager_conversations SET last_read_at = NOW(), unread_count = 0 WHERE last_read_at IS NULL OR unread_count > 0;

-- Перерисовываем триггер: теперь пересчитывает unread корректно на основе last_read_at
CREATE OR REPLACE FUNCTION bump_manager_unread() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.direction = 'incoming' THEN
    UPDATE manager_conversations
    SET unread_count = (
      SELECT COUNT(*) FROM manager_messages mm
      WHERE mm.conversation_id = NEW.conversation_id
        AND mm.direction = 'incoming'
        AND mm.sent_at > COALESCE(manager_conversations.last_read_at, '1970-01-01'::timestamptz)
    )
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END $$;
