// GET /api/projects/[id]/roles
//
// Список ролей проекта (системные + кастомные) с их permissions.
// Используется для UI: dropdown «выбрать роль» и конструктор ролей.

import { NextResponse } from 'next/server'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { hasPermission, PERMISSIONS } from '@/lib/permissions'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const allowed = await hasPermission(supabase, projectId, user.id, PERMISSIONS.TEAM_ROLES_CREATE)
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let body: { label?: string; description?: string; access_type?: 'admin_panel' | 'student_panel' | 'no_access'; permissions?: string[]; based_on?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const label = body.label?.trim()
  if (!label) return NextResponse.json({ error: 'label required' }, { status: 400 })
  const accessType = body.access_type ?? 'admin_panel'

  const svc = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Генерим code на основе label
  const baseCode = label.toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 30) || 'custom_role'
  let code = baseCode
  let suffix = 1
  while (true) {
    const { data: existing } = await svc.from('roles').select('id').eq('project_id', projectId).eq('code', code).maybeSingle()
    if (!existing) break
    suffix += 1
    code = `${baseCode}_${suffix}`
  }

  // Permissions: если based_on указан — копируем оттуда; иначе из body или пустой массив
  let perms: string[] = body.permissions ?? []
  if (body.based_on && perms.length === 0) {
    const { data: basedRole } = await svc
      .from('roles').select('id, project_id').eq('id', body.based_on).maybeSingle()
    if (basedRole?.project_id === projectId) {
      const { data: rps } = await svc.from('role_permissions').select('permission_code').eq('role_id', basedRole.id)
      perms = (rps ?? []).map(r => r.permission_code)
    }
  }

  const { data: newRole, error: insErr } = await svc
    .from('roles')
    .insert({
      project_id: projectId,
      code,
      label,
      description: body.description ?? null,
      is_system: false,
      access_type: accessType,
      sort_order: 1000,
    })
    .select('id')
    .single()
  if (insErr || !newRole) {
    return NextResponse.json({ error: insErr?.message ?? 'failed' }, { status: 500 })
  }

  if (perms.length > 0) {
    const { data: validPerms } = await svc.from('permissions').select('code').in('code', perms)
    const validCodes = new Set((validPerms ?? []).map(p => p.code))
    const rows = perms.filter(c => validCodes.has(c)).map(c => ({ role_id: newRole.id, permission_code: c }))
    if (rows.length > 0) {
      await svc.from('role_permissions').insert(rows)
    }
  }

  return NextResponse.json({ ok: true, role_id: newRole.id, code, label })
}

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

  const { data: roles } = await supabase
    .from('roles')
    .select('id, code, label, description, is_system, access_type, sort_order')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })

  // Membership counts: сколько member-ов у каждой роли
  const { data: countRows } = await supabase
    .from('project_members')
    .select('role_id')
    .eq('project_id', projectId)
    .eq('status', 'active')
  const counts = new Map<string, number>()
  ;(countRows ?? []).forEach(r => counts.set(r.role_id, (counts.get(r.role_id) ?? 0) + 1))

  // Permissions для каждой роли (одной выборкой)
  const roleIds = (roles ?? []).map(r => r.id)
  const { data: rps } = await supabase
    .from('role_permissions')
    .select('role_id, permission_code')
    .in('role_id', roleIds)
  const permsByRole = new Map<string, string[]>()
  ;(rps ?? []).forEach(rp => {
    const arr = permsByRole.get(rp.role_id) ?? []
    arr.push(rp.permission_code)
    permsByRole.set(rp.role_id, arr)
  })

  const result = (roles ?? []).map(r => ({
    ...r,
    permissions: permsByRole.get(r.id) ?? [],
    members_count: counts.get(r.id) ?? 0,
  }))

  return NextResponse.json({ roles: result })
}
