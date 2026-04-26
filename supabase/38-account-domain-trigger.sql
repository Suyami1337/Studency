-- Auto-create account_domains row from user_metadata.pending_subdomain after
-- email confirmation. Регистрация записывает pending_subdomain в metadata,
-- триггер срабатывает при INSERT (для passwordless / autoconfirm) и при
-- UPDATE.email_confirmed_at IS NOT NULL (классический confirm).

CREATE OR REPLACE FUNCTION public.init_account_domain_from_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pending text;
BEGIN
  pending := NEW.raw_user_meta_data->>'pending_subdomain';
  IF pending IS NULL OR pending = '' THEN
    RETURN NEW;
  END IF;
  -- Insert если ещё нет записи (один ON CONFLICT — по user_id PK)
  BEGIN
    INSERT INTO public.account_domains (user_id, subdomain)
    VALUES (NEW.id, lower(pending))
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    -- subdomain уже занят кем-то — не блокируем регистрацию
    NULL;
  END;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- При любой ошибке (например, subdomain занят) не блокируем регистрацию
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auth_users_init_account_domain_insert ON auth.users;
CREATE TRIGGER auth_users_init_account_domain_insert
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.init_account_domain_from_metadata();

DROP TRIGGER IF EXISTS auth_users_init_account_domain_update ON auth.users;
CREATE TRIGGER auth_users_init_account_domain_update
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL)
  EXECUTE FUNCTION public.init_account_domain_from_metadata();
