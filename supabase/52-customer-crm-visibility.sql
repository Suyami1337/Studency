-- =====================================================================
-- Migration 52: customers.crm_visible — lazy materialization customer-карточек
-- =====================================================================
-- Принцип «Переписки ≠ CRM»:
-- - Карточка создаётся в БД при ЛЮБОМ соприкосновении (подписка на канал с
--   UTM, начатый Direct/DM-диалог, и т.д.) — чтобы исторические данные
--   не терялись.
-- - Но в /users по умолчанию показываются ТОЛЬКО те, кто вошёл в воронку:
--   crm_visible = true. Невидимые карточки живут в БД, но не захламляют CRM.
-- - Когда невидимый customer совершает actionable действие (/start бота,
--   клик по UTM на лендинг, форма, оплата) — флаг переключается на true.
--
-- См.: knowledge/decisions/customer-creation-policy-2026-04-28
-- =====================================================================

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS crm_visible BOOLEAN NOT NULL DEFAULT TRUE;

-- Все существующие customer-ы остаются видимыми (default=true). Не трогаем.

CREATE INDEX IF NOT EXISTS idx_customers_visible
  ON customers(project_id, crm_visible)
  WHERE crm_visible = TRUE;

-- Обновим view customers_with_role чтобы она пробрасывала crm_visible
DROP VIEW IF EXISTS customers_with_role;
CREATE VIEW customers_with_role AS
SELECT
  c.*,
  pm.id          AS membership_id,
  pm.role_id     AS membership_role_id,
  pm.status      AS membership_status,
  r.code         AS role_code,
  r.label        AS role_label,
  r.access_type  AS role_access_type
FROM customers c
LEFT JOIN project_members pm
  ON pm.user_id = c.user_id
  AND pm.project_id = c.project_id
  AND pm.status = 'active'
LEFT JOIN roles r ON r.id = pm.role_id;
