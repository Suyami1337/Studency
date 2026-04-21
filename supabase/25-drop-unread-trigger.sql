-- Убираем bump_manager_unread: unread_count теперь управляется целиком
-- из Telegram (поле dialog.unreadCount в GetDialogs). Триггер больше не нужен.
DROP TRIGGER IF EXISTS manager_messages_bump_unread ON manager_messages;
DROP FUNCTION IF EXISTS bump_manager_unread();

-- last_read_at больше не используется — оставляем колонку для совместимости
-- (не трогаем данные).
