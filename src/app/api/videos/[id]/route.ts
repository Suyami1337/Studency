import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  deleteKinescopeVideo, getKinescopeStatistics, updateKinescopeVideo,
  getKinescopeVideo,
} from '@/lib/kinescope'
import { createServerSupabase } from '@/lib/supabase-server'
import { ensureProjectAccess } from '@/lib/api-auth'

export const runtime = 'nodejs'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function checkVideoAccess(videoId: string) {
  const supabase = getSupabase()
  const { data: v } = await supabase.from('videos').select('id, project_id').eq('id', videoId).maybeSingle()
  if (!v) return { ok: false as const, status: 404, error: 'Not found' }
  const auth = await createServerSupabase()
  const access = await ensureProjectAccess(auth, v.project_id)
  if (!access.ok) return access
  return { ok: true as const, video: v }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await checkVideoAccess(id)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const supabase = getSupabase()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let { data: video } = await supabase.from('videos').select('*').eq('id', id).single() as any
  if (!video) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Если видео ещё processing — синхронизируем статус из Kinescope
  const isDone = video.kinescope_status === 'done' || video.kinescope_status === 'ready'
  if (video.kinescope_id && !isDone) {
    try {
      const fresh = await getKinescopeVideo(video.kinescope_id)
      const newStatus = fresh.status ?? video.kinescope_status
      const newEmbed = fresh.embed_link ?? `https://kinescope.io/embed/${video.kinescope_id}`
      const newThumb = fresh.poster?.url ?? null
      const newDuration = fresh.duration ?? null

      const needsUpdate =
        newStatus !== video.kinescope_status ||
        newEmbed !== video.embed_url ||
        newThumb !== video.thumbnail_url ||
        newDuration !== video.duration_seconds

      if (needsUpdate) {
        const { data: updated } = await supabase
          .from('videos')
          .update({
            kinescope_status: newStatus,
            embed_url: newEmbed,
            thumbnail_url: newThumb,
            duration_seconds: newDuration,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .single()
        if (updated) video = updated
      }
    } catch (err) {
      console.error('kinescope sync error:', err)
    }
  }

  // Подгружаем свежую статистику из Kinescope
  let stats = null
  if (video.kinescope_id) {
    try {
      stats = await getKinescopeStatistics(video.kinescope_id)
    } catch (err) {
      console.error('stats error:', err)
    }
  }

  return NextResponse.json({ video, stats })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await checkVideoAccess(id)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const body = await request.json()
  const supabase = getSupabase()

  const { data: video } = await supabase.from('videos').select('*').eq('id', id).single()
  if (!video) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Обновляем в Kinescope если есть kinescope_id
  if (video.kinescope_id && (body.title || body.description)) {
    try {
      await updateKinescopeVideo(video.kinescope_id, {
        title: body.title,
        description: body.description,
      })
    } catch (err) {
      console.error('kinescope update error:', err)
    }
  }

  const { data, error } = await supabase.from('videos').update({
    title: body.title ?? video.title,
    description: body.description ?? video.description,
    updated_at: new Date().toISOString(),
  }).eq('id', id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, video: data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await checkVideoAccess(id)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const supabase = getSupabase()

  const { data: video } = await supabase.from('videos').select('*').eq('id', id).single()
  if (!video) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Удаляем из Kinescope
  if (video.kinescope_id) {
    try {
      await deleteKinescopeVideo(video.kinescope_id)
    } catch (err) {
      console.error('kinescope delete error:', err)
    }
  }

  await supabase.from('videos').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
