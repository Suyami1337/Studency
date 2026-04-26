-- Одноразовые handoff-токены для передачи auth между main domain и subdomain.
--
-- Когда юзер на studency.ru/projects кликает свой проект, мы:
-- 1. Создаём здесь запись с его access+refresh tokens, expires через 60s
-- 2. Редиректим на <sub>.studency.ru/api/auth/handoff-consume?id=<uuid>
-- 3. Subdomain читает запись, помечает used, ставит свою cookie через setSession
--
-- Cookie на subdomain ставится host-only (без domain) — Supabase ssr
-- надёжно chunkает большие токены без проблем с domain атрибутом.

CREATE TABLE IF NOT EXISTS auth_handoffs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  target_path  text DEFAULT '/',
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_handoffs_expires_idx ON auth_handoffs (expires_at);

-- RLS не включаем — таблица только для service role (handoff-create/consume)
COMMENT ON TABLE auth_handoffs IS 'Одноразовые handoff токены для передачи auth между main и subdomain. Доступ только service role.';
