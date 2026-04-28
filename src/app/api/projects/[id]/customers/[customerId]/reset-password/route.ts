// POST /api/projects/[id]/customers/[customerId]/reset-password
//
// Админ-сброс пароля для зарегистрированного customer-а. Доступно ТОЛЬКО
// владельцу и главному админу проекта. После смены пароля на email
// пользователя уходит уведомление «ваш пароль был изменён администратором».
//
// Body: { new_password }

import { NextResponse } from 'next/server'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { sendEmail } from '@/lib/email'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; customerId: string }> },
) {
  const { id: projectId, customerId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { new_password?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const newPassword = body.new_password
  if (!newPassword || newPassword.length < 6) {
    return NextResponse.json({ error: 'password must be at least 6 chars' }, { status: 400 })
  }

  const svc = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Проверяем роль текущего user-а: только owner или super_admin
  const { data: myMember } = await svc
    .from('project_members')
    .select('roles!inner(code)')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()
  type RoleNode = { code: string }
  const myRoleCode = Array.isArray((myMember as unknown as { roles: RoleNode | RoleNode[] } | null)?.roles)
    ? ((myMember as unknown as { roles: RoleNode[] }).roles[0]?.code)
    : ((myMember as unknown as { roles: RoleNode } | null)?.roles?.code)

  if (myRoleCode !== 'owner' && myRoleCode !== 'super_admin') {
    return NextResponse.json({ error: 'only owner or super_admin can reset passwords' }, { status: 403 })
  }

  // Получаем customer и его user_id
  const { data: customer } = await svc
    .from('customers')
    .select('id, project_id, user_id, email, full_name')
    .eq('id', customerId)
    .maybeSingle()
  if (!customer || customer.project_id !== projectId) {
    return NextResponse.json({ error: 'customer not found' }, { status: 404 })
  }
  if (!customer.user_id) {
    return NextResponse.json({ error: 'customer has no platform account — nothing to reset' }, { status: 400 })
  }

  // Защита: нельзя сбросить пароль владельцу проекта если ты не он сам
  const { data: targetMember } = await svc
    .from('project_members')
    .select('roles!inner(code)')
    .eq('project_id', projectId)
    .eq('user_id', customer.user_id)
    .maybeSingle()
  const targetRoleCode = Array.isArray((targetMember as unknown as { roles: RoleNode | RoleNode[] } | null)?.roles)
    ? ((targetMember as unknown as { roles: RoleNode[] }).roles[0]?.code)
    : ((targetMember as unknown as { roles: RoleNode } | null)?.roles?.code)
  if (targetRoleCode === 'owner' && customer.user_id !== user.id) {
    return NextResponse.json({ error: 'cannot reset password of project owner' }, { status: 403 })
  }

  // Меняем пароль через admin API
  const { error: updErr } = await svc.auth.admin.updateUserById(customer.user_id, {
    password: newPassword,
  })
  if (updErr) {
    console.error('reset password admin error:', updErr)
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // Шлём уведомление на email пользователя
  if (customer.email) {
    const { data: project } = await svc.from('projects').select('name').eq('id', projectId).single()
    const schoolName = project?.name ?? 'Studency'

    const subject = `Пароль изменён · ${schoolName}`
    const text = `Здравствуйте${customer.full_name ? ', ' + customer.full_name : ''}!

Администратор школы «${schoolName}» сбросил ваш пароль на платформе Studency.

Войдите с новым паролем по ссылке: https://studency.ru/login

Если вы не запрашивали смену пароля — обратитесь в школу.`

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8F7FF;font-family:-apple-system,sans-serif;color:#1a1a1a;">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,#6A55F8,#8B7BFA);color:white;font-weight:700;font-size:24px;line-height:56px;">S</div>
    </div>
    <div style="background:white;border-radius:16px;padding:32px;border:1px solid #eee;">
      <h1 style="margin:0 0 16px 0;font-size:18px;font-weight:600;">Пароль изменён</h1>
      <p style="margin:0 0 16px 0;color:#555;line-height:1.5;">Здравствуйте${customer.full_name ? ', <strong>' + escapeHtml(customer.full_name) + '</strong>' : ''}!</p>
      <p style="margin:0 0 16px 0;color:#555;line-height:1.5;">Администратор школы «<strong>${escapeHtml(schoolName)}</strong>» сбросил ваш пароль на платформе Studency.</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="https://studency.ru/login" style="display:inline-block;padding:12px 32px;background:#6A55F8;color:white;text-decoration:none;border-radius:10px;font-weight:500;">Войти с новым паролем</a>
      </div>
      <p style="margin:24px 0 0 0;color:#999;font-size:13px;line-height:1.5;">Если вы не запрашивали смену пароля — обратитесь в школу.</p>
    </div>
  </div>
</body></html>`

    await sendEmail({ to: customer.email, subject, text, html, fromName: schoolName, addFooter: false })
  }

  return NextResponse.json({ ok: true })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
