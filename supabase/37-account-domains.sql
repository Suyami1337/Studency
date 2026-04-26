-- Перенос subdomain/custom_domain с уровня проекта на уровень аккаунта.
--
-- БЫЛО: каждый проект имел свой subdomain. URL: <sub>.studency.ru/sites
-- СТАЛО: один subdomain на весь аккаунт. URL: <sub>.studency.ru/project/<id>/sites
--   Лендинги: <sub>.studency.ru/<slug> (slug уник в рамках account)
--   Все проекты юзера живут под одним subdomain'ом.

-- 1. Таблица account_domains (по одной записи на user_id)
CREATE TABLE IF NOT EXISTS account_domains (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  subdomain text NOT NULL,
  custom_domain text,
  custom_domain_status text DEFAULT 'pending',
  custom_domain_added_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Уникальность (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS account_domains_subdomain_unique_idx
  ON account_domains (lower(subdomain));
CREATE UNIQUE INDEX IF NOT EXISTS account_domains_custom_domain_unique_idx
  ON account_domains (lower(custom_domain))
  WHERE custom_domain IS NOT NULL;

-- 2. Бэкфил: для каждого юзера — берём subdomain САМОГО СТАРОГО его проекта
-- (где он owner). Это предотвращает потерю текущей рабочей школы.
INSERT INTO account_domains (user_id, subdomain, custom_domain, custom_domain_status, custom_domain_added_at)
SELECT DISTINCT ON (p.owner_id)
  p.owner_id,
  p.subdomain,
  p.custom_domain,
  COALESCE(p.custom_domain_status, 'pending'),
  p.custom_domain_added_at
FROM projects p
WHERE p.subdomain IS NOT NULL
ORDER BY p.owner_id, p.created_at ASC
ON CONFLICT (user_id) DO NOTHING;

-- 3. RLS: юзер читает/обновляет только свою запись
ALTER TABLE account_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_domains_select ON account_domains;
CREATE POLICY account_domains_select ON account_domains
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS account_domains_insert ON account_domains;
CREATE POLICY account_domains_insert ON account_domains
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS account_domains_update ON account_domains;
CREATE POLICY account_domains_update ON account_domains
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 4. Триггер на updated_at
CREATE OR REPLACE FUNCTION account_domains_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS account_domains_updated_at_trigger ON account_domains;
CREATE TRIGGER account_domains_updated_at_trigger
  BEFORE UPDATE ON account_domains
  FOR EACH ROW EXECUTE FUNCTION account_domains_set_updated_at();

-- 5. Лендинги: добавляем колонку owner_id для уникальности slug в рамках
-- аккаунта (а не проекта). Заполняем backfill'ом и триггером поддерживаем
-- актуальность.
ALTER TABLE landings ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill: owner_id из projects
UPDATE landings l
SET owner_id = p.owner_id
FROM projects p
WHERE l.project_id = p.id AND l.owner_id IS NULL;

-- Триггер: при insert/update проставляем owner_id из projects автоматически
CREATE OR REPLACE FUNCTION landing_set_owner_id()
RETURNS trigger AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    SELECT owner_id INTO NEW.owner_id FROM projects WHERE id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS landing_owner_id_trigger ON landings;
CREATE TRIGGER landing_owner_id_trigger
  BEFORE INSERT OR UPDATE OF project_id ON landings
  FOR EACH ROW EXECUTE FUNCTION landing_set_owner_id();

-- Старый индекс на (project_id, slug) — оставляем для обратной совместимости,
-- но добавляем строгий уникальный по (owner_id, slug).
DROP INDEX IF EXISTS landings_owner_slug_unique_idx;
CREATE UNIQUE INDEX landings_owner_slug_unique_idx
  ON landings (owner_id, lower(slug))
  WHERE owner_id IS NOT NULL;

COMMENT ON TABLE account_domains IS 'Subdomain и custom_domain на уровне аккаунта (один на юзера, под ним живут все его проекты).';
