import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  uploadVideoToKinescope, createKinescopeFolder,
  applyPlayerSettingsToVideo, PlayerSettings,
} from '@/lib/kinescope'
import { trackUsage } from '@/lib/usage'

export const runtime = 'nodejs'
export const maxDuration = 60

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    const file = form.get('file') as File | null
    const projectId = form.get('project_id') as string | null
    const title = form.get('title') as string | null

    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })
    if (!projectId) return NextResponse.json({ error: 'No project_id' }, { status: 400 })

    const supabase = getSupabase()

    // 1. Загружаем / получаем Kinescope folder id для проекта (lazy)
    const { data: project } = await supabase
      .from('projects')
      .select('id, name, kinescope_folder_id, player_settings')
      .eq('id', projectId)
      .single()

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    let folderId = project.kinescope_folder_id as string | null
    if (!folderId) {
      // Создаём папку лениво при первой загрузке видео
      try {
        const folder = await createKinescopeFolder(`Studency · ${project.name}`)
        folderId = folder.id
        await supabase.from('projects').update({ kinescope_folder_id: folderId }).eq('id', projectId)
      } catch (err) {
        console.error('folder create error (continuing without folder):', err)
        // Продолжаем без папки, видео просто окажется в корне
      }
    }

    // 2. Загружаем видео в папку проекта
    let kinescopeData
    try {
      kinescopeData = await uploadVideoToKinescope(file, file.name, title ?? file.name, folderId ?? undefined)
    } catch (err) {
      console.error('kinescope upload error:', err)
      return NextResponse.json({
        error: err instanceof Error ? err.message : 'Kinescope upload failed',
        hint: 'Проверь что KINESCOPE_API_TOKEN установлен в Vercel env vars',
      }, { status: 500 })
    }

    // 3. Применяем настройки плеера проекта (цвет, лого, водяной знак)
    if (project.player_settings && Object.keys(project.player_settings).length > 0) {
      await applyPlayerSettingsToVideo(kinescopeData.id, project.player_settings as PlayerSettings)
    }

    // 4. Сохраняем в БД
    const { data: video, error } = await supabase.from('videos').insert({
      project_id: projectId,
      title: title ?? file.name,
      kinescope_id: kinescopeData.id,
      kinescope_status: kinescopeData.status ?? 'processing',
      embed_url: kinescopeData.embed_link ?? `https://kinescope.io/embed/${kinescopeData.id}`,
      thumbnail_url: kinescopeData.poster?.url ?? null,
      duration_seconds: kinescopeData.duration ?? null,
      file_size_bytes: file.size,
    }).select().single()

    if (error) {
      console.error('videos insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Track usage
    await trackUsage(supabase, projectId, 'video_upload', 'upload', 1, {
      size_bytes: file.size,
      duration: kinescopeData.duration,
    })
    await trackUsage(supabase, projectId, 'video_storage', 'added', file.size, {
      video_id: video.id,
    })

    return NextResponse.json({ ok: true, video })
  } catch (err) {
    console.error('videos upload route error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown' }, { status: 500 })
  }
}
