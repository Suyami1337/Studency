// PATCH /api/projects/[id]/members/[memberId] { role_id?, status? }
// DELETE /api/projects/[id]/members/[memberId]
//
// PATCH — менять роль или статус (active/disabled).
// DELETE — удалить из проекта (мягкая защита: владельца удалить нельзя).

import { NextResponse } from 'next/server'
import { createClient as createSbClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { hasPermission, PERMISSIONS } from '@/lib/permissions'

async function getMemberRoleCode(svc: SupabaseClient, projectId: string, userId: string): Promise<string | null> {
  const { data } = await svc
    .from('project_members')
    .select('roles!inner(code)')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  type Row = { roles: { code: string } | { code: string }[] }
  const r = (data as unknown as Row | null)?.roles
  if (!r) return null
  return Array.isArray(r) ? r[0]?.code ?? null : r.code
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const { id: projectId, memberId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const allowed = await hasPermission(supabase, projectId, user.id, PERMISSIONS.TEAM_MEMBERS_EDIT)
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let body: { role_id?: string; status?: 'active' | 'disabled' }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const svc = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Фетч target member
  const { data: target } = await svc
    .from('project_members')
    .select('id, project_id, user_id, role_id, roles!inner(code)')
    .eq('id', memberId)
    .maybeSingle()
  if (!target || target.project_id !== projectId) {
    return NextResponse.json({ error: 'member not found' }, { status: 404 })
  }

  type RoleNode = { code: string }
  const targetRole = Array.isArray((target as unknown as { roles: RoleNode | RoleNode[] }).roles)
    ? ((target as unknown as { roles: RoleNode[] }).roles[0]?.code)
    : ((target as unknown as { roles: RoleNode }).roles?.code)

  // Защита: владельца нельзя редактировать (только через transfer-ownership)
  if (targetRole === 'owner') {
    return NextResponse.json({ error: 'cannot edit owner directly — use transfer ownership' }, { status: 400 })
  }

  // Защита: только Владелец может назначать Главных админов
  if (body.role_id) {
    const { data: newRole } = await svc.from('roles').select('code, project_id').eq('id', body.role_id).maybeSingle()
    if (!newRole || newRole.project_id !== projectId) {
      return NextResponse.json({ error: 'role does not belong to project' }, { status: 400 })
    }
    if (newRole.code === 'owner') {
      return NextResponse.json({ error: 'use transfer-ownership to assign owner role' }, { status: 400 })
    }
    if (newRole.code === 'super_admin') {
      const myRole = await getMemberRoleCode(svc, projectId, user.id)
      if (myRole !== 'owner') {
        return NextResponse.json({ error: 'only owner can assign super_admin' }, { status: 403 })
      }
    }
  }

  const update: Record<string, unknown> = {}
  if (body.role_id) update.role_id = body.role_id
  if (body.status) update.status = body.status

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const { error } = await svc.from('project_members').update(update).eq('id', memberId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const { id: projectId, memberId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const allowed = await hasPermission(supabase, projectId, user.id, PERMISSIONS.TEAM_MEMBERS_REMOVE)
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const svc = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: target } = await svc
    .from('project_members')
    .select('user_id, project_id, roles!inner(code)')
    .eq('id', memberId)
    .maybeSingle()
  if (!target || target.project_id !== projectId) {
    return NextResponse.json({ error: 'member not found' }, { status: 404 })
  }

  type RoleNode = { code: string }
  const targetRole = Array.isArray((target as unknown as { roles: RoleNode | RoleNode[] }).roles)
    ? ((target as unknown as { roles: RoleNode[] }).roles[0]?.code)
    : ((target as unknown as { roles: RoleNode }).roles?.code)

  if (targetRole === 'owner') {
    return NextResponse.json({ error: 'cannot remove owner — use transfer ownership first' }, { status: 400 })
  }

  if (targetRole === 'super_admin') {
    const myRole = await getMemberRoleCode(svc, projectId, user.id)
    if (myRole !== 'owner') {
      return NextResponse.json({ error: 'only owner can remove super_admin' }, { status: 403 })
    }
  }

  const { error } = await svc.from('project_members').delete().eq('id', memberId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
