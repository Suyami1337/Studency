import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /btn/<token>
 *
 * Прокси-редирект для URL-кнопок бота/лендинга.
 * Token — это `scenario_buttons.id` (или любой UUID с destination_url в БД).
 *
 * Ищем кнопку в scenario_buttons. Если это url-кнопка — логируем клик
 * (customer_id через query param ?c=UUID) и редиректим на action_url.
 *
 * Задержка ~30-80мс — отправляем 302 моментально, лог идёт fire-and-forget.
 */
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const url = new URL(request.url)
  const customerParam = url.searchParams.get('c') || null

  const supabase = getSupabase()
  // Простой запрос — без nested join, который раньше молча падал и ронял весь redirect
  const { data: btn, error: btnErr } = await supabase
    .from('scenario_buttons')
    .select('id, action_url, action_type, message_id, followup_id')
    .eq('id', token)
    .maybeSingle()

  if (btnErr) console.error('[btn] lookup error:', btnErr.code, btnErr.message)
  if (!btn) console.warn(`[btn] not found token=${token}`)
  if (btn && !btn.action_url) console.warn(`[btn] found but action_url is empty id=${btn.id} type=${btn.action_type}`)

  if (!btn || !btn.action_url) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Если пользователь сохранил URL без схемы (например "t.me/channel") — Next.js
  // трактует это как относительный путь и редиректит на корень. Добавляем https://.
  let destination = btn.action_url.trim()
  if (!/^https?:\/\//i.test(destination) && !destination.startsWith('tg:')) {
    destination = 'https://' + destination.replace(/^\/+/, '')
  }

  // Fire-and-forget лог (не ждём) — projectId достаём отдельной цепочкой,
  // не блокируем редирект
  void (async () => {
    try {
      let projectId: string | undefined
      let botId: string | undefined
      // Находим message_id — либо напрямую, либо через followup
      let ownerMessageId: string | null = btn.message_id
      if (!ownerMessageId && btn.followup_id) {
        const { data: fu } = await supabase
          .from('message_followups')
          .select('scenario_message_id')
          .eq('id', btn.followup_id)
          .maybeSingle()
        ownerMessageId = fu?.scenario_message_id ?? null
      }
      if (ownerMessageId) {
        const { data: msg } = await supabase
          .from('scenario_messages')
          .select('scenario_id, chatbot_scenarios!inner(telegram_bot_id, telegram_bots!inner(id, project_id))')
          .eq('id', ownerMessageId)
          .maybeSingle()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const scn = (msg as any)?.chatbot_scenarios
        projectId = scn?.telegram_bots?.project_id
        botId = scn?.telegram_bots?.id
      }
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
      const ipHash = createHash('sha256').update(ip + (projectId ?? '')).digest('hex').slice(0, 16)
      await supabase.from('button_clicks').insert({
        project_id: projectId,
        button_id: btn.id,
        customer_id: customerParam,
        destination_url: destination,
        user_agent: request.headers.get('user-agent') || null,
        ip_hash: ipHash,
        referrer: request.headers.get('referer') || null,
      })
      if (customerParam && projectId) {
        await supabase.from('customer_actions').insert({
          customer_id: customerParam,
          project_id: projectId,
          action: 'button_click',
          data: { button_id: btn.id, destination_url: destination },
        })
      }

      // Клик по URL-кнопке = активность клиента → отменяем pending-дожимы
      // с cancel_on_reply=true в этом разговоре. Telegram webhook для URL-кнопок
      // не шлётся, поэтому без этой логики дожимы продолжали приходить.
      if (customerParam && botId) {
        const { data: customer } = await supabase
          .from('customers')
          .select('telegram_id')
          .eq('id', customerParam)
          .maybeSingle()
        if (customer?.telegram_id) {
          const { data: conv } = await supabase
            .from('chatbot_conversations')
            .select('id')
            .eq('telegram_bot_id', botId)
            .eq('telegram_chat_id', Number(customer.telegram_id))
            .maybeSingle()
          if (conv?.id) {
            const { data: pending } = await supabase
              .from('followup_queue')
              .select('id, followup_id')
              .eq('conversation_id', conv.id)
              .eq('status', 'pending')
            if (pending && pending.length > 0) {
              const fuIds = pending.map((p: { followup_id: string }) => p.followup_id)
              const { data: cancelFus } = await supabase
                .from('message_followups')
                .select('id')
                .in('id', fuIds)
                .eq('cancel_on_reply', true)
              if (cancelFus && cancelFus.length > 0) {
                const cancelFuIdSet = new Set(cancelFus.map((f: { id: string }) => f.id))
                const queueIds = pending
                  .filter((p: { followup_id: string }) => cancelFuIdSet.has(p.followup_id))
                  .map((p: { id: string }) => p.id)
                if (queueIds.length > 0) {
                  await supabase
                    .from('followup_queue')
                    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
                    .in('id', queueIds)
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('btn redirect log error:', err)
    }
  })()

  // 302 сразу, без ожидания лога
  return NextResponse.redirect(destination, { status: 302 })
}
