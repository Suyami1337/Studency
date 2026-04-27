// POST /api/team/invite
//
// Создаёт invitation в проект и отправляет email со ссылкой регистрации/входа.
// Требует permission team.members.invite в указанном проекте.
//
// Body: { project_id, email, role_id, customer_id? }
//
// Поведение:
// - Проверяет что role_id принадлежит этому проекту (защита от подделки)
// - Если у email уже есть auth.user — связывает invitation.invited_user_id
// - Находит/создаёт customer-карточку в проекте по email
// - Генерирует одноразовый токен (TTL 7 дней)
// - Шлёт email через Resend (письмо «вам открыт доступ» если user уже есть,
//   «приглашение зарегистрироваться» если новый)
//
// Возвращает: { ok, invite_url, token, invitation_id, email_sent }

import { NextResponse } from 'next/server'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { hasPermission, PERMISSIONS } from '@/lib/permissions'
import {
  generateInvitationToken,
  getInvitationExpiresAt,
  buildInvitationUrl,
  renderInvitationEmail,
} from '@/lib/invitations'
import { sendProjectEmail } from '@/lib/email'

export async function POST(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { project_id?: string; email?: string; role_id?: string; customer_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const projectId = body.project_id?.trim()
  const email = body.email?.trim().toLowerCase()
  const roleId = body.role_id?.trim()
  if (!projectId || !email || !roleId) {
    return NextResponse.json({ error: 'project_id, email, role_id required' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'invalid email' }, { status: 400 })
  }

  const allowed = await hasPermission(supabase, projectId, user.id, PERMISSIONS.TEAM_MEMBERS_INVITE)
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // Роль должна принадлежать этому проекту
  const { data: role } = await supabase
    .from('roles')
    .select('id, label, project_id, access_type')
    .eq('id', roleId)
    .maybeSingle()
  if (!role || role.project_id !== projectId) {
    return NextResponse.json({ error: 'role does not belong to project' }, { status: 400 })
  }

  // Service role для admin-операций (поиск user по email, создание customer)
  const svc = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // 1. Найти существующего auth.user по email (через admin API)
  const { data: usersList } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 })
  const existingUser = usersList?.users?.find(
    u => u.email?.toLowerCase() === email,
  )

  // Если user уже член ЭТОГО проекта — приглашать второй раз нельзя
  if (existingUser) {
    const { data: existingMember } = await svc
      .from('project_members')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', existingUser.id)
      .maybeSingle()
    if (existingMember) {
      return NextResponse.json({ error: 'user already member of this project' }, { status: 409 })
    }
  }

  // 2. Найти/создать customer в этом проекте по email
  let customerId = body.customer_id?.trim() || null
  if (!customerId) {
    const { data: existingCustomer } = await svc
      .from('customers')
      .select('id')
      .eq('project_id', projectId)
      .eq('email', email)
      .maybeSingle()
    if (existingCustomer) {
      customerId = existingCustomer.id
    } else {
      const { data: newCustomer, error: createCustErr } = await svc
        .from('customers')
        .insert({ project_id: projectId, email, source: 'invitation' })
        .select('id')
        .single()
      if (createCustErr) {
        console.error('create customer error:', createCustErr)
      } else {
        customerId = newCustomer.id
      }
    }
  }

  // Если у customer ещё нет user_id, но user уже есть — связываем
  if (existingUser && customerId) {
    await svc
      .from('customers')
      .update({ user_id: existingUser.id })
      .eq('id', customerId)
      .is('user_id', null)
  }

  // 3. Создаём invitation
  const token = generateInvitationToken()
  const expiresAt = getInvitationExpiresAt()

  const { data: invitation, error: invErr } = await svc
    .from('invitations')
    .insert({
      project_id: projectId,
      email,
      role_id: roleId,
      token,
      expires_at: expiresAt.toISOString(),
      invited_by: user.id,
      invited_user_id: existingUser?.id ?? null,
      customer_id: customerId,
    })
    .select('id')
    .single()

  if (invErr || !invitation) {
    console.error('create invitation error:', invErr)
    return NextResponse.json({ error: 'failed to create invitation' }, { status: 500 })
  }

  // 4. Строим URL приглашения
  const inviteUrl = await buildInvitationUrl(svc, projectId, token)

  // 5. Получаем имя школы и инвайтера
  const { data: project } = await svc
    .from('projects')
    .select('name')
    .eq('id', projectId)
    .single()
  const schoolName = project?.name ?? 'Studency'

  const { data: inviterMeta } = await svc
    .from('users_meta')
    .select('full_name')
    .eq('user_id', user.id)
    .maybeSingle()
  const inviterName = inviterMeta?.full_name || undefined

  // 6. Шлём email
  const emailContent = renderInvitationEmail({
    schoolName,
    roleLabel: role.label,
    inviteUrl,
    inviterName,
    isExistingUser: Boolean(existingUser),
  })

  const emailResult = await sendProjectEmail(svc, {
    projectId,
    to: email,
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html,
    fromName: schoolName,
  })

  return NextResponse.json({
    ok: true,
    invitation_id: invitation.id,
    invite_url: inviteUrl,
    token,
    email_sent: emailResult.ok,
    email_error: emailResult.ok ? null : emailResult.error,
    is_existing_user: Boolean(existingUser),
  })
}
