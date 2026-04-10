import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { uploadVideoToKinescope } from '@/lib/kinescope'

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

    // Отправляем в Kinescope
    let kinescopeData
    try {
      kinescopeData = await uploadVideoToKinescope(file, file.name, title ?? file.name)
    } catch (err) {
      console.error('kinescope upload error:', err)
      // Если Kinescope недоступен — сохраняем запись с ошибкой
      return NextResponse.json({
        error: err instanceof Error ? err.message : 'Kinescope upload failed',
        hint: 'Проверь что KINESCOPE_API_TOKEN установлен в Vercel env vars',
      }, { status: 500 })
    }

    // Сохраняем в БД
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

    return NextResponse.json({ ok: true, video })
  } catch (err) {
    console.error('videos upload route error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown' }, { status: 500 })
  }
}
