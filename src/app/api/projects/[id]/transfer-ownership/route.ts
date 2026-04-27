// POST /api/projects/[id]/transfer-ownership
//
// Body: { target_user_id, password }
//
// Передаёт владение проектом другому участнику. Только текущий владелец может.
// Защита: проверка пароля владельца через signInWithPassword.
//
// Что меняется:
// - project_members[target].role_id = owner role of project
// - project_members[me].role_id = super_admin role of project
// - projects.owner_id = target_user_id

import { NextResponse } from 'next/server'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { target_user_id?: string; password?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const targetUserId = body.target_user_id?.trim()
  const password = body.password
  if (!targetUserId || !password) return NextResponse.json({ error: 'target_user_id and password required' }, { status: 400 })
  if (targetUserId === user.id) return NextResponse.json({ error: 'cannot transfer to self' }, { status: 400 })

  const svc = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // 1. Текущий user должен быть owner-ом проекта
  const { data: myMember } = await svc
    .from('project_members')
    .select('role_id, roles!inner(code)')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  type RoleNode = { code: string }
  const myRoleCode = (myMember as unknown as { roles: RoleNode | RoleNode[] } | null)
    ? (Array.isArray((myMember as unknown as { roles: RoleNode | RoleNode[] }).roles)
        ? ((myMember as unknown as { roles: RoleNode[] }).roles[0]?.code)
        : ((myMember as unknown as { roles: RoleNode }).roles?.code))
    : null
  if (myRoleCode !== 'owner') return NextResponse.json({ error: 'only owner can transfer ownership' }, { status: 403 })

  // 2. Target должен быть super_admin в этом проекте
  const { data: targetMember } = await svc
    .from('project_members')
    .select('id, role_id, roles!inner(code)')
    .eq('project_id', projectId)
    .eq('user_id', targetUserId)
    .maybeSingle()
  if (!targetMember) return NextResponse.json({ error: 'target is not a member of this project' }, { status: 404 })
  const targetRoleCode = (targetMember as unknown as { roles: RoleNode | RoleNode[] })
    ? (Array.isArray((targetMember as unknown as { roles: RoleNode | RoleNode[] }).roles)
        ? ((targetMember as unknown as { roles: RoleNode[] }).roles[0]?.code)
        : ((targetMember as unknown as { roles: RoleNode }).roles?.code))
    : null
  if (targetRoleCode !== 'super_admin') {
    return NextResponse.json({ error: 'target must be super_admin first — promote them before transfer' }, { status: 400 })
  }

  // 3. Проверка пароля владельца через повторный signInWithPassword
  // Создаём временный supabase client, чтобы не повредить текущей сессии
  const tempClient = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { error: passErr } = await tempClient.auth.signInWithPassword({
    email: user.email!,
    password,
  })
  if (passErr) return NextResponse.json({ error: 'invalid password' }, { status: 403 })

  // 4. Получаем project owner-роль и super_admin-роль (этого проекта)
  const { data: roles } = await svc
    .from('roles')
    .select('id, code')
    .eq('project_id', projectId)
    .in('code', ['owner', 'super_admin'])
  const ownerRole = roles?.find(r => r.code === 'owner')
  const superRole = roles?.find(r => r.code === 'super_admin')
  if (!ownerRole || !superRole) {
    return NextResponse.json({ error: 'project roles missing — cannot transfer' }, { status: 500 })
  }

  // 5. Транзакционно меняем роли. Через 2 update'а — для атомарности можно
  //    обернуть в Postgres function, но для MVP двух последовательных хватит.
  const errors: string[] = []
  const { error: e1 } = await svc.from('project_members')
    .update({ role_id: superRole.id })
    .eq('project_id', projectId)
    .eq('user_id', user.id)
  if (e1) errors.push('demote_old: ' + e1.message)

  const { error: e2 } = await svc.from('project_members')
    .update({ role_id: ownerRole.id })
    .eq('project_id', projectId)
    .eq('user_id', targetUserId)
  if (e2) errors.push('promote_new: ' + e2.message)

  // 6. Обновляем projects.owner_id (ссылка остаётся актуальной для старого кода)
  const { error: e3 } = await svc.from('projects')
    .update({ owner_id: targetUserId })
    .eq('id', projectId)
  if (e3) errors.push('owner_id: ' + e3.message)

  if (errors.length > 0) {
    console.error('transfer ownership errors:', errors)
    return NextResponse.json({ error: 'partial failure: ' + errors.join('; ') }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
