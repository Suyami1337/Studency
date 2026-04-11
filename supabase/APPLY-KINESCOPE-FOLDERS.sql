-- ============================================================================
-- Kinescope master account: папки per-project + настройки плеера
-- ============================================================================

-- Папка в Kinescope для изоляции видео проекта от видео других проектов
ALTER TABLE projects ADD COLUMN IF NOT EXISTS kinescope_folder_id text;

-- Настройки плеера (общие для всех видео проекта):
-- { accent_color, logo_url, logo_media_id, watermark, autoplay, muted, show_title }
ALTER TABLE projects ADD COLUMN IF NOT EXISTS player_settings jsonb DEFAULT '{}'::jsonb;
