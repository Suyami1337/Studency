-- ============================================================================
-- Медиа в дожимах: колонки в message_followups
-- Запускать ПОСЛЕ APPLY-MEDIA-LIBRARY.sql
-- ============================================================================

ALTER TABLE message_followups ADD COLUMN IF NOT EXISTS media_type text;
ALTER TABLE message_followups ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE message_followups ADD COLUMN IF NOT EXISTS media_file_name text;
ALTER TABLE message_followups ADD COLUMN IF NOT EXISTS media_id uuid REFERENCES media_library(id) ON DELETE SET NULL;
