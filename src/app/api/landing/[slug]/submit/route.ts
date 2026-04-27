import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { evaluateAutoBoards } from '@/lib/crm-automation'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { mergeGuestIntoCustomer } from '@/lib/customer-merge'
import { normalizePhone, normalizeEmail, normalizeTelegramUsername } from '@/lib/normalize'

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

    // Нормализация — приводим разные форматы к каноническим
    const normalizedPhone = normalizePhone(body.phone)
    const normalizedEmail = normalizeEmail(body.email)
    const normalizedTg    = normalizeTelegramUsername(body.telegram)

    // 2. Ищем существующего клиента: visitor_token > phone > email > telegram
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

    if (!customerId && normalizedPhone) {
      const { data: ex } = await supabase
        .from('customers')
        .select('id')
        .eq('project_id', projectId)
        .eq('phone', normalizedPhone)
        .maybeSingle()
      if (ex) customerId = ex.id
    }

    if (!customerId && normalizedEmail) {
      const { data: ex } = await supabase
        .from('customers')
        .select('id')
        .eq('project_id', projectId)
        .eq('email', normalizedEmail)
        .maybeSingle()
      if (ex) customerId = ex.id
    }

    if (!customerId && normalizedTg) {
      const { data: ex } = await supabase
        .from('customers')
        .select('id')
        .eq('project_id', projectId)
        .eq('telegram_username', normalizedTg)
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
          phone: normalizedPhone,
          email: normalizedEmail,
          telegram_username: normalizedTg,
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
      // Дообновляем данные клиента (только пустые поля заполняем — не затираем
      // существующие, т.к. могут быть валиднее)
      const { data: ex } = await supabase
        .from('customers').select('full_name, phone, email, telegram_username, visitor_token').eq('id', customerId).maybeSingle()
      type Ex = { full_name: string | null; phone: string | null; email: string | null; telegram_username: string | null; visitor_token: string | null }
      const e = (ex ?? {}) as Ex
      const updates: Record<string, string | null> = {}
      if (body.name && !e.full_name) updates.full_name = body.name.trim()
      if (normalizedPhone && !e.phone) updates.phone = normalizedPhone
      if (normalizedEmail && !e.email) updates.email = normalizedEmail
      if (normalizedTg && !e.telegram_username) updates.telegram_username = normalizedTg
      if (visitorToken && !e.visitor_token) updates.visitor_token = visitorToken

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

    // 3.5. Поиск и merge дубликатов: если у нас уже есть карточка с тем же
    // email или phone — это тот же человек, объединяем. Главное преимущество
    // юзера-в-Гостя: он зашёл на сайт давно с visitor_token, теперь заполнил
    // форму с email — наша карточка-Гость стала «полноценной», а ту, которая
    // осталась в Telegram до этого — нужно слить.
    if (customerId) {
      const findDup = async (col: 'email' | 'phone' | 'telegram_username', val: string) => {
        const { data: dups } = await supabase
          .from('customers')
          .select('id, telegram_id, first_touch_at, created_at')
          .eq('project_id', projectId)
          .eq(col, val)
          .neq('id', customerId)
        return (dups ?? []) as { id: string; telegram_id: string | null; first_touch_at: string | null; created_at: string }[]
      }
      const emailDups = normalizedEmail ? await findDup('email', normalizedEmail) : []
      const phoneDups = normalizedPhone ? await findDup('phone', normalizedPhone) : []
      const tgDups    = normalizedTg    ? await findDup('telegram_username', normalizedTg) : []

      // Защита: если у текущего customer'а есть telegram_id и у дубля тоже есть
      // telegram_id, и они РАЗНЫЕ — это два разных человека (не сливаем!).
      const { data: meRow } = await supabase
        .from('customers').select('telegram_id').eq('id', customerId).maybeSingle()
      const myTelegramId = (meRow as { telegram_id: string | null } | null)?.telegram_id ?? null

      const seen = new Set<string>()
      for (const dup of [...emailDups, ...phoneDups, ...tgDups]) {
        if (seen.has(dup.id)) continue
        seen.add(dup.id)
        // Skip: разные telegram_id у обеих → разные люди с одинаковым контактом
        if (dup.telegram_id && myTelegramId && dup.telegram_id !== myTelegramId) {
          console.warn(`[submit] merge skipped: different telegram_id (${dup.telegram_id} vs ${myTelegramId})`)
          continue
        }
        try {
          if (dup.telegram_id && !myTelegramId) {
            // Дубль — полноценная tg-карточка, наша — Гость с email/phone. Сливаем нас в неё.
            await mergeGuestIntoCustomer(supabase, customerId, dup.id)
            customerId = dup.id
          } else if (!dup.telegram_id) {
            // Дубль — Гость, у нас может быть tg или нет. В любом случае мы target.
            await mergeGuestIntoCustomer(supabase, dup.id, customerId, { allowGuestWithTelegram: false })
          }
        } catch (err) {
          console.error('[submit] auto-merge error:', err)
        }
      }
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
