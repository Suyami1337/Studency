// PATCH /api/projects/[id]/roles/[roleId] — обновить label / description / permissions
// DELETE /api/projects/[id]/roles/[roleId] — удалить кастомную роль
//
// Системные роли (is_system=TRUE) — нельзя удалить, label не меняется,
// но permissions можно менять. owner-роль — особо защищена: её permissions
// нельзя урезать (всегда полный набор).

import { NextResponse } from 'next/server'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { hasPermission, PERMISSIONS } from '@/lib/permissions'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; roleId: string }> },
) {
  const { id: projectId, roleId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const allowed = await hasPermission(supabase, projectId, user.id, PERMISSIONS.TEAM_ROLES_EDIT)
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let body: { label?: string; description?: string; permissions?: string[]; sort_order?: number }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const svc = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: role } = await svc
    .from('roles')
    .select('id, code, project_id, is_system')
    .eq('id', roleId)
    .maybeSingle()
  if (!role || role.project_id !== projectId) {
    return NextResponse.json({ error: 'role not found' }, { status: 404 })
  }

  // Owner — нельзя менять label, permissions защищены (всегда полный набор)
  if (role.code === 'owner') {
    if (body.permissions !== undefined) {
      return NextResponse.json({ error: 'owner permissions cannot be modified' }, { status: 400 })
    }
    if (body.label !== undefined) {
      return NextResponse.json({ error: 'owner label cannot be modified' }, { status: 400 })
    }
  }

  // Системные роли — label/description не меняем (только permissions)
  const update: Record<string, unknown> = {}
  if (body.label !== undefined && !role.is_system) {
    if (!body.label.trim()) return NextResponse.json({ error: 'label cannot be empty' }, { status: 400 })
    update.label = body.label.trim()
  }
  if (body.description !== undefined && !role.is_system) {
    update.description = body.description
  }
  // sort_order — разрешено для любых ролей (включая системные); это просто
  // отображение в UI, безопасности не касается.
  if (body.sort_order !== undefined && Number.isFinite(body.sort_order)) {
    update.sort_order = body.sort_order
  }
  if (Object.keys(update).length > 0) {
    const { error: updErr } = await svc.from('roles').update(update).eq('id', roleId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // Permissions — diff и применить
  if (body.permissions !== undefined) {
    if (!Array.isArray(body.permissions)) {
      return NextResponse.json({ error: 'permissions must be array' }, { status: 400 })
    }
    // Валидация: все коды существуют в каталоге
    const { data: validPerms } = await svc.from('permissions').select('code').in('code', body.permissions)
    const validCodes = new Set((validPerms ?? []).map(p => p.code))
    const codes = body.permissions.filter(c => validCodes.has(c))

    // Удаляем все текущие, вставляем новые. Простая стратегия — для роли с N≤100
    // permissions нормально, мы редко меняем.
    await svc.from('role_permissions').delete().eq('role_id', roleId)
    if (codes.length > 0) {
      const rows = codes.map(c => ({ role_id: roleId, permission_code: c }))
      const { error: insErr } = await svc.from('role_permissions').insert(rows)
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; roleId: string }> },
) {
  const { id: projectId, roleId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const allowed = await hasPermission(supabase, projectId, user.id, PERMISSIONS.TEAM_ROLES_DELETE)
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const svc = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: role } = await svc
    .from('roles')
    .select('id, project_id, is_system')
    .eq('id', roleId)
    .maybeSingle()
  if (!role || role.project_id !== projectId) {
    return NextResponse.json({ error: 'role not found' }, { status: 404 })
  }
  if (role.is_system) {
    return NextResponse.json({ error: 'system roles cannot be deleted' }, { status: 400 })
  }

  // Если есть members — нельзя удалить (RLS RESTRICT). Проверяем явно для friendly message.
  const { count } = await svc
    .from('project_members')
    .select('id', { count: 'exact', head: true })
    .eq('role_id', roleId)
  if ((count ?? 0) > 0) {
    return NextResponse.json({
      error: 'role has members — reassign them first',
      members_count: count,
    }, { status: 400 })
  }

  const { error } = await svc.from('roles').delete().eq('id', roleId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
