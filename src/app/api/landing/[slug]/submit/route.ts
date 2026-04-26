import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { evaluateAutoBoards } from '@/lib/crm-automation'
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

// OPTIONS — CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

// POST /api/landing/[slug]/submit
// Body: { name?, phone?, email?, telegram?, visitorToken?, extra?: Record<string,string> }
// Создаёт клиента в CRM + заявку + двигает в воронку
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params

    // Rate-limit per (IP, slug). 5 заявок/мин с одного IP — спам ботов.
    const ip = clientIp(request)
    if (!rateLimit(`submit:${ip}:${slug}`, 5, 60_000)) {
      return NextResponse.json({ error: 'Слишком много заявок, попробуйте через минуту' }, { status: 429, headers: CORS_HEADERS })
    }

    const body = await request.json() as {
      name?: string
      phone?: string
      email?: string
      telegram?: string
      visitorToken?: string
      projectId?: string
      extra?: Record<string, string>
    }

    const supabase = getSupabase()

    // 1. Находим лендинг по (projectId, slug). Slug не уникальный глобально.
    // Если projectId не передан — берём первый созданный (legacy fallback).
    let lq = supabase
      .from('landings')
      .select('id, project_id, name, funnel_id, funnel_stage_id')
      .eq('slug', slug)
      .eq('status', 'published')
    if (body.projectId) lq = lq.eq('project_id', body.projectId)
    const { data: landing } = await lq.order('created_at', { ascending: true }).limit(1).maybeSingle()

    if (!landing) {
      return NextResponse.json({ error: 'Landing not found' }, { status: 404 })
    }

    const projectId = landing.project_id
    const visitorToken = body.visitorToken || null

    // 2. Ищем существующего клиента по visitor_token / телефону / email
    let customerId: string | null = null

    if (visitorToken) {
      const { data: ex } = await supabase
        .from('customers')
        .select('id')
        .eq('project_id', projectId)
        .eq('visitor_token', visitorToken)
        .maybeSingle()
      if (ex) customerId = ex.id
    }

    if (!customerId && body.phone) {
      const phone = body.phone.replace(/\D/g, '')
      const { data: ex } = await supabase
        .from('customers')
        .select('id')
        .eq('project_id', projectId)
        .eq('phone', phone)
        .maybeSingle()
      if (ex) customerId = ex.id
    }

    if (!customerId && body.email) {
      const { data: ex } = await supabase
        .from('customers')
        .select('id')
        .eq('project_id', projectId)
        .eq('email', body.email.toLowerCase().trim())
        .maybeSingle()
      if (ex) customerId = ex.id
    }

    // 3. Создаём нового клиента если не нашли
    if (!customerId) {
      const { data: newCustomer } = await supabase
        .from('customers')
        .insert({
          project_id: projectId,
          full_name: body.name?.trim() || null,
          phone: body.phone ? body.phone.replace(/\D/g, '') : null,
          email: body.email?.toLowerCase().trim() || null,
          telegram_username: body.telegram?.replace('@', '').trim() || null,
          visitor_token: visitorToken,
        })
        .select('id')
        .single()

      if (newCustomer) {
        customerId = newCustomer.id
        await supabase.from('customer_actions').insert({
          customer_id: customerId,
          project_id: projectId,
          action: 'form_submit',
          data: { landing_slug: slug, landing_name: landing.name },
        })
      }
    } else {
      // Дообновляем данные клиента
      const updates: Record<string, string | null> = {}
      if (body.name) updates.full_name = body.name.trim()
      if (body.phone) updates.phone = body.phone.replace(/\D/g, '')
      if (body.email) updates.email = body.email.toLowerCase().trim()
      if (body.telegram) updates.telegram_username = body.telegram.replace('@', '').trim()
      if (visitorToken) updates.visitor_token = visitorToken

      if (Object.keys(updates).length > 0) {
        await supabase.from('customers').update(updates).eq('id', customerId)
      }

      await supabase.from('customer_actions').insert({
        customer_id: customerId,
        project_id: projectId,
        action: 'form_submit',
        data: { landing_slug: slug, landing_name: landing.name, returning: true },
      })
    }

    // 4. Помещаем клиента в стадию воронки
    if (landing.funnel_id && customerId) {
      let targetStageId: string | null = landing.funnel_stage_id ?? null

      if (!targetStageId) {
        const { data: stages } = await supabase
          .from('funnel_stages')
          .select('id')
          .eq('funnel_id', landing.funnel_id)
          .order('order_position', { ascending: true })
          .limit(1)
        targetStageId = stages?.[0]?.id ?? null
      }

      if (targetStageId) {
        // upsert: если клиент уже в воронке — обновляем стадию
        await supabase
          .from('customer_funnel_positions')
          .upsert(
            {
              customer_id: customerId,
              funnel_id: landing.funnel_id,
              stage_id: targetStageId,
              entered_at: new Date().toISOString(),
            },
            { onConflict: 'customer_id,funnel_id' }
          )
      }
    }

    // 5. Сохраняем заявку
    await supabase.from('lead_submissions').insert({
      landing_id: landing.id,
      project_id: projectId,
      customer_id: customerId,
      visitor_token: visitorToken,
      name: body.name?.trim() || null,
      phone: body.phone?.replace(/\D/g, '') || null,
      email: body.email?.toLowerCase().trim() || null,
      telegram_username: body.telegram?.replace('@', '').trim() || null,
      extra: body.extra ?? {},
    })

    // 6. Инкремент конверсий лендинга
    await supabase.rpc('increment_landing_conversions', { p_landing_id: landing.id })

    // 7. CRM автоматизация
    if (customerId && projectId) {
      evaluateAutoBoards(supabase, {
        projectId,
        customerId,
        eventType: 'form_submit',
        eventData: { landing_slug: slug, landing_name: landing.name, email: body.email, phone: body.phone },
      }).catch(err => console.error('CRM auto error:', err))
    }

    return NextResponse.json(
      { ok: true, customerId },
      { headers: CORS_HEADERS }
    )
  } catch (error) {
    console.error('Submit error:', error)
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
