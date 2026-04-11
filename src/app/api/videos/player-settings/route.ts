import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { applyPlayerSettingsToVideo, PlayerSettings } from '@/lib/kinescope'

export const runtime = 'nodejs'
export const maxDuration = 60

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/videos/player-settings?project_id=...
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('project_id')
  if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

  const supabase = getSupabase()
  const { data } = await supabase
    .from('projects')
    .select('player_settings')
    .eq('id', projectId)
    .single()

  return NextResponse.json({ settings: data?.player_settings ?? {} })
}

// POST /api/videos/player-settings
// Body: { project_id, settings: PlayerSettings }
// Сохраняет настройки + применяет их ко всем существующим видео проекта.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { project_id, settings } = body
    if (!project_id || !settings) {
      return NextResponse.json({ error: 'project_id and settings required' }, { status: 400 })
    }

    const supabase = getSupabase()

    // 1. Сохраняем в проект
    await supabase.from('projects')
      .update({ player_settings: settings })
      .eq('id', project_id)

    // 2. Применяем ко всем видео проекта (фоном, не блокируем ответ)
    const { data: videos } = await supabase
      .from('videos')
      .select('kinescope_id')
      .eq('project_id', project_id)
      .not('kinescope_id', 'is', null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const videoIds = ((videos ?? []) as any[]).map(v => v.kinescope_id).filter(Boolean) as string[]

    // Асинхронно применяем ко всем видео
    Promise.allSettled(
      videoIds.map(vid => applyPlayerSettingsToVideo(vid, settings as PlayerSettings))
    ).catch(err => console.error('batch apply error:', err))

    return NextResponse.json({ ok: true, applied_to: videoIds.length })
  } catch (err) {
    console.error('player-settings POST error:', err)
    return NextResponse.json({ error: 'Internal' }, { status: 500 })
  }
}
