import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/videos/track
// Body: { video_id, customer_id?, session_id, watch_time_seconds, max_position_seconds, completed }
// Используется клиентским JS плеера для репортинга прогресса
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      video_id, customer_id, session_id,
      watch_time_seconds = 0, max_position_seconds = 0, completed = false,
    } = body

    if (!video_id || !session_id) {
      return NextResponse.json({ error: 'video_id and session_id required' }, { status: 400 })
    }

    const supabase = getSupabase()

    const { data: video } = await supabase.from('videos').select('project_id').eq('id', video_id).single()
    if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 })

    // Upsert по session_id + video_id
    const { data: existing } = await supabase.from('video_views')
      .select('id, watch_time_seconds, max_position_seconds, completed')
      .eq('video_id', video_id)
      .eq('session_id', session_id)
      .maybeSingle()

    if (existing) {
      await supabase.from('video_views').update({
        watch_time_seconds: Math.max(existing.watch_time_seconds ?? 0, watch_time_seconds),
        max_position_seconds: Math.max(existing.max_position_seconds ?? 0, max_position_seconds),
        completed: existing.completed || completed,
        last_seen_at: new Date().toISOString(),
        customer_id: customer_id ?? undefined,
      }).eq('id', existing.id)
    } else {
      await supabase.from('video_views').insert({
        video_id,
        project_id: video.project_id,
        customer_id: customer_id ?? null,
        session_id,
        watch_time_seconds,
        max_position_seconds,
        completed,
        user_agent: request.headers.get('user-agent') ?? null,
        referrer: request.headers.get('referer') ?? null,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('track error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
