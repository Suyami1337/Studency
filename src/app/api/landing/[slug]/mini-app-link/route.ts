import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHmac, createHash } from 'crypto'

export const runtime = 'nodejs'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Validates Telegram WebApp initData signature according to Telegram docs:
 *   https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Data-check string: все поля кроме hash, отсортированные по ключу, соединённые \n.
 * Secret key: HMAC-SHA256("WebAppData", bot_token).
 * Valid when HMAC-SHA256(secret, data-check) === hash.
 */
function validateInitData(initData: string, botToken: string): Record<string, string> | null {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null
  params.delete('hash')
  const pairs: string[] = []
  const keys = [...params.keys()].sort()
  for (const k of keys) pairs.push(`${k}=${params.get(k)}`)
  const dataCheckString = pairs.join('\n')
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const computed = createHmac('sha256', secretKey).update(dataCheckString).digest('hex')
  if (computed !== hash) return null
  const result: Record<string, string> = {}
  for (const k of keys) result[k] = params.get(k) ?? ''
  return result
}

/**
 * POST /api/landing/[slug]/mini-app-link
 * Body: { initData, visitorToken, projectId }
 *
 * Пытаемся по initData получить telegram_id клиента (валидируя подпись через
 * все боты проекта) и привязать visitor_token к customer с этим telegram_id.
 * Это закрывает identity-дыру между браузером и Telegram — внутри Mini App
 * у нас есть оба идентификатора одновременно.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    const { initData, visitorToken, projectId } = await request.json()
    if (!initData || !projectId) {
      return NextResponse.json({ error: 'initData and projectId required' }, { status: 400 })
    }

    const supabase = getSupabase()

    // Проверяем подпись против всех активных ботов проекта
    const { data: bots } = await supabase
      .from('telegram_bots')
      .select('id, token')
      .eq('project_id', projectId)
      .eq('is_active', true)

    let validated: Record<string, string> | null = null
    for (const bot of bots ?? []) {
      const v = validateInitData(initData, bot.token)
      if (v) { validated = v; break }
    }
    if (!validated) {
      return NextResponse.json({ ok: false, reason: 'invalid_signature' }, { status: 403 })
    }

    const userRaw = validated.user
    if (!userRaw) return NextResponse.json({ ok: false, reason: 'no_user' })
    const user = JSON.parse(userRaw)
    const telegramId = String(user.id)
    const username = user.username ?? null
    const firstName = user.first_name ?? null

    // Находим / создаём customer
    const { data: existing } = await supabase
      .from('customers')
      .select('id, visitor_token, source_id')
      .eq('project_id', projectId)
      .eq('telegram_id', telegramId)
      .maybeSingle()

    let customerId = existing?.id ?? null

    if (!customerId) {
      // Если есть visitor_token — попробуем найти customer по нему
      if (visitorToken) {
        const { data: byVt } = await supabase
          .from('customers')
          .select('id, telegram_id')
          .eq('project_id', projectId)
          .eq('visitor_token', visitorToken)
          .maybeSingle()
        if (byVt && !byVt.telegram_id) {
          // Обогащаем существующую анонимную карточку telegram_id
          await supabase.from('customers').update({
            telegram_id: telegramId,
            telegram_username: username,
            ...(firstName ? { full_name: firstName } : {}),
          }).eq('id', byVt.id)
          customerId = byVt.id
        }
      }
    } else {
      // Обновляем visitor_token если он новее и не был установлен
      if (visitorToken && !existing?.visitor_token) {
        await supabase.from('customers').update({ visitor_token: visitorToken }).eq('id', customerId)
      }
    }

    if (!customerId) {
      // Создаём новую карточку с обоими идентификаторами сразу
      const { data: newCustomer } = await supabase.from('customers').insert({
        project_id: projectId,
        telegram_id: telegramId,
        telegram_username: username,
        full_name: firstName,
        visitor_token: visitorToken || null,
      }).select('id').single()
      customerId = newCustomer?.id ?? null
    }

    if (customerId) {
      await supabase.from('customer_actions').insert({
        customer_id: customerId,
        project_id: projectId,
        action: 'mini_app_opened',
        data: { landing_slug: slug, telegram_id: telegramId },
      })
    }

    // IP hash для аналитики / дедупликации
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const ipHash = createHash('sha256').update(ip + projectId).digest('hex').slice(0, 16)

    return NextResponse.json({ ok: true, customer_id: customerId, ip_hash: ipHash })
  } catch (err) {
    console.error('mini-app-link error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
