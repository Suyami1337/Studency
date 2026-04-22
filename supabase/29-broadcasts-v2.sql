-- ============================================================================
-- 29: Рассылки v2 — синхронизация схемы с кодом + трекинг блоков сценария
-- ============================================================================
-- Проблема: БД содержит старую схему broadcasts (content/delivered/failed/filter_tags),
-- а код ожидает новую (text/segment_type/segment_value/media_*/sent_count/failed_count).
-- При создании рассылки insert падал с ошибкой "column does not exist" → ничего не сохранялось.
--
-- Фикс: добавляем недостающие колонки, синхронизируем данные, снимаем NOT NULL
-- с устаревших полей чтобы код мог игнорировать их.
--
-- Плюс: добавляем scenario_message_id в chatbot_messages — чтобы можно было
-- сегментировать рассылку по «был/не был в конкретном блоке сценария».
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. broadcasts: привести схему к виду которого ожидает код
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS text text;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS media_id uuid REFERENCES media_library(id) ON DELETE SET NULL;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS media_type text;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS segment_type text NOT NULL DEFAULT 'all';
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS segment_value text;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS sent_count int DEFAULT 0;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS failed_count int DEFAULT 0;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS email_subject text;

-- Переносим данные из старых колонок если они есть
UPDATE broadcasts SET text = content WHERE text IS NULL AND content IS NOT NULL;
UPDATE broadcasts SET sent_count = delivered WHERE sent_count = 0 AND delivered IS NOT NULL;
UPDATE broadcasts SET failed_count = failed WHERE failed_count = 0 AND failed IS NOT NULL;

-- Снимаем NOT NULL с legacy-колонок чтобы insert не требовал их
ALTER TABLE broadcasts ALTER COLUMN content DROP NOT NULL;
ALTER TABLE broadcasts ALTER COLUMN telegram_bot_id DROP NOT NULL;

-- Индекс для cron-сканирования запланированных рассылок
CREATE INDEX IF NOT EXISTS idx_broadcasts_scheduled
  ON broadcasts(scheduled_at) WHERE status = 'scheduled';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. chatbot_messages: трекинг какой блок сценария был отправлен клиенту
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE chatbot_messages
  ADD COLUMN IF NOT EXISTS scenario_message_id uuid
  REFERENCES scenario_messages(id) ON DELETE SET NULL;

-- Индексы для быстрого поиска «клиенты у которых был блок X»
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_scenario_message
  ON chatbot_messages(scenario_message_id)
  WHERE scenario_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chatbot_messages_conv_scenario_msg
  ON chatbot_messages(conversation_id, scenario_message_id)
  WHERE scenario_message_id IS NOT NULL;
