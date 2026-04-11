import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createKinescopeFolder } from '@/lib/kinescope'

export const runtime = 'nodejs'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/projects/setup-kinescope
 * Body: { project_id }
 * Creates a Kinescope folder for this project and saves the ID.
 * Idempotent — если папка уже есть, возвращает её.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const projectId = body.project_id
    if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

    const supabase = getSupabase()
    const { data: project } = await supabase
      .from('projects')
      .select('id, name, kinescope_folder_id')
      .eq('id', projectId)
      .single()

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    // Уже есть — ничего не делаем
    if (project.kinescope_folder_id) {
      return NextResponse.json({ ok: true, folder_id: project.kinescope_folder_id, already: true })
    }

    // Создаём папку в Kinescope
    try {
      const folder = await createKinescopeFolder(`Studency · ${project.name}`)
      await supabase.from('projects')
        .update({ kinescope_folder_id: folder.id })
        .eq('id', projectId)
      return NextResponse.json({ ok: true, folder_id: folder.id })
    } catch (err) {
      // Если Kinescope не настроен — тихо пропускаем, видео работать не будут, но ничего не падает
      console.error('kinescope folder create error:', err)
      return NextResponse.json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed',
        hint: 'KINESCOPE_API_TOKEN не установлен — видео будет без папки',
      }, { status: 500 })
    }
  } catch (err) {
    console.error('setup-kinescope error:', err)
    return NextResponse.json({ error: 'Internal' }, { status: 500 })
  }
}
