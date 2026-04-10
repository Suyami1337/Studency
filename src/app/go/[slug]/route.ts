import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createHash, randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VISITOR_COOKIE = 'stud_vid'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 год

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  // 1. Найти источник трафика по slug
  const { data: source } = await supabase
    .from('traffic_sources')
    .select('id, project_id, destination_url, slug')
    .eq('slug', slug)
    .single()

  if (!source) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // 2. Получить или создать visitor token из cookie
  const cookieStore = await cookies()
  let visitorToken = cookieStore.get(VISITOR_COOKIE)?.value
  if (!visitorToken) {
    visitorToken = randomUUID()
  }

  // 3. Хэш IP для дедупликации (не храним сам IP)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
  const ipHash = createHash('sha256').update(ip + source.project_id).digest('hex').slice(0, 16)

  // 4. Логируем событие (fire-and-forget, не блокируем редирект)
  void (async () => {
    await supabase.from('tracking_events').insert({
      source_id: source.id,
      project_id: source.project_id,
      visitor_token: visitorToken,
      ip_hash: ipHash,
      referrer: request.headers.get('referer') || null,
      user_agent: request.headers.get('user-agent') || null,
    })
    await supabase.rpc('increment_source_clicks', { source_id: source.id })
  })()

  // 5. Редирект с установкой cookie
  const destination = source.destination_url.startsWith('http')
    ? source.destination_url
    : `https://${source.destination_url}`

  const response = NextResponse.redirect(destination, { status: 302 })

  response.cookies.set(VISITOR_COOKIE, visitorToken, {
    maxAge: COOKIE_MAX_AGE,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  })

  return response
}
