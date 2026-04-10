-- Фикс таблицы message_followups
-- Безопасно запускать в любом состоянии БД:
-- - если таблицы нет — создаст с нуля
-- - если таблица с old schema (delay_minutes) — добавит новые колонки

-- 1. Создаём если не существует (с полной новой схемой)
CREATE TABLE IF NOT EXISTS message_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_message_id uuid NOT NULL REFERENCES scenario_messages(id) ON DELETE CASCADE,
  order_index int NOT NULL DEFAULT 0,
  delay_value int NOT NULL DEFAULT 1,
  delay_unit text NOT NULL DEFAULT 'hour',
  text text NOT NULL DEFAULT '',
  channel text NOT NULL DEFAULT 'telegram',
  cancel_on_reply boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 2. Если таблица уже была со старой схемой — добавляем недостающие колонки
ALTER TABLE message_followups ADD COLUMN IF NOT EXISTS delay_value int NOT NULL DEFAULT 1;
ALTER TABLE message_followups ADD COLUMN IF NOT EXISTS delay_unit text NOT NULL DEFAULT 'hour';
ALTER TABLE message_followups ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 3. Индекс
CREATE INDEX IF NOT EXISTS idx_message_followups_message_id ON message_followups(scenario_message_id);

-- 4. Колонка delay_unit в scenario_messages (для задержки между сообщениями)
ALTER TABLE scenario_messages ADD COLUMN IF NOT EXISTS delay_unit text NOT NULL DEFAULT 'min';
