-- Mini App flag для лендингов.
-- Когда is_mini_app=true — страница /s/[slug] дополнительно грузит
-- telegram-web-app.js и при открытии внутри Telegram читает initData
-- (telegram_id клиента). Это закрывает identity stitching для сайтов.
ALTER TABLE landings ADD COLUMN IF NOT EXISTS is_mini_app boolean NOT NULL DEFAULT false;
