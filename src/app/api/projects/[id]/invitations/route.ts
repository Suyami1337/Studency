// GET /api/projects/[id]/invitations
//
// Список pending (не used, не expired) приглашений проекта.

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

  const svc = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data } = await svc
    .from('invitations')
    .select('id, email, expires_at, used_at, created_at, role_id, roles!inner(code, label)')
    .eq('project_id', projectId)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  type RoleNode = { code: string; label: string }
  type Row = {
    id: string
    email: string
    expires_at: string
    used_at: string | null
    created_at: string
    role_id: string
    roles: RoleNode | RoleNode[]
  }

  const invites = ((data ?? []) as unknown as Row[]).map(inv => {
    const role = Array.isArray(inv.roles) ? inv.roles[0] : inv.roles
    return {
      id: inv.id,
      email: inv.email,
      expires_at: inv.expires_at,
      created_at: inv.created_at,
      role_id: inv.role_id,
      role_code: role?.code ?? '',
      role_label: role?.label ?? '',
    }
  })

  return NextResponse.json({ invitations: invites })
}
