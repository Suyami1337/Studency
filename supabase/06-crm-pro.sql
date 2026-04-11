-- ============================================================================
-- CRM Pro: гибкие столбцы + timeline
-- ============================================================================

-- 1. Кастомные поля клиента (динамические атрибуты)
CREATE TABLE IF NOT EXISTS customer_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  field_key text NOT NULL,              -- машинное имя (notes, company, vip_status и т.д.)
  field_label text NOT NULL,            -- отображаемое имя
  field_type text NOT NULL DEFAULT 'text', -- text | number | boolean | select | date
  field_options jsonb,                  -- варианты для select
  order_index int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(project_id, field_key)
);

-- 2. Значения кастомных полей для каждого клиента
CREATE TABLE IF NOT EXISTS customer_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES customer_custom_fields(id) ON DELETE CASCADE,
  value_text text,
  value_number numeric,
  value_boolean boolean,
  value_date timestamptz,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(customer_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_field_values_customer ON customer_field_values(customer_id);
CREATE INDEX IF NOT EXISTS idx_field_values_field ON customer_field_values(field_id);

-- 3. RLS
ALTER TABLE customer_custom_fields ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their custom fields" ON customer_custom_fields;
CREATE POLICY "Users manage their custom fields" ON customer_custom_fields
  FOR ALL USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

ALTER TABLE customer_field_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their field values" ON customer_field_values;
CREATE POLICY "Users manage their field values" ON customer_field_values
  FOR ALL USING (
    customer_id IN (SELECT id FROM customers WHERE project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()))
  );

-- 4. Заметки клиента (timeline)
-- Старая таблица (если существовала) могла иметь колонку `text` вместо `content`
-- и без project_id — обновляем схему idempotently.
CREATE TABLE IF NOT EXISTS customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Добавляем недостающие колонки для существующих таблиц
ALTER TABLE customer_notes ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE customer_notes ADD COLUMN IF NOT EXISTS author_id uuid;
ALTER TABLE customer_notes ADD COLUMN IF NOT EXISTS content text;

-- Если существует старая колонка `text` — переносим данные в content
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='customer_notes' AND column_name='text'
  ) THEN
    UPDATE customer_notes SET content = text WHERE content IS NULL AND text IS NOT NULL;
  END IF;
END $$;

-- Backfill project_id из customers для старых записей
UPDATE customer_notes cn
SET project_id = c.project_id
FROM customers c
WHERE cn.customer_id = c.id AND cn.project_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_customer_notes_customer ON customer_notes(customer_id, created_at DESC);

ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their customer notes" ON customer_notes;
CREATE POLICY "Users manage their customer notes" ON customer_notes
  FOR ALL USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));
