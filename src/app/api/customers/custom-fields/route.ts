import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { ensureProjectAccess } from '@/lib/api-auth'

export const runtime = 'nodejs'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/customers/custom-fields?project_id=...
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('project_id')
  if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

  const authClient = await createServerSupabase()
  const access = await ensureProjectAccess(authClient, projectId)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const svc = getServiceClient()
  const { data } = await svc.from('customer_custom_fields')
    .select('*').eq('project_id', projectId).order('order_index')

  return NextResponse.json({ fields: data ?? [] })
}

// POST /api/customers/custom-fields
// Body: { project_id, field_key, field_label, field_type, field_options? }
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { project_id, field_key, field_label, field_type, field_options } = body

  if (!project_id || !field_key || !field_label) {
    return NextResponse.json({ error: 'missing required fields' }, { status: 400 })
  }

  const authClient = await createServerSupabase()
  const access = await ensureProjectAccess(authClient, project_id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const svc = getServiceClient()
  const { data, error } = await svc.from('customer_custom_fields').insert({
    project_id, field_key, field_label,
    field_type: field_type ?? 'text',
    field_options: field_options ?? null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ field: data })
}

// DELETE /api/customers/custom-fields?id=...
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const authClient = await createServerSupabase()
  const svc = getServiceClient()
  // Сначала находим project_id поля
  const { data: field } = await svc.from('customer_custom_fields').select('project_id').eq('id', id).maybeSingle()
  if (!field) return NextResponse.json({ error: 'field not found' }, { status: 404 })
  const access = await ensureProjectAccess(authClient, field.project_id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const { error } = await svc.from('customer_custom_fields').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
