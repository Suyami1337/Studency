-- enabled flag: чтобы галочка в UI просто включала/выключала триггер,
-- а не удаляла сообщение. Сообщение остаётся, спойлер не дёргается.
ALTER TABLE scenario_event_triggers ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_event_trigger_enabled ON scenario_event_triggers(enabled);
