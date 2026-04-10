-- Media attachments для сообщений чат-бота
-- Добавляем колонки и создаём публичный storage bucket

-- 1. Колонки в scenario_messages
ALTER TABLE scenario_messages ADD COLUMN IF NOT EXISTS media_type text;
-- Возможные значения: 'photo' | 'video' | 'animation' | 'video_note' | 'document' | 'audio'
ALTER TABLE scenario_messages ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE scenario_messages ADD COLUMN IF NOT EXISTS media_file_name text;

-- 2. Storage bucket для медиа
INSERT INTO storage.buckets (id, name, public)
VALUES ('chatbot-media', 'chatbot-media', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Политики доступа: публичное чтение, загрузка через service role (webhook)
DROP POLICY IF EXISTS "Public read chatbot-media" ON storage.objects;
CREATE POLICY "Public read chatbot-media" ON storage.objects
  FOR SELECT USING (bucket_id = 'chatbot-media');

DROP POLICY IF EXISTS "Authenticated upload chatbot-media" ON storage.objects;
CREATE POLICY "Authenticated upload chatbot-media" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'chatbot-media' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated delete chatbot-media" ON storage.objects;
CREATE POLICY "Authenticated delete chatbot-media" ON storage.objects
  FOR DELETE USING (bucket_id = 'chatbot-media' AND auth.role() = 'authenticated');
