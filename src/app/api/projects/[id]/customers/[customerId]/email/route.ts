// PATCH /api/projects/[id]/customers/[customerId]/email
//
// Меняет email customer-а. Если у customer есть user_id (зарегистрирован
// в платформе) — также обновляет auth.users.email через admin API и
// отправляет уведомление на НОВЫЙ адрес «email успешно изменён».
//
// Body: { new_email }

import { NextResponse } from 'next/server'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { hasPermission, PERMISSIONS } from '@/lib/permissions'
import { sendEmail } from '@/lib/email'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; customerId: string }> },
) {
  const { id: projectId, customerId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const allowed = await hasPermission(supabase, projectId, user.id, PERMISSIONS.CRM_CUSTOMERS_EDIT)
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let body: { new_email?: string | null }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const newEmail = body.new_email?.trim().toLowerCase() || null
  if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return NextResponse.json({ error: 'invalid email format' }, { status: 400 })
  }

  const svc = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: customer } = await svc
    .from('customers')
    .select('id, project_id, user_id, email, full_name')
    .eq('id', customerId)
    .maybeSingle()
  if (!customer || customer.project_id !== projectId) {
    return NextResponse.json({ error: 'customer not found' }, { status: 404 })
  }

  const oldEmail = customer.email

  // Если у customer есть user_id — синхронизируем auth.users
  if (customer.user_id && newEmail) {
    const { error: authErr } = await svc.auth.admin.updateUserById(customer.user_id, {
      email: newEmail,
      email_confirm: true,
    })
    if (authErr) {
      console.error('change email auth error:', authErr)
      return NextResponse.json({ error: authErr.message }, { status: 500 })
    }
  }

  // Обновляем customer.email
  const { data: updated, error } = await svc
    .from('customers')
    .update({ email: newEmail })
    .eq('id', customerId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Уведомление на НОВЫЙ email — только если customer зарегистрирован в платформе
  // и email действительно изменился
  if (customer.user_id && newEmail && newEmail !== oldEmail) {
    const { data: project } = await svc.from('projects').select('name').eq('id', projectId).single()
    const schoolName = project?.name ?? 'Studency'

    const subject = `Email изменён · ${schoolName}`
    const text = `Здравствуйте${customer.full_name ? ', ' + customer.full_name : ''}!

Ваш email на платформе Studency изменён на ${newEmail}.

Теперь вы входите в школу «${schoolName}» по этому адресу.

Если вы не запрашивали смену email — срочно обратитесь в школу.`

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8F7FF;font-family:-apple-system,sans-serif;color:#1a1a1a;">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,#6A55F8,#8B7BFA);color:white;font-weight:700;font-size:24px;line-height:56px;">S</div>
    </div>
    <div style="background:white;border-radius:16px;padding:32px;border:1px solid #eee;">
      <h1 style="margin:0 0 16px 0;font-size:18px;font-weight:600;">Email изменён</h1>
      <p style="margin:0 0 16px 0;color:#555;line-height:1.5;">Здравствуйте${customer.full_name ? ', <strong>' + escapeHtml(customer.full_name) + '</strong>' : ''}!</p>
      <p style="margin:0 0 16px 0;color:#555;line-height:1.5;">Ваш email на платформе Studency изменён на <strong>${escapeHtml(newEmail)}</strong>.</p>
      <p style="margin:0 0 16px 0;color:#555;line-height:1.5;">Теперь вы входите в школу «<strong>${escapeHtml(schoolName)}</strong>» по этому адресу.</p>
      <p style="margin:24px 0 0 0;color:#B91C1C;font-size:13px;line-height:1.5;">⚠ Если вы не запрашивали смену email — срочно обратитесь в школу.</p>
    </div>
  </div>
</body></html>`

    await sendEmail({ to: newEmail, subject, text, html, fromName: schoolName, addFooter: false })
  }

  return NextResponse.json({ ok: true, customer: updated })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
