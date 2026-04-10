import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
      buttonText?: string
      buttonHref?: string
      eventType?: string   // 'button_click' | 'link_click' | 'form_submit'
      visitorToken?: string
    }

    const { landingSlug, buttonText, visitorToken } = body
    const eventType = body.eventType || 'button_click'

    if (!landingSlug || !buttonText) {
      return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
    }

    const supabase = getSupabase()

    // 1. Находим лендинг
    const { data: landing } = await supabase
      .from('landings')
      .select('id, project_id')
      .eq('slug', landingSlug)
      .single()

    if (!landing) {
      return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
    }

    // 2. Upsert кнопки по (landing_id, name) — создаёт если нет, обновляет если есть
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

    // 3. Если visitor_token известен — пишем в карточку клиента
    if (visitorToken) {
      const { data: customer } = await supabase
        .from('customers')
        .select('id, project_id')
        .eq('visitor_token', visitorToken)
        .eq('project_id', landing.project_id)
        .maybeSingle()

      if (customer) {
        await supabase.from('customer_actions').insert({
          customer_id: customer.id,
          project_id: customer.project_id,
          action: eventType,
          data: {
            button_text: buttonText,
            landing_slug: landingSlug,
            href: body.buttonHref || null,
          },
        })
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
