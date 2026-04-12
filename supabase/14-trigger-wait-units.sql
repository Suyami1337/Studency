-- Wait units for trigger followups: сек/мин/час/день (как в сценарных сообщениях)
ALTER TABLE scenario_event_triggers ADD COLUMN IF NOT EXISTS wait_value int NOT NULL DEFAULT 0;
ALTER TABLE scenario_event_triggers ADD COLUMN IF NOT EXISTS wait_unit text NOT NULL DEFAULT 'min';
-- Backfill from existing wait_minutes
UPDATE scenario_event_triggers
SET wait_value = wait_minutes, wait_unit = 'min'
WHERE wait_minutes > 0 AND wait_value = 0;
