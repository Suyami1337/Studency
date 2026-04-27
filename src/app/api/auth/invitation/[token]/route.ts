// GET /api/auth/invitation/[token]
//
// Публичный endpoint (без авторизации) — отдаёт инфу по токену приглашения,
// чтобы страница /invite/[token] могла отрисовать форму ("новая регистрация" vs
// "вход существующим аккаунтом").
//
// Возвращает: {
//   valid: boolean,
//   reason?: 'expired' | 'used' | 'not_found',
//   email?, school_name?, role_label?, role_access_type?,
//   is_existing_user?: boolean (есть ли уже auth.user с таким email)
// }

import { NextResponse } from 'next/server'
import { createClient as createSbClient } from '@supabase/supabase-js'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token) return NextResponse.json({ valid: false, reason: 'not_found' }, { status: 400 })

  const svc = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: inv } = await svc
    .from('invitations')
    .select('id, email, project_id, role_id, expires_at, used_at, invited_user_id')
    .eq('token', token)
    .maybeSingle()

  if (!inv) return NextResponse.json({ valid: false, reason: 'not_found' })
  if (inv.used_at) return NextResponse.json({ valid: false, reason: 'used' })
  if (new Date(inv.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, reason: 'expired' })
  }

  // Подгружаем имя школы и роли для отображения
  const [{ data: proj }, { data: role }] = await Promise.all([
    svc.from('projects').select('name').eq('id', inv.project_id).maybeSingle(),
    svc.from('roles').select('label, code, access_type').eq('id', inv.role_id).maybeSingle(),
  ])

  // Проверяем актуально ли наличие user-а (мог зарегистрироваться после создания инвайта)
  let isExistingUser = Boolean(inv.invited_user_id)
  if (!isExistingUser) {
    const { data: usersList } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 })
    const found = usersList?.users?.find(u => u.email?.toLowerCase() === inv.email.toLowerCase())
    if (found) isExistingUser = true
  }

  return NextResponse.json({
    valid: true,
    email: inv.email,
    school_name: proj?.name ?? 'Studency',
    role_label: role?.label ?? 'Участник',
    role_code: role?.code ?? '',
    role_access_type: role?.access_type ?? 'admin_panel',
    is_existing_user: isExistingUser,
  })
}
