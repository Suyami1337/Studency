-- =====================================================================
-- Migration 51: Авто-связь customers.user_id ↔ auth.users.id по email
-- =====================================================================
-- Раньше связь делалась только при accept-invitation или при ручной
-- выдаче доступа. Теперь — автоматически: как только в customer.email
-- появляется адрес, который совпадает с email зарегистрированного
-- auth-юзера, customer.user_id выставляется на этого юзера.
--
-- Это решает кейс: владелец проекта добавляет свой email в свою
-- маркетинговую карточку → карточка автоматически связывается с его
-- auth.user → в /users-списке его роль (Владелец) теперь отображается.
-- =====================================================================

-- A. Trigger function
CREATE OR REPLACE FUNCTION trg_link_customer_to_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  matched_user_id uuid;
BEGIN
  -- Срабатываем только если есть email и user_id ещё не выставлен.
  IF NEW.email IS NULL OR NEW.user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO matched_user_id
  FROM auth.users
  WHERE lower(email) = lower(NEW.email)
  LIMIT 1;

  IF matched_user_id IS NOT NULL THEN
    NEW.user_id := matched_user_id;
  END IF;

  RETURN NEW;
END;
$$;

-- B. Trigger: BEFORE INSERT OR UPDATE OF email
DROP TRIGGER IF EXISTS trg_customers_autolink_user ON customers;
CREATE TRIGGER trg_customers_autolink_user
  BEFORE INSERT OR UPDATE OF email ON customers
  FOR EACH ROW
  EXECUTE FUNCTION trg_link_customer_to_auth_user();

-- C. Backfill для существующих customer-ов: связать всех у кого email
-- совпадает с auth.users.email (case-insensitive).
UPDATE customers c
SET user_id = u.id
FROM auth.users u
WHERE c.email IS NOT NULL
  AND c.user_id IS NULL
  AND lower(c.email) = lower(u.email);
