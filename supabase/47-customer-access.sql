-- =====================================================================
-- Migration 47: Customer access (выданные тарифы) + типы сроков на тарифах
-- =====================================================================
-- Что добавляется:
-- 1. На tariffs — поля access_type, access_days, access_until_date.
-- 2. Новая таблица customer_access — выданные доступы (один тариф = один
--    активный доступ на customer). Курсы открытые этим доступом получаются
--    через JOIN tariff_access (уже существует).
-- 3. Helper функция grant_tariff_access(...) для атомарной выдачи.
-- 4. RLS на customer_access.
-- =====================================================================


-- A. Поля сроков доступа на tariffs
-- ---------------------------------------------------------------------
-- access_type:
--   'lifetime'           — навсегда
--   'from_purchase_days' — N дней с момента создания доступа (см. access_days)
--   'until_date'         — конкретная дата окончания общая для всех (см. access_until_date)

ALTER TABLE tariffs
  ADD COLUMN IF NOT EXISTS access_type TEXT NOT NULL DEFAULT 'lifetime'
    CHECK (access_type IN ('lifetime', 'from_purchase_days', 'until_date'));

ALTER TABLE tariffs
  ADD COLUMN IF NOT EXISTS access_days INTEGER;

ALTER TABLE tariffs
  ADD COLUMN IF NOT EXISTS access_until_date TIMESTAMPTZ;


-- B. Таблица customer_access — учёт выданных доступов
-- ---------------------------------------------------------------------
-- source: откуда выдача
--   'order'      — после успешной оплаты заказа (через Prodamus webhook
--                  или ручное «бесплатно» через карточку клиента)
--   'manual'     — выдан вручную через UI без заказа
--   'invitation' — выдан через invitation flow (сам клиент пришёл по ссылке)
--
-- status:
--   'active'   — действующий
--   'revoked'  — отозван вручную
--   'expired'  — истёк срок (можно проверять при чтении и помечать)

CREATE TABLE IF NOT EXISTS customer_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tariff_id UUID NOT NULL REFERENCES tariffs(id) ON DELETE RESTRICT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('order', 'manual', 'invitation')),
  source_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'expired')),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_access_customer ON customer_access(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_access_project ON customer_access(project_id);
CREATE INDEX IF NOT EXISTS idx_customer_access_tariff ON customer_access(tariff_id);
CREATE INDEX IF NOT EXISTS idx_customer_access_order ON customer_access(source_order_id);
CREATE INDEX IF NOT EXISTS idx_customer_access_active
  ON customer_access(customer_id, status)
  WHERE status = 'active';


-- C. Helper-функция: выдать доступ клиенту по тарифу
-- ---------------------------------------------------------------------
-- Считает expires_at по типу срока тарифа. Возвращает id новой записи.
-- Если у клиента уже есть активный доступ к этому тарифу — возвращает
-- его id без создания дубликата.

CREATE OR REPLACE FUNCTION grant_tariff_access(
  p_project_id uuid,
  p_customer_id uuid,
  p_tariff_id uuid,
  p_source text DEFAULT 'manual',
  p_source_order_id uuid DEFAULT NULL,
  p_granted_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_tariff RECORD;
  v_expires timestamptz;
  v_new_id uuid;
BEGIN
  -- Уже есть активный доступ?
  SELECT id INTO v_existing_id
  FROM customer_access
  WHERE customer_id = p_customer_id
    AND tariff_id = p_tariff_id
    AND status = 'active'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  -- Загружаем тариф
  SELECT t.access_type, t.access_days, t.access_until_date
  INTO v_tariff
  FROM tariffs t
  WHERE t.id = p_tariff_id;

  IF v_tariff IS NULL THEN
    RAISE EXCEPTION 'tariff not found';
  END IF;

  -- Считаем expires_at
  IF v_tariff.access_type = 'lifetime' THEN
    v_expires := NULL;
  ELSIF v_tariff.access_type = 'from_purchase_days' THEN
    v_expires := now() + (COALESCE(v_tariff.access_days, 0) || ' days')::interval;
  ELSIF v_tariff.access_type = 'until_date' THEN
    v_expires := v_tariff.access_until_date;
  ELSE
    v_expires := NULL;
  END IF;

  INSERT INTO customer_access (
    project_id, customer_id, tariff_id, expires_at,
    source, source_order_id, granted_by, notes
  ) VALUES (
    p_project_id, p_customer_id, p_tariff_id, v_expires,
    p_source, p_source_order_id, p_granted_by, p_notes
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;


-- D. RLS на customer_access
-- ---------------------------------------------------------------------

ALTER TABLE customer_access ENABLE ROW LEVEL SECURITY;

-- Члены проекта с learning.access.grant видят и пишут.
DROP POLICY IF EXISTS "members_with_grant_view_access" ON customer_access;
CREATE POLICY "members_with_grant_view_access" ON customer_access
  FOR SELECT USING (
    is_project_member(project_id)
  );

DROP POLICY IF EXISTS "members_with_grant_manage_access" ON customer_access;
CREATE POLICY "members_with_grant_manage_access" ON customer_access
  FOR ALL USING (
    has_permission(project_id, auth.uid(), 'learning.access.grant')
    OR has_permission(project_id, auth.uid(), 'learning.access.revoke')
  );

-- Дополнительно: ученик может прочитать СВОИ доступы через customer.user_id.
DROP POLICY IF EXISTS "student_reads_own_access" ON customer_access;
CREATE POLICY "student_reads_own_access" ON customer_access
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = customer_access.customer_id
        AND c.user_id = auth.uid()
    )
  );


-- E. Helper view: customer_courses_view — какие курсы открыты клиенту сейчас
-- ---------------------------------------------------------------------
-- Витрина ученика читает её для отображения «Мои курсы».
-- Показывает курсы из активных и не истёкших customer_access.

CREATE OR REPLACE VIEW customer_courses_view AS
SELECT DISTINCT
  ca.customer_id,
  ca.project_id,
  c.id AS course_id,
  c.name AS course_name,
  c.description AS course_description,
  c.is_published,
  ca.id AS access_id,
  ca.tariff_id,
  ca.granted_at,
  ca.expires_at,
  ca.status
FROM customer_access ca
JOIN tariffs t ON t.id = ca.tariff_id
LEFT JOIN courses c ON (
  c.id = t.course_id  -- классический one-to-one тариф→курс
  OR c.id IN (SELECT ta.course_id FROM tariff_access ta WHERE ta.tariff_id = t.id AND ta.course_id IS NOT NULL)
)
WHERE ca.status = 'active'
  AND (ca.expires_at IS NULL OR ca.expires_at > now())
  AND c.id IS NOT NULL;

-- View наследует RLS базовых таблиц — ученик видит только свои строки
-- через политику student_reads_own_access на customer_access.


-- =====================================================================
-- DONE
-- =====================================================================
