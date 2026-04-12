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

-- 4. Новые action_type enum значения для timeline
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'bot_subscribed';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'bot_blocked';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'bot_unsubscribed';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'channel_subscribed';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'channel_unsubscribed';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'crm_auto_move';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'crm_manual_move';
