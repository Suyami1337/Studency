// GET /api/auth/handoff-redirect?projectId=<uuid>&path=<rest>
//
// Вызывается на main domain (studency.ru) когда юзер хочет открыть
// проект под его subdomain'ом. Создаёт одноразовый handoff-токен с
// текущей session юзера, редиректит на <sub>.studency.ru/api/auth/handoff-consume.
//
// На subdomain handoff-consume ставит cookie на subdomain'е и редиректит
// на target path внутри проекта. Так мы передаём auth между доменами без
// cookie-domain хаков (которые ломаются chunking токена Supabase).

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'studency.ru'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId') || ''
  const path = url.searchParams.get('path') || '/'

  if (!projectId) {
    return NextResponse.redirect(new URL('/projects', request.url))
  }

  // Auth check — нужна актуальная session
  const supabase = await createServerSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  // Юзер должен иметь доступ к проекту
  const { data: project } = await supabase
    .from('projects')
    .select('id, owner_id, subdomain')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) {
    return NextResponse.redirect(new URL('/projects', request.url))
  }
  if (project.owner_id !== session.user.id) {
    const { data: m } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', session.user.id)
      .maybeSingle()
    if (!m) return NextResponse.redirect(new URL('/projects', request.url))
  }

  if (!project.subdomain) {
    // Нет поддомена → fallback на старый routing
    const fallback = new URL(`/project/${projectId}${path}`, `https://${ROOT_DOMAIN}`)
    return NextResponse.redirect(fallback)
  }

  // Создаём handoff record (через service role, минуя RLS)
  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: handoff, error } = await svc.from('auth_handoffs').insert({
    user_id: session.user.id,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    target_path: path,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  }).select('id').single()
  if (error || !handoff) {
    console.error('handoff-redirect: insert failed', error)
    return NextResponse.redirect(new URL('/projects', request.url))
  }

  const target = `https://${project.subdomain}.${ROOT_DOMAIN}/api/auth/handoff-consume?id=${handoff.id}`
  return NextResponse.redirect(target, 302)
}
