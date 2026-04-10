import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/traffic-sources?projectId=...
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('traffic_sources')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/traffic-sources
export async function POST(request: NextRequest) {
  try {
    const { projectId, name, slug, destinationUrl, description } = await request.json()

    if (!projectId || !name || !slug || !destinationUrl) {
      return NextResponse.json({ error: 'projectId, name, slug, destinationUrl обязательны' }, { status: 400 })
    }

    // Slug: только латиница, цифры, дефис
    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('traffic_sources')
      .insert({
        project_id: projectId,
        name,
        slug: cleanSlug,
        destination_url: destinationUrl,
        description: description || null,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Ссылка с таким slug уже существует' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
