import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/track
// Body: { buttonId: string, landingSlug: string, visitorToken?: string }
// Вызывается из JS-скрипта на публичной странице лендинга
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { buttonId, landingSlug, visitorToken } = body as {
      buttonId?: string
      landingSlug?: string
      visitorToken?: string
    }

    if (!buttonId || !landingSlug) {
      return NextResponse.json({ error: 'Missing buttonId or landingSlug' }, { status: 400 })
    }

    const supabase = getSupabase()

    // Проверяем что кнопка принадлежит этому лендингу
    const { data: button } = await supabase
      .from('landing_buttons')
      .select('id, landing_id, landings!inner(id, slug)')
      .eq('id', buttonId)
      .single()

    if (!button) {
      return NextResponse.json({ error: 'Button not found' }, { status: 404 })
    }

    const landing = button.landings as unknown as { id: string; slug: string }
    if (landing.slug !== landingSlug) {
      return NextResponse.json({ error: 'Button does not belong to this landing' }, { status: 403 })
    }

    // Инкрементируем счётчик
    await supabase.rpc('increment_button_clicks', { p_button_id: buttonId })

    // Если известен visitor_token — логируем действие (связка с CRM)
    if (visitorToken) {
      const { data: customer } = await supabase
        .from('customers')
        .select('id, project_id')
        .eq('visitor_token', visitorToken)
        .single()

      if (customer) {
        await supabase.from('customer_actions').insert({
          customer_id: customer.id,
          project_id: customer.project_id,
          action: 'button_click',
          data: { button_id: buttonId, landing_slug: landingSlug },
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Track error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// OPTIONS — CORS preflight (браузер будет слать с публичного домена)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
