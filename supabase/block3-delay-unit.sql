-- Блок 3: Добавляем delay_unit в scenario_messages
-- Позволяет хранить задержку в секундах/минутах/часах/днях

ALTER TABLE scenario_messages ADD COLUMN IF NOT EXISTS delay_unit text NOT NULL DEFAULT 'min';
