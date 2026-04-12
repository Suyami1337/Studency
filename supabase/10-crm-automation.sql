-- ============================================================================
-- 10. CRM автоматизация — per-column правила, логирование перемещений
-- ============================================================================

-- 1. Тип автоматизации на столбце (manual/auto)
ALTER TABLE crm_board_stages ADD COLUMN IF NOT EXISTS automation_mode text NOT NULL DEFAULT 'manual';
-- 'manual' — менеджер перетаскивает руками
-- 'auto' — правила автоматически двигают клиентов

-- 2. Флаг "требовать из предыдущего столбца"
ALTER TABLE crm_board_stages ADD COLUMN IF NOT EXISTS require_from_previous boolean NOT NULL DEFAULT false;

-- 3. Правила входа для auto-столбцов
-- Между правилами одного столбца — OR (достаточно любого)
-- Внутри одного правила — AND (все фильтры должны совпасть)
CREATE TABLE IF NOT EXISTS crm_stage_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES crm_board_stages(id) ON DELETE CASCADE,
  -- Тип события
  event_type text NOT NULL,           -- 'bot_start' | 'landing_visit' | 'video_complete' | 'order_paid' | 'form_submit' | etc.
  -- Фильтры (AND внутри правила) — JSON объект с произвольными условиями
  -- Примеры:
  --   {"landing_slug": "vsl"} — конкретный лендинг
  --   {"video_id": "uuid"} — конкретное видео
  --   {"product_id": "uuid", "status": "paid"} — конкретный продукт оплачен
  --   {"button_text": "Купить"} — конкретная кнопка в боте
  filters jsonb NOT NULL DEFAULT '{}',
  -- Описание для UI (чтобы менеджер видел что настроено)
  description text,
  order_index int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_stage_rules_stage ON crm_stage_rules(stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_stage_rules_event ON crm_stage_rules(event_type);

-- 4. Трекер "уже срабатывало" — чтобы правило не двигало клиента повторно
-- Если запись есть — правило уже один раз отработало для этого клиента на этом столбце
CREATE TABLE IF NOT EXISTS crm_stage_rule_fired (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES crm_board_stages(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES crm_stage_rules(id) ON DELETE CASCADE,
  fired_at timestamptz DEFAULT now(),
  UNIQUE(customer_id, stage_id, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_rule_fired_customer ON crm_stage_rule_fired(customer_id);

-- 5. Лог перемещений по CRM — кто, откуда, куда, когда, почему
CREATE TABLE IF NOT EXISTS crm_movement_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  board_id uuid NOT NULL REFERENCES crm_boards(id) ON DELETE CASCADE,
  from_stage_id uuid REFERENCES crm_board_stages(id) ON DELETE SET NULL,
  to_stage_id uuid NOT NULL REFERENCES crm_board_stages(id) ON DELETE CASCADE,
  moved_by text NOT NULL DEFAULT 'automation',  -- 'automation' | 'manual'
  moved_by_user_id uuid,                         -- ID менеджера (если manual)
  rule_id uuid REFERENCES crm_stage_rules(id) ON DELETE SET NULL,  -- какое правило сработало
  note text,                                     -- комментарий
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_movement_log_customer ON crm_movement_log(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_movement_log_board ON crm_movement_log(board_id);

-- 6. RLS
ALTER TABLE crm_stage_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their stage rules" ON crm_stage_rules;
CREATE POLICY "Users manage their stage rules" ON crm_stage_rules
  FOR ALL USING (
    stage_id IN (
      SELECT s.id FROM crm_board_stages s
      JOIN crm_boards b ON s.board_id = b.id
      JOIN projects p ON b.project_id = p.id
      WHERE p.owner_id = auth.uid()
    )
  );

ALTER TABLE crm_stage_rule_fired ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see their fired rules" ON crm_stage_rule_fired;
CREATE POLICY "Users see their fired rules" ON crm_stage_rule_fired
  FOR SELECT USING (
    customer_id IN (
      SELECT id FROM customers WHERE project_id IN (
        SELECT id FROM projects WHERE owner_id = auth.uid()
      )
    )
  );

ALTER TABLE crm_movement_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see their movement logs" ON crm_movement_log;
CREATE POLICY "Users see their movement logs" ON crm_movement_log
  FOR SELECT USING (
    board_id IN (
      SELECT id FROM crm_boards WHERE project_id IN (
        SELECT id FROM projects WHERE owner_id = auth.uid()
      )
    )
  );
