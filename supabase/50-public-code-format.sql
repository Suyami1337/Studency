-- =====================================================================
-- Migration 50: public_code формат «G-1» → «#1»
-- =====================================================================
-- Раньше: G-1, G-2, G-3 (намёк на «гость»)
-- Теперь: #1, #2, #3 (просто номер). Это общий ID клиента, читается
-- как номер тикета.
-- Sequence остаётся прежний — номера не пересекаются.
-- =====================================================================

-- A. Backfill существующих кодов: G-NNN → #NNN
UPDATE customers
SET public_code = REPLACE(public_code, 'G-', '#')
WHERE public_code LIKE 'G-%';

-- B. Меняем DEFAULT для новых строк
ALTER TABLE customers
  ALTER COLUMN public_code SET DEFAULT '#' || nextval('customer_public_code_seq');
