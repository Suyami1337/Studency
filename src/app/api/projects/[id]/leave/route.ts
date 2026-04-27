// POST /api/projects/[id]/leave
//
// Текущий user покидает проект (удаляет свою запись из project_members).
// Владелец — нельзя (нужно сначала передать владение).

import { NextResponse } from 'next/server'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const svc = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: member } = await svc
    .from('project_members')
    .select('id, roles!inner(code)')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) return NextResponse.json({ error: 'not a member' }, { status: 404 })

  type RoleNode = { code: string }
  const roleCode = Array.isArray((member as unknown as { roles: RoleNode | RoleNode[] }).roles)
    ? ((member as unknown as { roles: RoleNode[] }).roles[0]?.code)
    : ((member as unknown as { roles: RoleNode }).roles?.code)

  if (roleCode === 'owner') {
    return NextResponse.json({ error: 'owner cannot leave — transfer ownership first' }, { status: 400 })
  }

  const { error } = await svc.from('project_members').delete().eq('id', (member as { id: string }).id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
