-- Блок 3: Трекинг сценариев в сообщениях чат-бота
-- Добавляет scenario_id к chatbot_messages для аналитики "кто участвовал в каком сценарии"

ALTER TABLE chatbot_messages ADD COLUMN IF NOT EXISTS scenario_id uuid REFERENCES chatbot_scenarios(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_scenario_id ON chatbot_messages(scenario_id);
