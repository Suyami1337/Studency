import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/track
// Body: { landingSlug, buttonText, buttonHref?, eventType?, visitorToken? }
// Вызывается автоматически из tracking-скрипта на лендинге.
// НЕ требует предварительного создания кнопок — сам создаёт записи по upsert.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      landingSlug?: string
      landingName?: string
      landingUrl?: string
      projectId?: string
      buttonText?: string
      buttonHref?: string
      eventType?: string
      visitorToken?: string
      duration_active_seconds?: number
      duration_total_seconds?: number
      reason?: string
      clientTs?: string  // ISO timestamp с клиента — нужен для правильного порядка
                         // быстрых событий (например 4 скролл-milestones за 100ms)
    }

    const { landingSlug, projectId, visitorToken } = body
    const buttonText = (body.buttonText || '').trim()
    const eventType = body.eventType || 'button_click'

    const ALLOWED_EVENTS = new Set([
      'button_click', 'link_click', 'form_submit',
      'page_view', 'page_view_end',
      'scroll_25', 'scroll_50', 'scroll_75', 'scroll_100',
    ])
    if (!ALLOWED_EVENTS.has(eventType)) {
      return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
    }

    if (!landingSlug) {
      return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
    }

    // Rate-limit per (IP, slug) — отсекаем флуд от ботов
    const ip = clientIp(request)
    if (!rateLimit(`track:${ip}:${landingSlug}`, 240, 60_000)) {
      return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
    }

    const supabase = getSupabase()

    // 1. Находим лендинг. Slug теперь не уникальный глобально — если есть
    // projectId, используем его. Иначе берём первый по created_at (legacy).
    let lq = supabase.from('landings').select('id, project_id').eq('slug', landingSlug)
    if (projectId) lq = lq.eq('project_id', projectId)
    const { data: landing } = await lq.order('created_at', { ascending: true }).limit(1).maybeSingle()

    if (!landing) {
      return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
    }

    // 2. Upsert кнопки по (landing_id, name) — но только если у элемента есть текст.
    // Иначе для иконок без подписи получали бы UNIQUE constraint конфликт.
    if (buttonText) {
      const { data: btn } = await supabase
        .from('landing_buttons')
        .upsert(
          { landing_id: landing.id, name: buttonText, clicks: 0, conversions: 0 },
          { onConflict: 'landing_id,name', ignoreDuplicates: false }
        )
        .select('id')
        .single()
      if (btn) {
        await supabase.rpc('increment_button_clicks', { p_button_id: btn.id })
      }
    }

    // 3. Логируем действие в карточку клиента. Если customer ещё не создан
    // (race с рендером лендинга или старая cookie не нашлась) — создаём
    // Гостя на лету, чтобы клик не потерялся.
    if (visitorToken) {
      let customerId: string | null = null
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('visitor_token', visitorToken)
        .eq('project_id', landing.project_id)
        .maybeSingle()
      if (customer) {
        customerId = customer.id as string
      } else {
        const { data: created } = await supabase
          .from('customers')
          .insert({
            project_id: landing.project_id,
            visitor_token: visitorToken,
            is_blocked: false,
          })
          .select('id')
          .single()
        if (created) customerId = created.id as string
      }

      if (customerId) {
        const dataPayload: Record<string, unknown> = {
          landing_slug: landingSlug,
        }
        if (body.landingName) dataPayload.landing_name = body.landingName
        if (body.landingUrl)  dataPayload.landing_url = body.landingUrl
        if (buttonText)       dataPayload.button_text = buttonText
        if (body.buttonHref)  dataPayload.href = body.buttonHref
        if (body.duration_active_seconds != null) dataPayload.duration_active_seconds = body.duration_active_seconds
        if (body.duration_total_seconds != null) dataPayload.duration_total_seconds = body.duration_total_seconds
        if (body.reason) dataPayload.reason = body.reason

        // Используем client-timestamp если он валидный (ISO),
        // чтобы порядок событий в UI совпадал с реальным порядком на клиенте.
        // Иначе при параллельных fetch'ах race-condition ставит created_at
        // в случайном порядке.
        const insertRow: Record<string, unknown> = {
          customer_id: customerId,
          project_id: landing.project_id,
          action: eventType,
          data: dataPayload,
        }
        if (body.clientTs && !isNaN(new Date(body.clientTs).getTime())) {
          insertRow.created_at = body.clientTs
        }
        await supabase.from('customer_actions').insert(insertRow)
      }
    }

    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
  } catch (error) {
    console.error('Track error:', error)
    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}
