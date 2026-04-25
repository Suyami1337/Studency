-- Система доменов для проектов.
--
-- Каждый проект получает обязательный subdomain (school.studency.ru)
-- и опционально custom_domain (school.com). Уникальность по lower-case.
-- Lendings.slug перестаёт быть глобально уникальным — становится
-- уникальным в рамках проекта (несколько школ могут иметь /pro).

-- 1. projects: subdomain (NOT NULL после бэкфилла)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS subdomain text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS custom_domain text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS custom_domain_status text DEFAULT 'pending';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS custom_domain_added_at timestamptz;

-- Бэкфилл: автогенерация subdomain для существующих проектов.
-- Берём первые 8 символов хеша id с префиксом 'p' — гарантированно валидно.
UPDATE projects
SET subdomain = 'p' || substring(md5(id::text), 1, 9)
WHERE subdomain IS NULL OR subdomain = '';

-- Делаем NOT NULL после бэкфилла
ALTER TABLE projects ALTER COLUMN subdomain SET NOT NULL;

-- Уникальные индексы (lower для case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS projects_subdomain_unique_idx
  ON projects (lower(subdomain));
CREATE UNIQUE INDEX IF NOT EXISTS projects_custom_domain_unique_idx
  ON projects (lower(custom_domain))
  WHERE custom_domain IS NOT NULL;

-- 2. landings.slug: разрешаем дубли между проектами.
-- Если был unique-constraint на slug — снимаем. Уникальность теперь (project_id, slug).
DO $$
DECLARE
  conname text;
BEGIN
  SELECT con.conname INTO conname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'landings' AND con.contype = 'u'
    AND pg_get_constraintdef(con.oid) ILIKE '%slug%'
    AND pg_get_constraintdef(con.oid) NOT ILIKE '%project_id%';
  IF conname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE landings DROP CONSTRAINT ' || quote_ident(conname);
  END IF;
END $$;

-- Аналогично для unique-индексов
DROP INDEX IF EXISTS landings_slug_key;
DROP INDEX IF EXISTS landings_slug_unique;
DROP INDEX IF EXISTS landings_slug_idx;

CREATE UNIQUE INDEX IF NOT EXISTS landings_project_slug_unique_idx
  ON landings (project_id, lower(slug));

-- Комментарии
COMMENT ON COLUMN projects.subdomain IS 'Поддомен проекта на studency.ru (например shkola — school.studency.ru). Обязательный, уникальный.';
COMMENT ON COLUMN projects.custom_domain IS 'Кастомный домен подключённый через Vercel (например shkola.com). Опционально, уникальный.';
COMMENT ON COLUMN projects.custom_domain_status IS 'pending | verified | failed — статус DNS-проверки в Vercel.';
