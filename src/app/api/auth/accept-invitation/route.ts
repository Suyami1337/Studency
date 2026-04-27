// POST /api/auth/accept-invitation
//
// Принимает приглашение и (если нужно) создаёт новый auth.user.
// После успеха пользователь логинится паролем на клиенте — ничего не возвращаем
// кроме статуса (сессию устанавливает сам клиент через signInWithPassword).
//
// Body для НОВОГО пользователя: { token, full_name, password }
// Body для СУЩЕСТВУЮЩЕГО пользователя: { token } — просто валидируем токен +
//   создаём project_members. Логин клиент сделает сам.
//
// После accept:
// - Создаётся auth.user (если новый, через admin API с email_confirm=true)
// - Создаётся users_meta(can_create_projects=FALSE) — приглашённые НЕ могут
//   создавать новые проекты на платформе
// - Создаётся project_members(role=invited.role_id, status='active')
// - Связывается customers.user_id с новым user_id
// - invitation помечается used_at + invited_user_id

import { NextResponse } from 'next/server'
import { createClient as createSbClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  let body: { token?: string; full_name?: string; password?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const token = body.token?.trim()
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const svc = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // 1. Валидируем токен
  const { data: inv } = await svc
    .from('invitations')
    .select('id, email, project_id, role_id, expires_at, used_at, customer_id')
    .eq('token', token)
    .maybeSingle()
  if (!inv) return NextResponse.json({ error: 'invitation not found' }, { status: 404 })
  if (inv.used_at) return NextResponse.json({ error: 'invitation already used' }, { status: 410 })
  if (new Date(inv.expires_at) < new Date()) {
    return NextResponse.json({ error: 'invitation expired' }, { status: 410 })
  }

  // 2. Существует ли уже user с этим email?
  const { data: usersList } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 })
  const existingUser = usersList?.users?.find(
    u => u.email?.toLowerCase() === inv.email.toLowerCase(),
  )

  let userId: string

  if (existingUser) {
    // СУЩЕСТВУЮЩИЙ — клиент сам залогинится после нашего ответа
    userId = existingUser.id
  } else {
    // НОВЫЙ — создаём через admin API (email_confirm=true чтобы не требовать magic link)
    const password = body.password?.trim()
    const fullName = body.full_name?.trim() || null
    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'password required (min 6 chars)' }, { status: 400 })
    }

    const { data: createData, error: createErr } = await svc.auth.admin.createUser({
      email: inv.email,
      password,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    })
    if (createErr || !createData?.user) {
      console.error('create user error:', createErr)
      return NextResponse.json({ error: createErr?.message || 'failed to create user' }, { status: 500 })
    }
    userId = createData.user.id

    // users_meta — для приглашённого can_create_projects = FALSE
    await svc.from('users_meta').upsert({
      user_id: userId,
      full_name: fullName,
      can_create_projects: false,
    }, { onConflict: 'user_id' })
  }

  // 3. Создаём project_members с указанной ролью
  const { error: memberErr } = await svc
    .from('project_members')
    .upsert({
      project_id: inv.project_id,
      user_id: userId,
      role_id: inv.role_id,
      status: 'active',
      invited_by: null,
    }, { onConflict: 'project_id,user_id' })

  if (memberErr) {
    console.error('create project_members error:', memberErr)
    return NextResponse.json({ error: 'failed to add to project' }, { status: 500 })
  }

  // 4. Связываем customer.user_id если есть
  if (inv.customer_id) {
    await svc
      .from('customers')
      .update({ user_id: userId })
      .eq('id', inv.customer_id)
      .is('user_id', null)
  }

  // 5. Помечаем invitation как использованное
  await svc
    .from('invitations')
    .update({ used_at: new Date().toISOString(), invited_user_id: userId })
    .eq('id', inv.id)

  return NextResponse.json({
    ok: true,
    email: inv.email,
    user_id: userId,
    is_new_user: !existingUser,
    project_id: inv.project_id,
  })
}
