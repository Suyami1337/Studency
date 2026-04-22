-- =====================================================
-- Кнопки у дожимов (message_followups)
-- =====================================================
-- Раньше scenario_buttons была привязана строго к scenario_messages.
-- Теперь кнопка может принадлежать либо сообщению, либо дожиму — ровно одному.

ALTER TABLE scenario_buttons ALTER COLUMN message_id DROP NOT NULL;
ALTER TABLE scenario_buttons ADD COLUMN IF NOT EXISTS followup_id uuid REFERENCES message_followups(id) ON DELETE CASCADE;

-- Ровно один из двух должен быть заполнен
ALTER TABLE scenario_buttons DROP CONSTRAINT IF EXISTS scenario_buttons_owner_check;
ALTER TABLE scenario_buttons ADD CONSTRAINT scenario_buttons_owner_check
  CHECK ((message_id IS NOT NULL AND followup_id IS NULL) OR (message_id IS NULL AND followup_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_scenario_buttons_followup ON scenario_buttons(followup_id) WHERE followup_id IS NOT NULL;
