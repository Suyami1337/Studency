-- ============================================================================
-- 32: Восстановить потерянные conversations для исторических /start
-- ============================================================================
-- Проблема: у некоторых клиентов есть customer_actions.action='bot_start'
-- (делали /start боту в прошлом), есть telegram_id в customers, но НЕТ
-- записи в chatbot_conversations — видимо бот переподключался или был
-- ручной DELETE.
--
-- Старые рассылки слали напрямую по customers.telegram_id и им доходило.
-- Новая логика (после 30) фильтрует по chatbot_conversations — такие
-- клиенты выпадают из подсчёта и рассылки.
--
-- Фикс: для каждого клиента с bot_start и без conversation — создаём
-- conversation. Если клиент тем временем заблокировал бота, при первой
-- же рассылке Telegram вернёт 403, и мы корректно пометим chat_blocked.
-- ============================================================================

INSERT INTO chatbot_conversations (
  telegram_bot_id,
  telegram_chat_id,
  telegram_user_id,
  telegram_username,
  telegram_first_name,
  customer_id,
  chat_blocked
)
SELECT DISTINCT
  tb.id,
  CAST(c.telegram_id AS bigint),
  CAST(c.telegram_id AS bigint),
  c.telegram_username,
  c.full_name,
  c.id,
  false
FROM customers c
JOIN telegram_bots tb ON tb.project_id = c.project_id AND tb.is_active = true
WHERE c.telegram_id IS NOT NULL
  AND c.telegram_id ~ '^[0-9]+$'
  AND CAST(c.telegram_id AS bigint) > 0
  AND EXISTS (
    SELECT 1 FROM customer_actions ca
    WHERE ca.customer_id = c.id AND ca.action = 'bot_start'
  )
  AND NOT EXISTS (
    SELECT 1 FROM chatbot_conversations cc
    WHERE cc.customer_id = c.id AND cc.telegram_bot_id = tb.id
  )
ON CONFLICT (telegram_bot_id, telegram_chat_id) DO UPDATE SET
  customer_id = EXCLUDED.customer_id,
  chat_blocked = false;
