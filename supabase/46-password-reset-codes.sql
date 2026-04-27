-- =====================================================================
-- Migration 46: Таблица для 6-значных кодов восстановления пароля
-- =====================================================================
-- Используется в /forgot flow:
-- 1. POST /api/auth/forgot {email} → создаём код, шлём на email
-- 2. POST /api/auth/reset-password {email, code, new_password} → проверяем,
--    меняем пароль через admin API, помечаем код used.
-- =====================================================================

CREATE TABLE IF NOT EXISTS password_reset_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pwd_reset_email_lower ON password_reset_codes(lower(email));
CREATE INDEX IF NOT EXISTS idx_pwd_reset_expires ON password_reset_codes(expires_at);

-- RLS: ничего не должно быть видно через клиент. Только service_role читает/пишет.
ALTER TABLE password_reset_codes ENABLE ROW LEVEL SECURITY;
-- Без policy = никто из authenticated/anon не имеет доступа. Ровно то что нужно.
