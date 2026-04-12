import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createHash, randomUUID } from 'crypto'
import { evaluateAutoBoards } from '@/lib/crm-automation'

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
    .select('id, project_id, destination_url, slug, name')
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

  // 3. Хэш IP для дедупликации
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
  const ipHash = createHash('sha256').update(ip + source.project_id).digest('hex').slice(0, 16)

  // 4. Telegram ID из query param (бот подставляет автоматически)
  const tgId = request.nextUrl.searchParams.get('tgid')

  // 5. Fire-and-forget: логируем событие + привязываем к CRM карточке
  void (async () => {
    // Логируем клик
    await supabase.from('tracking_events').insert({
      source_id: source.id,
      project_id: source.project_id,
      visitor_token: visitorToken,
      ip_hash: ipHash,
      referrer: request.headers.get('referer') || null,
      user_agent: request.headers.get('user-agent') || null,
    })
    await supabase.rpc('increment_source_clicks', { source_id: source.id })

    // Если пришёл из бота с Telegram ID — обновляем карточку CRM
    if (tgId) {
      const { data: customer } = await supabase
        .from('customers')
        .select('id, source_id')
        .eq('project_id', source.project_id)
        .eq('telegram_id', tgId)
        .single()

      if (customer) {
        // Обновляем источник только если ещё не установлен
        if (!customer.source_id) {
          await supabase
            .from('customers')
            .update({
              visitor_token: visitorToken,
              source_id: source.id,
              source_slug: source.slug,
              source_name: source.name,
            })
            .eq('id', customer.id)
        } else {
          // Visitor token обновляем всегда (для трекинга на сайте)
          await supabase
            .from('customers')
            .update({ visitor_token: visitorToken })
            .eq('id', customer.id)
        }

        // Логируем переход в историю действий клиента
        await supabase.from('customer_actions').insert({
          customer_id: customer.id,
          project_id: source.project_id,
          action: 'landing_visit',
          data: {
            source_slug: source.slug,
            source_name: source.name,
            url: source.destination_url,
          },
        })

        // CRM автоматизация — landing_visit
        await evaluateAutoBoards(supabase, {
          projectId: source.project_id,
          customerId: customer.id,
          eventType: 'landing_visit',
          eventData: { source_slug: source.slug, source_name: source.name, landing_url: source.destination_url },
        }).catch(err => console.error('CRM auto error:', err))
      }
    }
  })()

  // 6. Редирект с cookie
  let destination = source.destination_url.startsWith('http')
    ? source.destination_url
    : `https://${source.destination_url}`

  // Если ссылка ведёт в Telegram-бот — добавляем start параметр с slug источника.
  // Бот получит /start src_SLUG и сможет сразу привязать источник к клиенту.
  // Slug для start: только a-z0-9_- (до 64 символов, по правилам Telegram)
  const isTelegramLink = /^https?:\/\/(t\.me|telegram\.me)\//i.test(destination)
  if (isTelegramLink) {
    try {
      const url = new URL(destination)
      const safeSlug = source.slug.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)
      const startParam = `src_${safeSlug}`
      // Если уже есть ?start= — не перебиваем (человек перешёл через кнопку бота)
      if (!url.searchParams.has('start')) {
        url.searchParams.set('start', startParam)
      }
      destination = url.toString()
    } catch { /* оставляем оригинальный url */ }
  }

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
