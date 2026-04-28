-- =====================================================================
-- Migration 54: Backfill social_subscribers_log из customers.channel_subscribed
-- =====================================================================
-- Кейс: до подключения канала к проекту через social_accounts (или до того,
-- как webhook начал писать в social_subscribers_log) часть customer-ов
-- подписалась на канал. У них есть customers.channel_subscribed=true и
-- channel_subscribed_at, но НЕТ записи в social_subscribers_log → они
-- невидимы в карточке клиента (блок «Подписки»).
--
-- Этот backfill для каждого такого customer-а добавляет запись 'join' в
-- social_subscribers_log по каналу проекта. Если в проекте несколько
-- telegram-каналов — добавим во все (избыточно, но не критично — лог
-- агрегируется по account_id и last action).
-- =====================================================================

INSERT INTO social_subscribers_log
  (account_id, external_user_id, username, first_name, action, customer_id, at)
SELECT
  sa.id,
  c.telegram_id,
  c.telegram_username,
  c.full_name,
  'join',
  c.id,
  COALESCE(c.channel_subscribed_at, c.created_at)
FROM customers c
JOIN social_accounts sa
  ON sa.project_id = c.project_id
  AND sa.platform = 'telegram'
  AND sa.is_active = true
WHERE c.channel_subscribed = true
  AND c.telegram_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM social_subscribers_log s
    WHERE s.customer_id = c.id AND s.account_id = sa.id
  );

-- Аналогично для customer.channel_subscribed=false с channel_left_at — добавим 'leave'
-- если ранее не было активного лога.
INSERT INTO social_subscribers_log
  (account_id, external_user_id, username, first_name, action, customer_id, at)
SELECT
  sa.id,
  c.telegram_id,
  c.telegram_username,
  c.full_name,
  'leave',
  c.id,
  COALESCE(c.channel_left_at, c.created_at)
FROM customers c
JOIN social_accounts sa
  ON sa.project_id = c.project_id
  AND sa.platform = 'telegram'
  AND sa.is_active = true
WHERE c.channel_subscribed = false
  AND c.channel_left_at IS NOT NULL
  AND c.telegram_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM social_subscribers_log s
    WHERE s.customer_id = c.id AND s.account_id = sa.id
  );
