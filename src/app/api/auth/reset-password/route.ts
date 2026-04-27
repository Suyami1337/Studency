// POST /api/auth/reset-password { email, code, new_password }
//
// Проверяет 6-значный код и меняет пароль через admin API.
// Защита от bruteforce: max 5 попыток на код, потом invalidate.

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient as createSbClient } from '@supabase/supabase-js'

const MAX_ATTEMPTS = 5

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

export async function POST(request: Request) {
  let body: { email?: string; code?: string; new_password?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const email = body.email?.trim().toLowerCase()
  const code = body.code?.trim()
  const newPassword = body.new_password
  if (!email || !code || !newPassword) {
    return NextResponse.json({ error: 'email, code, new_password required' }, { status: 400 })
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'password must be at least 6 chars' }, { status: 400 })
  }

  const svc = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Берём последний неиспользованный код для этого email
  const { data: codeRow } = await svc
    .from('password_reset_codes')
    .select('id, code_hash, expires_at, used_at, attempts')
    .eq('email', email)
    .is('used_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!codeRow) {
    return NextResponse.json({ error: 'invalid or expired code' }, { status: 400 })
  }

  if (codeRow.attempts >= MAX_ATTEMPTS) {
    // Помечаем как used чтобы новый код был запрошен
    await svc.from('password_reset_codes').update({ used_at: new Date().toISOString() }).eq('id', codeRow.id)
    return NextResponse.json({ error: 'too many attempts, request new code' }, { status: 429 })
  }

  if (new Date(codeRow.expires_at) < new Date()) {
    await svc.from('password_reset_codes').update({ used_at: new Date().toISOString() }).eq('id', codeRow.id)
    return NextResponse.json({ error: 'code expired' }, { status: 400 })
  }

  const submittedHash = hashCode(code)
  // Сравнение через timingSafeEqual чтобы не дать timing-атак
  let match = false
  try {
    match = crypto.timingSafeEqual(
      Buffer.from(submittedHash, 'hex'),
      Buffer.from(codeRow.code_hash, 'hex'),
    )
  } catch { match = false }

  if (!match) {
    await svc.from('password_reset_codes').update({ attempts: codeRow.attempts + 1 }).eq('id', codeRow.id)
    return NextResponse.json({ error: 'invalid code' }, { status: 400 })
  }

  // Найти user-а
  const { data: usersList } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 })
  const user = usersList?.users?.find(u => u.email?.toLowerCase() === email)
  if (!user) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 })
  }

  // Меняем пароль через admin API
  const { error: updErr } = await svc.auth.admin.updateUserById(user.id, {
    password: newPassword,
  })
  if (updErr) {
    console.error('reset password error:', updErr)
    return NextResponse.json({ error: 'failed to update password' }, { status: 500 })
  }

  // Помечаем код used
  await svc.from('password_reset_codes').update({ used_at: new Date().toISOString() }).eq('id', codeRow.id)

  return NextResponse.json({ ok: true, email })
}
