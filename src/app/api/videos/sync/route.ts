import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getKinescopeVideo } from '@/lib/kinescope'

export const runtime = 'nodejs'
export const maxDuration = 30

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/videos/sync
 * Body: { project_id }
 * Синхронизирует статусы всех видео проекта которые ещё не 'done'/'ready'.
 * Вызывается клиентским кодом когда пользователь открывает страницу видеохостинга.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const projectId = body.project_id
    if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

    const supabase = getSupabase()

    // Берём только видео проекта, у которых статус ещё не финальный
    const { data: videos } = await supabase
      .from('videos')
      .select('id, kinescope_id, kinescope_status, embed_url, thumbnail_url, duration_seconds')
      .eq('project_id', projectId)
      .not('kinescope_status', 'in', '(done,ready)')
      .not('kinescope_id', 'is', null)
      .limit(20)

    if (!videos || videos.length === 0) {
      return NextResponse.json({ ok: true, synced: 0 })
    }

    let synced = 0
    for (const v of videos) {
      try {
        const fresh = await getKinescopeVideo(v.kinescope_id as string)
        const updates: Record<string, unknown> = {}
        if (fresh.status && fresh.status !== v.kinescope_status) {
          updates.kinescope_status = fresh.status
        }
        if (fresh.embed_link && fresh.embed_link !== v.embed_url) {
          updates.embed_url = fresh.embed_link
        }
        if (fresh.poster?.url && fresh.poster.url !== v.thumbnail_url) {
          updates.thumbnail_url = fresh.poster.url
        }
        if (fresh.duration && fresh.duration !== v.duration_seconds) {
          updates.duration_seconds = fresh.duration
        }
        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date().toISOString()
          await supabase.from('videos').update(updates).eq('id', v.id)
          synced++
        }
      } catch (err) {
        console.error('sync video error:', v.id, err)
      }
    }

    return NextResponse.json({ ok: true, synced, total: videos.length })
  } catch (err) {
    console.error('sync route error:', err)
    return NextResponse.json({ error: 'Internal' }, { status: 500 })
  }
}
