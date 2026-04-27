// POST /api/team/impersonate { target_user_id, project_id }
//
// «Войти от лица другого пользователя» — для тестирования и поддержки.
// Требует team.impersonate в указанном проекте.
//
// Алгоритм:
// 1. Сохраняем текущие access_token + refresh_token в HTTP-only cookie
//    `studency-impersonator-stash` (для возврата через exit).
// 2. Через admin API generateLink({type:'magiclink'}) для target email
//    получаем hashed_token.
// 3. На anon-клиенте делаем verifyOtp с этим токеном — получаем session
//    target user-а.
// 4. Через серверный supabase-client (setSession) перезаписываем cookies —
//    auth-cookie теперь принадлежит target user-у.
// 5. Ставим маркер-cookie `studency-impersonating` (читаем в баннере).
//
// Защита:
// - Нельзя impersonate владельца проекта если ты сам не владелец.
// - Нельзя impersonate себя.
// - Защита от перепрыгивания: если уже идёт impersonation (есть stash) —
//   возвращаем ошибку (нужно сначала exit).

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { hasPermission, PERMISSIONS } from '@/lib/permissions'

const STASH_COOKIE = 'studency-impersonator-stash'
const MARKER_COOKIE = 'studency-impersonating'
const STASH_TTL_SECONDS = 60 * 60 * 4 // 4 часа

