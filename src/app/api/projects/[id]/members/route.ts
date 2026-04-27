// GET /api/projects/[id]/members
//
// Возвращает список членов проекта (всех с любым статусом) + информацию о
// связанных user-ах: email, full_name. Также подгружаем роли.
// Только участники с team.members.view могут читать.

import { NextResponse } from 'next/server'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { hasPermission, PERMISSIONS } from '@/lib/permissions'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const allowed = await hasPermission(supabase, projectId, user.id, PERMISSIONS.TEAM_MEMBERS_VIEW)
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // service для admin.listUsers (получить email)
  const svc = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: members } = await svc
    .from('project_members')
    .select('id, user_id, status, joined_at, role_id, roles!inner(code, label, access_type, is_system)')
    .eq('project_id', projectId)
    .order('joined_at', { ascending: true })

  if (!members) return NextResponse.json({ members: [] })

  // Подгружаем emails + meta для всех user_id
  const userIds = members.map(m => m.user_id)
  const { data: usersList } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 })
  const emailById = new Map<string, string>()
  ;(usersList?.users ?? []).forEach(u => { if (u.id && u.email) emailById.set(u.id, u.email) })

  const { data: metas } = await svc
    .from('users_meta')
    .select('user_id, full_name, avatar_url')
    .in('user_id', userIds)
  const metaById = new Map<string, { full_name: string | null; avatar_url: string | null }>()
  ;(metas ?? []).forEach(m => metaById.set(m.user_id, { full_name: m.full_name, avatar_url: m.avatar_url }))

  type RoleNode = { code: string; label: string; access_type: string; is_system: boolean }
  type Row = {
    id: string
    user_id: string
    status: string
    joined_at: string
    role_id: string
    roles: RoleNode | RoleNode[]
  }

  const result = (members as unknown as Row[]).map(m => {
    const role = Array.isArray(m.roles) ? m.roles[0] : m.roles
    const meta = metaById.get(m.user_id)
    return {
      id: m.id,
      user_id: m.user_id,
      email: emailById.get(m.user_id) ?? null,
      full_name: meta?.full_name ?? null,
      avatar_url: meta?.avatar_url ?? null,
      status: m.status,
      joined_at: m.joined_at,
      role_id: m.role_id,
      role_code: role?.code ?? '',
      role_label: role?.label ?? '',
      access_type: role?.access_type ?? '',
      role_is_system: role?.is_system ?? false,
      is_self: m.user_id === user.id,
    }
  })

  return NextResponse.json({ members: result })
}
