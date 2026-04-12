-- =====================================================
-- Trigger groups v3: триггер = событие + immediate сообщение + N дожимов
-- =====================================================
-- Логика:
--   1 "триггер" в UI = group_id
--   Строки scenario_event_triggers с одинаковым group_id — связаны.
--   Все сообщения этой группы хранятся в scenario_messages с parent_trigger_group_id=group_id
--   и НЕ показываются в основной вкладке Сценарий.
--
--   Immediate (сразу при событии): is_negative=false, wait_minutes=0
--   Дожим (если НЕ случилось): is_negative=true, wait_minutes=X, cancel_on_event_type=...

ALTER TABLE scenario_event_triggers ADD COLUMN IF NOT EXISTS group_id uuid;
ALTER TABLE scenario_event_triggers ADD COLUMN IF NOT EXISTS sort_in_group int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_event_trigger_group ON scenario_event_triggers(group_id);

ALTER TABLE scenario_messages ADD COLUMN IF NOT EXISTS parent_trigger_group_id uuid;
CREATE INDEX IF NOT EXISTS idx_scenario_msg_trigger_group ON scenario_messages(parent_trigger_group_id) WHERE parent_trigger_group_id IS NOT NULL;
