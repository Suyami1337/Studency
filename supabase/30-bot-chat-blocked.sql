-- ============================================================================
-- 30: chat_blocked флаг для conversations — трекинг заблокировавших бота
-- ============================================================================
-- Проблема: рассылка на «всех клиентов проекта» слала 25 сообщений, хотя
-- боту /start нажали только 3. Telegram не даёт боту инициировать диалог —
-- возвращает 403 / chat not found. В итоге показывало «получателей 25, ошибок 21».
--
-- Фикс: рассылки теперь берут получателей из chatbot_conversations этого бота
-- (=реальные подписчики). Плюс при ошибке 403 от Telegram ставим chat_blocked=true
-- и больше не шлём этому клиенту.
-- ============================================================================

ALTER TABLE chatbot_conversations
  ADD COLUMN IF NOT EXISTS chat_blocked boolean DEFAULT false;

-- Индекс для быстрой выборки активных подписчиков конкретного бота при рассылке
CREATE INDEX IF NOT EXISTS idx_chatbot_conversations_active_subscribers
  ON chatbot_conversations(telegram_bot_id, customer_id)
  WHERE chat_blocked = false AND customer_id IS NOT NULL;
