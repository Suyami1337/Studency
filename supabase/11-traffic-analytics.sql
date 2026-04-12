-- ============================================================================
-- 11. Сквозная аналитика трафика + трекинг подписок Telegram
-- ============================================================================

-- 1. Статус подписки бота в карточке клиента
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bot_subscribed boolean DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bot_blocked boolean DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bot_subscribed_at timestamptz;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bot_blocked_at timestamptz;

-- 2. Статус подписки на канал
ALTER TABLE customers ADD COLUMN IF NOT EXISTS channel_subscribed boolean DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS channel_subscribed_at timestamptz;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS channel_left_at timestamptz;

-- 3. Привязка канала к боту
ALTER TABLE telegram_bots ADD COLUMN IF NOT EXISTS channel_id text;
ALTER TABLE telegram_bots ADD COLUMN IF NOT EXISTS channel_username text;
