-- =====================================================================
-- Migration 49: Переименовать роль «Клиент» → «Ученик» + view customers_with_role
-- =====================================================================
-- Чтобы в карточке клиента не было дубля «Клиент / Клиент» (тип воронки и
-- роль доступа), переименовываем системную роль `student` с label «Клиент»
-- на «Ученик». Code не меняем — это технический идентификатор.
--
-- Также создаём view customers_with_role — customers + JOIN на текущий
-- project_members для отображения роли человека в его карточке и в списке.
-- =====================================================================

-- A. Переименовать label
-- ---------------------------------------------------------------------
-- Обновляем шаблон (project_id IS NULL) и все копии в проектах.
-- code='student' остаётся неизменным — это техн. идентификатор.

UPDATE roles
SET label = 'Ученик'
WHERE code = 'student' AND label = 'Клиент';


-- B. View customers_with_role
-- ---------------------------------------------------------------------
-- Возвращает customer + (если есть membership) его роль в этом же проекте.
-- Используется в /users списке и карточке клиента.

CREATE OR REPLACE VIEW customers_with_role AS
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

-- View наследует RLS от базовой таблицы customers.
