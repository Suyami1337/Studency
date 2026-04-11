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
CREATE TABLE IF NOT EXISTS customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id uuid,                       -- кто оставил заметку (auth.users)
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_notes_customer ON customer_notes(customer_id, created_at DESC);

ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their customer notes" ON customer_notes;
CREATE POLICY "Users manage their customer notes" ON customer_notes
  FOR ALL USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));
