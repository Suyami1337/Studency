// GET /api/auth/handoff-redirect?projectId=<uuid>
// GET /api/auth/handoff-redirect?next=<full URL on subdomain>
//
// Создаёт одноразовый handoff-токен с текущей session юзера и редиректит
// на <sub>.studency.ru/api/auth/handoff-consume.
//
// Subdomain — на уровне аккаунта (account_domains.subdomain by user_id).
// Все проекты юзера живут под одним subdomain'ом.
//
// Параметры:
//   ?projectId=<uuid>  → target_path = /project/<id> (открыть проект)
//   ?next=<URL>        → URL обязательно на нашем subdomain'е, target_path = его pathname+search

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'studency.ru'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId') || ''
  const projectPathParam = url.searchParams.get('path') || ''
  const nextParam = url.searchParams.get('next') || ''

  // Auth check — нужна актуальная session
  const supabase = await createServerSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    const loginUrl = new URL('/login', request.url)
    if (nextParam) loginUrl.searchParams.set('next', nextParam)
    return NextResponse.redirect(loginUrl)
  }

  const userId = session.user.id

  // Резолвим subdomain аккаунта
  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: account } = await svc
    .from('account_domains')
    .select('subdomain')
    .eq('user_id', userId)
    .maybeSingle()

  if (!account?.subdomain) {
    // У юзера ещё нет subdomain'а — отправляем настраивать аккаунт
    return NextResponse.redirect(new URL('/account/settings', request.url))
  }

  // Определяем target_path
  let targetPath = '/projects'

  if (projectId) {
    // Открыть конкретный проект — проверяем доступ и формируем путь
    const { data: project } = await svc
      .from('projects')
      .select('id, owner_id')
      .eq('id', projectId)
      .maybeSingle()
    if (!project || project.owner_id !== userId) {
      return NextResponse.redirect(new URL('/projects', request.url))
    }
    // Если path передан — используем как есть, иначе /project/<id>
    targetPath = projectPathParam || `/project/${projectId}`
  } else if (nextParam) {
    try {
      const nu = new URL(nextParam)
      const h = nu.hostname.toLowerCase()
      const expected = `${account.subdomain}.${ROOT_DOMAIN}`.toLowerCase()
      if (h === expected) {
        targetPath = (nu.pathname || '/') + (nu.search || '')
      }
    } catch {
      // некорректный next → fallback на /projects
    }
  }

  // Создаём handoff record (через service role, минуя RLS)
  const { data: handoff, error } = await svc.from('auth_handoffs').insert({
    user_id: userId,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    target_path: targetPath,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  }).select('id').single()
  if (error || !handoff) {
    console.error('handoff-redirect: insert failed', error)
    return NextResponse.redirect(new URL('/projects', request.url))
  }

  const target = `https://${account.subdomain}.${ROOT_DOMAIN}/api/auth/handoff-consume?id=${handoff.id}`
  return NextResponse.redirect(target, 302)
}
