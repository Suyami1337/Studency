// DELETE /api/projects/[id]/invitations/[invId]
//
// Отозвать pending-приглашение. Помечает used_at чтобы ссылка перестала работать.

import { NextResponse } from 'next/server'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { hasPermission, PERMISSIONS } from '@/lib/permissions'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; invId: string }> },
) {
  const { id: projectId, invId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const allowed = await hasPermission(supabase, projectId, user.id, PERMISSIONS.TEAM_MEMBERS_INVITE)
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const svc = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Проверяем что приглашение принадлежит этому проекту
  const { data: inv } = await svc
    .from('invitations')
    .select('id, project_id')
    .eq('id', invId)
    .maybeSingle()
  if (!inv || inv.project_id !== projectId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  // Помечаем used_at вместо delete — для аудита
  await svc
    .from('invitations')
    .update({ used_at: new Date().toISOString() })
    .eq('id', invId)

  return NextResponse.json({ ok: true })
}
