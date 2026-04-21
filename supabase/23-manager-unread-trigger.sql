-- Надёжный счётчик непрочитанных: триггер на insert в manager_messages
-- плюс бэкфилл по существующим диалогам.

-- Функция-триггер: на каждое incoming-сообщение инкрементит unread_count
CREATE OR REPLACE FUNCTION bump_manager_unread() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.direction = 'incoming' THEN
    UPDATE manager_conversations
    SET unread_count = COALESCE(unread_count, 0) + 1
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS manager_messages_bump_unread ON manager_messages;
CREATE TRIGGER manager_messages_bump_unread
  AFTER INSERT ON manager_messages
  FOR EACH ROW EXECUTE FUNCTION bump_manager_unread();

-- Бэкфилл: у существующих диалогов считаем реальное количество непрочитанных
-- как все incoming-сообщения после последнего исходящего от менеджера.
-- Если менеджер никогда не писал — все incoming считаются непрочитанными.
UPDATE manager_conversations mc SET unread_count = sub.cnt
FROM (
  SELECT
    mm.conversation_id,
    COUNT(*) AS cnt
  FROM manager_messages mm
  JOIN manager_conversations mc2 ON mc2.id = mm.conversation_id
  WHERE mm.direction = 'incoming'
    AND (mc2.last_outgoing_at IS NULL OR mm.sent_at > mc2.last_outgoing_at)
  GROUP BY mm.conversation_id
) sub
WHERE sub.conversation_id = mc.id;
