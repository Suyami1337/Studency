import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /gate/<msgId>
 *
 * Прокси-редирект для кнопки «Подписаться» в gate-сообщениях.
 * msgId — это scenario_messages.id (gate-сообщение).
 *
 * Достаём канал из social_accounts по msg.gate_channel_account_id,
 * собираем invite URL, логируем клик (customer_id через ?c=UUID),
 * редиректим на канал.
 */
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ msgId: string }> }) {
  const { msgId } = await params
  const url = new URL(request.url)
  const customerParam = url.searchParams.get('c') || null
  // Передаём destination сразу в URL → редиректим без единого запроса к БД
  const toParam = url.searchParams.get('to')

  // Быстрый путь: если в URL уже есть ?to=@username — сразу 302 без БД,
  // лог пишем fire-and-forget (редирект уже ушёл клиенту)
  if (toParam) {
    const destination = `https://t.me/${toParam.replace(/^@/, '')}`
    // Fire-and-forget лог клика
    void (async () => {
      try {
        if (customerParam) {
          const supabase = getSupabase()
          // Достаём project_id минимально — одна query, не блокирует редирект
          const { data: msg } = await supabase
            .from('scenario_messages')
            .select('gate_channel_account_id, chatbot_scenarios!inner(telegram_bots!inner(project_id))')
            .eq('id', msgId)
            .maybeSingle()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const projectId: string | undefined = (msg as any)?.chatbot_scenarios?.telegram_bots?.project_id
          if (projectId) {
            await supabase.from('customer_actions').insert({
              customer_id: customerParam,
              project_id: projectId,
              action: 'gate_subscribe_click',
              data: {
                gate_message_id: msgId,
                channel_account_id: msg?.gate_channel_account_id ?? null,
                destination: toParam,
              },
            })
          }
        }
      } catch (err) {
        console.error('gate click log error:', err)
      }
    })()
    return NextResponse.redirect(destination, { status: 302 })
  }

  // Fallback: старые сообщения без ?to= — делаем lookup (медленнее)
  const supabase = getSupabase()
  const { data: msg } = await supabase
    .from('scenario_messages')
    .select('id, gate_channel_account_id, chatbot_scenarios!inner(telegram_bots!inner(project_id))')
    .eq('id', msgId)
    .maybeSingle()

  if (!msg || !msg.gate_channel_account_id) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const { data: channel } = await supabase
    .from('social_accounts')
    .select('external_id, external_username')
    .eq('id', msg.gate_channel_account_id)
    .maybeSingle()

  const destination = channel?.external_username
    ? `https://t.me/${channel.external_username.replace(/^@/, '')}`
    : null

  if (!destination) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projectId: string | undefined = (msg as any).chatbot_scenarios?.telegram_bots?.project_id

  void (async () => {
    try {
      if (customerParam && projectId) {
        await supabase.from('customer_actions').insert({
          customer_id: customerParam,
          project_id: projectId,
          action: 'gate_subscribe_click',
          data: {
            gate_message_id: msgId,
            channel_account_id: msg.gate_channel_account_id,
            channel_telegram_id: channel?.external_id ?? null,
          },
        })
      }
    } catch (err) {
      console.error('gate click log error:', err)
    }
  })()

  return NextResponse.redirect(destination, { status: 302 })
}
