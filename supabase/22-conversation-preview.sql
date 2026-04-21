-- Превью последнего сообщения в manager_conversations (для списка диалогов)
ALTER TABLE manager_conversations ADD COLUMN IF NOT EXISTS last_message_preview text;
ALTER TABLE manager_conversations ADD COLUMN IF NOT EXISTS last_message_direction text;

-- Бэкфилл по существующим диалогам (для уже импортированных)
UPDATE manager_conversations mc SET
  last_message_preview = sub.text,
  last_message_direction = sub.direction
FROM (
  SELECT DISTINCT ON (conversation_id) conversation_id, text, direction
  FROM manager_messages
  ORDER BY conversation_id, sent_at DESC
) sub
WHERE sub.conversation_id = mc.id AND (mc.last_message_preview IS NULL);
