-- =====================================================
-- Telegram invite links для источников трафика (как у Vortex)
-- =====================================================
-- Источник трафика типа "ведёт в канал" получает автоматически созданную
-- именную invite-ссылку через Telegram Bot API. При подписке по ней
-- webhook chat_member приносит invite_link.name — по нему находим source.

ALTER TABLE traffic_sources ADD COLUMN IF NOT EXISTS telegram_bot_id uuid REFERENCES telegram_bots(id) ON DELETE SET NULL;
ALTER TABLE traffic_sources ADD COLUMN IF NOT EXISTS telegram_channel_id bigint;
ALTER TABLE traffic_sources ADD COLUMN IF NOT EXISTS telegram_channel_title text;
ALTER TABLE traffic_sources ADD COLUMN IF NOT EXISTS telegram_invite_link text;
ALTER TABLE traffic_sources ADD COLUMN IF NOT EXISTS telegram_invite_name text;
ALTER TABLE traffic_sources ADD COLUMN IF NOT EXISTS telegram_invite_member_count int NOT NULL DEFAULT 0;

-- Уникальное имя ссылки на проект — чтобы при webhook быстро найти source
CREATE UNIQUE INDEX IF NOT EXISTS uniq_traffic_invite_name ON traffic_sources(project_id, telegram_invite_name) WHERE telegram_invite_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_traffic_invite_name_lookup ON traffic_sources(telegram_invite_name) WHERE telegram_invite_name IS NOT NULL;
