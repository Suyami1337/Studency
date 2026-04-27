-- ─── Phase: Public code для гостей 2026-04-27 ───
-- Уникальный человекочитаемый ID каждого customer'а — отображается в UI
-- вместо "Без имени" для гостевых карточек.
--
-- Формат: G-1, G-2, ..., G-12345. Уникальность гарантируется SEQUENCE'ом
-- + UNIQUE constraint. Не зависит от имени/email/phone — даже если кто-то
-- спамит карточками, каждая получит свой уникальный код.

CREATE SEQUENCE IF NOT EXISTS customer_public_code_seq START 1;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS public_code text;

-- Backfill существующих: для каждой строки без public_code присваиваем
-- следующий номер из sequence. Делаем за одну UPDATE — порядок по created_at,
-- чтобы более старые получили меньшие номера.
UPDATE customers
SET public_code = 'G-' || nextval('customer_public_code_seq')
WHERE public_code IS NULL;

-- Теперь делаем NOT NULL и DEFAULT для будущих INSERT'ов
ALTER TABLE customers
  ALTER COLUMN public_code SET DEFAULT 'G-' || nextval('customer_public_code_seq');

ALTER TABLE customers
  ALTER COLUMN public_code SET NOT NULL;

-- UNIQUE constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_public_code ON customers(public_code);
