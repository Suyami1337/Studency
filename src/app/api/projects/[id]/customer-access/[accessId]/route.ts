// DELETE /api/projects/[id]/customer-access/[accessId]
//
// Отзывает выданный доступ. Не удаляет физически (мягкая деактивация status='revoked')
// для сохранения истории. Ученик после revoke сразу теряет доступ через RLS на курсы.

import { NextResponse } from 'next/server'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { hasPermission, PERMISSIONS } from '@/lib/permissions'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; accessId: string }> },
) {
  const { id: projectId, accessId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const allowed = await hasPermission(supabase, projectId, user.id, PERMISSIONS.LEARNING_ACCESS_REVOKE)
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const svc = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: access } = await svc
    .from('customer_access').select('id, project_id').eq('id', accessId).maybeSingle()
  if (!access || access.project_id !== projectId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const { error } = await svc.from('customer_access').update({
    status: 'revoked',
    revoked_at: new Date().toISOString(),
    revoked_by: user.id,
  }).eq('id', accessId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
