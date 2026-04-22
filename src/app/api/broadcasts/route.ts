import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/broadcasts?project_id=...
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('project_id')
  if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

  const supabase = getSupabase()
  const { data } = await supabase.from('broadcasts')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  return NextResponse.json({ broadcasts: data ?? [] })
}

// POST /api/broadcasts — создание.
// Если переданы scheduled_at в будущем → статус 'scheduled', иначе 'draft'.
export async function POST(request: NextRequest) {
  const body = await request.json()
  const supabase = getSupabase()

  const scheduledAt = body.scheduled_at ? new Date(body.scheduled_at) : null
  const isScheduled = scheduledAt && scheduledAt.getTime() > Date.now()

  const { data, error } = await supabase.from('broadcasts').insert({
    project_id: body.project_id,
    telegram_bot_id: body.telegram_bot_id ?? null,
    name: body.name ?? 'Новая рассылка',
    status: isScheduled ? 'scheduled' : 'draft',
    channel: body.channel ?? 'telegram',
    email_subject: body.email_subject ?? null,
    text: body.text ?? null,
    media_id: body.media_id ?? null,
    media_type: body.media_type ?? null,
    media_url: body.media_url ?? null,
    segment_type: body.segment_type ?? 'all',
    segment_value: body.segment_value ?? null,
    scheduled_at: isScheduled ? scheduledAt!.toISOString() : null,
  }).select().single()

  if (error) {
    console.error('[broadcasts POST] insert failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ broadcast: data })
}

// PATCH /api/broadcasts?id=... — обновление
export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const body = await request.json()
  const supabase = getSupabase()

  const { data, error } = await supabase.from('broadcasts').update(body).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ broadcast: data })
}

// DELETE /api/broadcasts?id=...
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = getSupabase()
  const { error } = await supabase.from('broadcasts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
