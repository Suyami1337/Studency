// POST /api/auth/forgot { email }
//
// Генерирует 6-значный код восстановления пароля, шлёт на email.
// Защита: rate limit (не чаще 1 кода в 60 секунд на email).
//
// Безопасность: всегда возвращаем 200 ok даже если email не существует
// (защита от перечисления).

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'

const CODE_TTL_MINUTES = 15
const RATE_LIMIT_SECONDS = 60

function generate6DigitCode(): string {
  // crypto.randomInt — неуязвимо к timing attacks для генерации
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

export async function POST(request: Request) {
  let body: { email?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const email = body.email?.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'invalid email' }, { status: 400 })
  }

  const svc = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Rate limit: ищем последний неиспользованный код для этого email
  const { data: lastCode } = await svc
    .from('password_reset_codes')
    .select('created_at')
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastCode) {
    const elapsedSec = (Date.now() - new Date(lastCode.created_at).getTime()) / 1000
    if (elapsedSec < RATE_LIMIT_SECONDS) {
      return NextResponse.json({
        ok: true,
        info: 'rate_limited',
        wait_seconds: Math.ceil(RATE_LIMIT_SECONDS - elapsedSec),
      })
    }
  }

  // Существует ли user?
  const { data: usersList } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 })
  const user = usersList?.users?.find(u => u.email?.toLowerCase() === email)

  if (!user) {
    // Не палим существование email. Возвращаем «ok».
    return NextResponse.json({ ok: true })
  }

  // Генерируем код, сохраняем hash
  const code = generate6DigitCode()
  const codeHash = hashCode(code)
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000)

  await svc.from('password_reset_codes').insert({
    email,
    code_hash: codeHash,
    expires_at: expiresAt.toISOString(),
  })

  // Шлём email
  const subject = 'Код восстановления пароля Studency'
  const text = `Здравствуйте!

Ваш код для восстановления пароля: ${code}

Код действует ${CODE_TTL_MINUTES} минут. Если вы не запрашивали восстановление — просто проигнорируйте это письмо.`

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8F7FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,#6A55F8,#8B7BFA);color:white;font-weight:700;font-size:24px;line-height:56px;">S</div>
    </div>
    <div style="background:white;border-radius:16px;padding:32px;border:1px solid #eee;text-align:center;">
      <h1 style="margin:0 0 16px 0;font-size:18px;font-weight:600;">Код для восстановления пароля</h1>
      <p style="margin:0 0 24px 0;color:#555;line-height:1.5;">Введите этот код на странице восстановления:</p>
      <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#6A55F8;background:#F5F3FF;padding:18px 24px;border-radius:12px;display:inline-block;font-family:ui-monospace,monospace;">${code}</div>
      <p style="margin:24px 0 0 0;color:#999;font-size:13px;line-height:1.5;">Код действует ${CODE_TTL_MINUTES} минут. Если вы не запрашивали восстановление — просто проигнорируйте это письмо.</p>
    </div>
  </div>
</body></html>`

  await sendEmail({
    to: email,
    subject,
    text,
    html,
    fromName: 'Studency',
    addFooter: false,
  })

  return NextResponse.json({ ok: true })
}
