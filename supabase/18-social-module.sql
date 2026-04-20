-- =====================================================
-- Модуль "Соцсети" — фундамент
-- =====================================================
-- Пока — только Telegram. Схема универсальная: platform-поле позволяет
-- добавить Instagram/YouTube/TikTok без миграций.

-- 1. Подключённые соцаккаунты проекта
CREATE TABLE IF NOT EXISTS social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform text NOT NULL,                    -- 'telegram' | 'instagram' | 'youtube' | 'tiktok'
  external_id text NOT NULL,                 -- channel_id / ig_user_id / yt_channel_id (строка для универсальности)
  external_username text,                    -- @channelname / @igusername / handle
  external_title text,                       -- отображаемое имя
  external_avatar_url text,
  telegram_bot_id uuid REFERENCES telegram_bots(id) ON DELETE SET NULL, -- для Telegram: какой бот админит канал
  credentials_encrypted text,                -- для будущих OAuth-токенов (MTProto session, IG access_token и т.д.)
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  connected_at timestamptz DEFAULT now(),
  last_sync_at timestamptz,
  sync_error text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_social_project_platform_external
  ON social_accounts(project_id, platform, external_id);
CREATE INDEX IF NOT EXISTS idx_social_platform ON social_accounts(platform) WHERE is_active = true;

-- 2. Единицы контента (посты / Reels / ролики)
CREATE TABLE IF NOT EXISTS social_content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  external_id text NOT NULL,                 -- message_id для Telegram, ig_media_id для Instagram, video_id для YT
  type text NOT NULL,                        -- 'tg_post' | 'ig_post' | 'ig_reel' | 'yt_video' и т.д.
  title text,                                -- первая строка поста / название ролика
  body text,                                 -- текст поста (для Telegram можем хранить)
  url text,                                  -- публичный URL единицы контента
  thumbnail_url text,
  published_at timestamptz,
  -- Метрики: views, reactions, comments, saves, clicks и т.д. Живут в JSON чтобы не плодить колонки
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_metrics_update_at timestamptz,
  -- Привязка к источнику трафика — если для этой единицы создана наша trackable-ссылка
  traffic_source_id uuid REFERENCES traffic_sources(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_social_item_external
  ON social_content_items(account_id, external_id);
CREATE INDEX IF NOT EXISTS idx_social_item_published ON social_content_items(account_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_item_source ON social_content_items(traffic_source_id) WHERE traffic_source_id IS NOT NULL;

-- 3. История подписок/отписок
CREATE TABLE IF NOT EXISTS social_subscribers_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  external_user_id text NOT NULL,            -- telegram_id / ig_user_id / yt_channel_id
  username text,
  first_name text,
  action text NOT NULL,                      -- 'join' | 'leave'
  invite_link_name text,                     -- для Telegram: какой invite-link использован (связка с traffic_source)
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subs_log_account_at ON social_subscribers_log(account_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_subs_log_user ON social_subscribers_log(account_id, external_user_id);
CREATE INDEX IF NOT EXISTS idx_subs_log_customer ON social_subscribers_log(customer_id) WHERE customer_id IS NOT NULL;

-- 4. Снапшоты счётчика подписчиков (для графика прироста за период)
CREATE TABLE IF NOT EXISTS social_subscribers_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  subscribers_count int NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subs_snap_account_at ON social_subscribers_snapshots(account_id, at DESC);

-- RLS
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_subscribers_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_subscribers_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see their project social_accounts" ON social_accounts;
CREATE POLICY "Users see their project social_accounts" ON social_accounts
  FOR ALL USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Users see their project social_content" ON social_content_items;
CREATE POLICY "Users see their project social_content" ON social_content_items
  FOR ALL USING (account_id IN (SELECT id FROM social_accounts WHERE project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())));

DROP POLICY IF EXISTS "Users see their project social_subs_log" ON social_subscribers_log;
CREATE POLICY "Users see their project social_subs_log" ON social_subscribers_log
  FOR ALL USING (account_id IN (SELECT id FROM social_accounts WHERE project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())));

DROP POLICY IF EXISTS "Users see their project social_subs_snap" ON social_subscribers_snapshots;
CREATE POLICY "Users see their project social_subs_snap" ON social_subscribers_snapshots
  FOR ALL USING (account_id IN (SELECT id FROM social_accounts WHERE project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())));
