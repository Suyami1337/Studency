// POST /api/projects/[id]/roles/[roleId]/reset
//
// Сбрасывает permissions системной роли к дефолтным значениям из шаблона
// (project_id IS NULL, тот же code). Только для системных ролей.

import { NextResponse } from 'next/server'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { hasPermission, PERMISSIONS } from '@/lib/permissions'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; roleId: string }> },
) {
  const { id: projectId, roleId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const allowed = await hasPermission(supabase, projectId, user.id, PERMISSIONS.TEAM_ROLES_EDIT)
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const svc = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Берём роль проекта
  const { data: role } = await svc
    .from('roles')
    .select('id, code, project_id, is_system')
    .eq('id', roleId)
    .maybeSingle()
  if (!role || role.project_id !== projectId) return NextResponse.json({ error: 'role not found' }, { status: 404 })
  if (!role.is_system) return NextResponse.json({ error: 'only system roles can be reset' }, { status: 400 })

  // Берём permissions шаблона (project_id IS NULL, тот же code)
  const { data: template } = await svc
    .from('roles')
    .select('id')
    .is('project_id', null)
    .eq('code', role.code)
    .maybeSingle()
  if (!template) return NextResponse.json({ error: 'template not found' }, { status: 500 })

  const { data: templatePerms } = await svc
    .from('role_permissions')
    .select('permission_code')
    .eq('role_id', template.id)

  // Удаляем текущие permissions роли, вставляем из шаблона
  await svc.from('role_permissions').delete().eq('role_id', roleId)
  if (templatePerms && templatePerms.length > 0) {
    const rows = templatePerms.map(rp => ({ role_id: roleId, permission_code: rp.permission_code }))
    await svc.from('role_permissions').insert(rows)
  }

  return NextResponse.json({ ok: true, restored_count: templatePerms?.length ?? 0 })
}
