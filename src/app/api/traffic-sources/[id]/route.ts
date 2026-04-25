import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { ensureProjectAccess } from '@/lib/api-auth'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function checkSourceAccess(id: string) {
  const svc = getSupabase()
  const { data: src } = await svc.from('traffic_sources').select('project_id').eq('id', id).maybeSingle()
  if (!src) return { ok: false as const, status: 404, error: 'not found' }
  const auth = await createServerSupabase()
  const access = await ensureProjectAccess(auth, src.project_id)
  if (!access.ok) return access
  return { ok: true as const }
}

// DELETE /api/traffic-sources/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await checkSourceAccess(id)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const supabase = getSupabase()
  const { error } = await supabase
    .from('traffic_sources')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH /api/traffic-sources/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await checkSourceAccess(id)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const body = await request.json()
  const supabase = getSupabase()

  const updates: Record<string, string> = {}
  if (body.name) updates.name = body.name
  if (body.destinationUrl) updates.destination_url = body.destinationUrl
  if (body.description !== undefined) updates.description = body.description

  const { data, error } = await supabase
    .from('traffic_sources')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