// Иерархия ролей. Можно impersonate ТОЛЬКО того, у кого rank СТРОГО НИЖЕ
// твоего. Кастомные роли получают rank по access_type:
//   admin_panel custom → 40 (между admin и student)
//   student_panel custom → 20
//   no_access custom → 0
function getRoleRank(roleCode: string, accessType: string): number {
  switch (roleCode) {
    case 'owner': return 100
    case 'super_admin': return 80
    case 'admin': return 60
    case 'curator':
    case 'sales':
    case 'marketer': return 40
    case 'student': return 20
    case 'lead':
    case 'guest': return 0
  }
  // Кастомная роль
  if (accessType === 'admin_panel') return 40
  if (accessType === 'student_panel') return 20
  return 0
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase()
  const userResp = await supabase.auth.getUser()
  const sessResp = await supabase.auth.getSession()
  const cur = userResp.data.user
  const sess = sessResp.data.session
  if (!cur || !sess) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { target_user_id?: string; project_id?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const targetUserId = body.target_user_id?.trim()
  const projectId = body.project_id?.trim()
  if (!targetUserId || !projectId) {
    return NextResponse.json({ error: 'target_user_id and project_id required' }, { status: 400 })
  }
  if (targetUserId === cur.id) return NextResponse.json({ error: 'cannot impersonate yourself' }, { status: 400 })

  const allowed = await hasPermission(supabase, projectId, cur.id, PERMISSIONS.TEAM_IMPERSONATE)
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const cookieStore = await cookies()
  if (cookieStore.get(STASH_COOKIE)) {
    return NextResponse.json({ error: 'already impersonating — exit first' }, { status: 409 })
  }

  const svc = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Защита: target должен быть active member этого проекта.
  const { data: targetMember } = await svc
    .from('project_members')
    .select('id, status, roles!inner(code, access_type, label)')
    .eq('project_id', projectId)
    .eq('user_id', targetUserId)
    .maybeSingle()
  if (!targetMember) return NextResponse.json({ error: 'target is not a member of this project' }, { status: 404 })
  if ((targetMember as { status: string }).status !== 'active') {
    return NextResponse.json({ error: 'target is not active in this project' }, { status: 400 })
  }

  type RoleNode = { code: string; access_type: string; label: string }
  const targetRole = Array.isArray((targetMember as unknown as { roles: RoleNode | RoleNode[] }).roles)
    ? ((targetMember as unknown as { roles: RoleNode[] }).roles[0])
    : ((targetMember as unknown as { roles: RoleNode }).roles)

  // Иерархия ролей: можно impersonate ТОЛЬКО того кто строго ниже тебя.
  const { data: myMember } = await svc
    .from('project_members')
    .select('roles!inner(code, access_type)')
    .eq('project_id', projectId).eq('user_id', cur.id).maybeSingle()
  const myRole = Array.isArray((myMember as unknown as { roles: RoleNode | RoleNode[] } | null)?.roles)
    ? ((myMember as unknown as { roles: RoleNode[] }).roles[0])
    : ((myMember as unknown as { roles: RoleNode } | null)?.roles)
  if (!myRole) {
    return NextResponse.json({ error: 'you are not a member of this project' }, { status: 403 })
  }

  const myRank = getRoleRank(myRole.code, myRole.access_type)
  const targetRank = getRoleRank(targetRole.code, targetRole.access_type)

  if (targetRank >= myRank) {
    return NextResponse.json({
      error: 'cannot impersonate user with equal or higher role',
      hint: `Ваша роль на уровне ${myRank}, целевая на уровне ${targetRank}. Войти можно только под ту, что ниже.`,
    }, { status: 403 })
  }

  // Получаем email target user-а через admin API
  const { data: targetUserData, error: getUserErr } = await svc.auth.admin.getUserById(targetUserId)
  if (getUserErr || !targetUserData?.user?.email) {
    return NextResponse.json({ error: 'target user has no email or not found' }, { status: 400 })
  }
  const targetEmail = targetUserData.user.email

  // Генерируем magic link, забираем hashed_token
  const { data: linkData, error: linkErr } = await svc.auth.admin.generateLink({
    type: 'magiclink',
    email: targetEmail,
  })
  if (linkErr || !linkData?.properties?.hashed_token) {
    console.error('generateLink error:', linkErr)
    return NextResponse.json({ error: 'failed to generate impersonation token' }, { status: 500 })
  }

  // verifyOtp на anon-клиенте — получаем session target user-а
  const anon = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { data: verifyData, error: verifyErr } = await anon.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties.hashed_token,
  })
  if (verifyErr || !verifyData?.session) {
    console.error('verifyOtp error:', verifyErr)
    return NextResponse.json({ error: 'failed to create target session' }, { status: 500 })
  }
  const targetSession = verifyData.session

  // 1. Сохраняем СТАРУЮ сессию (нашу) в HTTP-only cookie для exit.
  const stashPayload = {
    access_token: sess.access_token,
    refresh_token: sess.refresh_token,
    user_email: cur.email,
    target_user_id: targetUserId,
    target_email: targetEmail,
    started_at: Date.now(),
  }
  cookieStore.set(STASH_COOKIE, JSON.stringify(stashPayload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: STASH_TTL_SECONDS,
  })

  // 2. Заменяем auth-cookie на target-сессию через @supabase/ssr setSession.
  //    SSR client сам пишет правильные `sb-<project_ref>-auth-token` cookies.
  const ssrClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    },
  )
  const { error: setSessErr } = await ssrClient.auth.setSession({
    access_token: targetSession.access_token,
    refresh_token: targetSession.refresh_token,
  })
  if (setSessErr) {
    cookieStore.delete(STASH_COOKIE)
    return NextResponse.json({ error: 'failed to set target session: ' + setSessErr.message }, { status: 500 })
  }

  // 3. Маркер для UI-баннера (читаем на клиенте)
  cookieStore.set(MARKER_COOKIE, JSON.stringify({
    target_email: targetEmail,
    target_role_label: targetRole.label,
    started_at: Date.now(),
  }), {
    httpOnly: false, // чтобы клиент мог прочитать для баннера
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: STASH_TTL_SECONDS,
  })

  // Куда редиректить: student → /learn, иначе /project/<id>
  const redirectPath = targetRole.access_type === 'student_panel'
    ? '/learn'
    : `/project/${projectId}`

  return NextResponse.json({
    ok: true,
    target_email: targetEmail,
    target_role: targetRole.label,
    redirect: redirectPath,
  })
}
