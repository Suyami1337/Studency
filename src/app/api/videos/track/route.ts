import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/videos/track
 * Body: {
 *   video_id         — UUID видео в Studency
 *   session_id       — уникальный ID просмотра в рамках одной вкладки
 *   visitor_token?   — токен из cookie (для привязки анонимных просмотров к customer)
 *   customer_id?     — явная привязка (если уже известен)
 *   watch_time_seconds, max_position_seconds, completed
 *   event?           — 'start' | 'progress' | 'complete' — для дублирования в events API
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      video_id, session_id,
      visitor_token,
      customer_id: explicitCustomerId,
      watch_time_seconds = 0, max_position_seconds = 0, completed = false,
      event,
    } = body

    if (!video_id || !session_id) {
      return NextResponse.json({ error: 'video_id and session_id required' }, { status: 400 })
    }

    const supabase = getSupabase()

    const { data: video } = await supabase
      .from('videos')
      .select('project_id, title')
      .eq('id', video_id)
      .single()
    if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 })

    // 1. Определяем customer_id
    // Приоритет: explicit > lookup по visitor_token > null (анонимный просмотр)
    let customerId: string | null = explicitCustomerId ?? null
    if (!customerId && visitor_token) {
      const { data: c } = await supabase
        .from('customers')
        .select('id')
        .eq('visitor_token', visitor_token)
        .eq('project_id', video.project_id)
        .maybeSingle()
      if (c) customerId = c.id as string
    }

    // 2. Upsert по session_id + video_id
    const { data: existing } = await supabase.from('video_views')
      .select('id, watch_time_seconds, max_position_seconds, completed')
      .eq('video_id', video_id)
      .eq('session_id', session_id)
      .maybeSingle()

    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: any = {
        watch_time_seconds: Math.max(existing.watch_time_seconds ?? 0, watch_time_seconds),
        max_position_seconds: Math.max(existing.max_position_seconds ?? 0, max_position_seconds),
        completed: existing.completed || completed,
        last_seen_at: new Date().toISOString(),
      }
      // Обновляем customer_id только если появился (не затираем)
      if (customerId) updates.customer_id = customerId
      await supabase.from('video_views').update(updates).eq('id', existing.id)
    } else {
      await supabase.from('video_views').insert({
        video_id,
        project_id: video.project_id,
        customer_id: customerId,
        session_id,
        watch_time_seconds,
        max_position_seconds,
        completed,
        user_agent: request.headers.get('user-agent') ?? null,
        referrer: request.headers.get('referer') ?? null,
      })
    }

    // 3. Если указан event — дублируем в таблицу events (для триггеров ботов)
    if (event && (event === 'start' || event === 'progress' || event === 'complete')) {
      const eventType = `video_${event}`
      await supabase.from('events').insert({
        project_id: video.project_id,
        customer_id: customerId,
        event_type: eventType,
        event_name: video.title,
        source: 'video_player',
        source_id: video_id,
        session_id,
        metadata: {
          watch_time_seconds,
          max_position_seconds,
          completed,
        },
      })
    }

    return NextResponse.json({ ok: true, customer_id: customerId })
  } catch (err) {
    console.error('track error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
