import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { sendFollowupContent } from '@/lib/scenario-sender'
import { sendProjectEmail } from '@/lib/email'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type Recipient = {
  id: string
  telegram_id: string | null
  email: string | null
  // Диалог с ботом — берём отсюда chat_id для отправки и id для пометки chat_blocked.
  // Заполнен только для тех клиентов что делали /start этому боту.
  conversation_id: string | null
  conversation_chat_id: number | null
}

export type BroadcastResult =
  | { ok: false; error: string; status?: number }
  | { ok: true; sent: number; failed: number; total: number }

/**
 * Telegram возвращает эти ошибки для клиентов которые (а) заблокировали бота,
 * (б) удалили аккаунт или (в) не нажимали /start. В любом случае бот больше
 * не может им писать — помечаем conversation.chat_blocked=true и исключаем
 * из следующих рассылок.
 */
function isUnreachable(errorText: string): boolean {
  const e = errorText.toLowerCase()
  return e.includes('forbidden')
      || e.includes('chat not found')
      || e.includes('user is deactivated')
      || e.includes("bot can't initiate conversation")
      || e.includes('bot was blocked by the user')
}

/**
 * Ядро отправки рассылки — используется UI-кнопкой и cron.
 *
 * Атомарно claim'ит запись через UPDATE status='sending' (разрешено только
 * из 'draft' или 'scheduled'), чтобы параллельные вызовы не запустили её дважды.
 */
export async function runBroadcast(id: string): Promise<BroadcastResult> {
  try {
    const supabase = getSupabase()

    const { data: broadcast } = await supabase.from('broadcasts').select('*').eq('id', id).single()
    if (!broadcast) return { ok: false, error: 'Broadcast not found', status: 404 }
    if (broadcast.status === 'sent') return { ok: false, error: 'Already sent', status: 400 }
    if (broadcast.status === 'sending') return { ok: false, error: 'Already sending', status: 400 }

    const channel = broadcast.channel ?? 'telegram'
    const useTelegram = channel === 'telegram' || channel === 'both'
    const useEmail = channel === 'email' || channel === 'both'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let bot: any = null
    if (useTelegram) {
      if (!broadcast.telegram_bot_id) {
        return { ok: false, error: 'Для Telegram-рассылки нужен бот', status: 400 }
      }
      const { data } = await supabase.from('telegram_bots')
        .select('*').eq('id', broadcast.telegram_bot_id).single()
      if (!data) return { ok: false, error: 'Bot not found', status: 404 }
      bot = data
    }

    // Атомарный claim — рассылка больше никогда не запустится параллельно.
    const { data: claimed } = await supabase
      .from('broadcasts')
      .update({ status: 'sending' })
      .eq('id', id)
      .in('status', ['draft', 'scheduled'])
      .select('id')
      .maybeSingle()
    if (!claimed) return { ok: false, error: 'Broadcast already being sent', status: 409 }

    const recipients = await loadRecipients(supabase, broadcast, { useTelegram, useEmail })

    console.log(`[broadcast:${id}] recipients=${recipients.length} channel=${channel} segment=${broadcast.segment_type}:${broadcast.segment_value ?? ''}`)

    if (recipients.length === 0) {
      await supabase.from('broadcasts').update({
        status: 'sent', sent_at: new Date().toISOString(),
        total_recipients: 0, sent_count: 0,
      }).eq('id', id)
      return { ok: true, sent: 0, failed: 0, total: 0 }
    }

    await supabase.from('broadcasts').update({
      total_recipients: recipients.length,
    }).eq('id', id)

    let sent = 0
    let failed = 0

    for (const r of recipients) {
      let recipientSent = false
      const errors: string[] = []

      // ── Telegram ──
      // Отправляем только если у клиента есть активный диалог с этим ботом.
      // Без /start от юзера Telegram возвращает 403 «can't initiate conversation».
      if (useTelegram && bot && r.conversation_id && r.conversation_chat_id) {
        try {
          // Кнопки рассылки — массив { text, url }. Пробрасываем в формат
          // inline_keyboard который ждёт sendTelegramMessage.
          const buttons = Array.isArray(broadcast.buttons)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ? (broadcast.buttons as any[])
                .filter(b => b && b.text && b.url)
                .map(b => ({ text: String(b.text), url: String(b.url) }))
            : undefined
          const res = await sendFollowupContent(bot.token, r.conversation_chat_id, {
            text: broadcast.text,
            media_type: broadcast.media_type,
            media_url: broadcast.media_url,
          }, buttons && buttons.length > 0 ? buttons : undefined)
          if (res.ok) {
            await supabase.from('chatbot_messages').insert({
              conversation_id: r.conversation_id,
              direction: 'outgoing',
              content: broadcast.text || `[${broadcast.media_type}]`,
            })
            recipientSent = true
          } else {
            errors.push('tg:' + res.error)
            // Бот заблокирован / чат недоступен — помечаем, чтобы больше не пытаться
            if (res.error && isUnreachable(res.error)) {
              await supabase.from('chatbot_conversations')
                .update({ chat_blocked: true })
                .eq('id', r.conversation_id)
            }
          }
        } catch (err) {
          errors.push('tg:' + (err instanceof Error ? err.message : 'err'))
        }
        // Rate limit для Telegram Bot API
        await new Promise(res => setTimeout(res, 40))
      }

      // ── Email ──
      if (useEmail && r.email) {
        try {
          const res = await sendProjectEmail(supabase, {
            projectId: broadcast.project_id,
            to: r.email,
            subject: broadcast.email_subject ?? broadcast.name ?? 'Сообщение',
            text: broadcast.text ?? '',
            html: broadcast.text
              ? `<p>${broadcast.text.replace(/\n/g, '<br>')}</p>`
              : undefined,
          })
          if (res.ok) recipientSent = true
          else if (!res.unsubscribed) errors.push('email:' + res.error)
        } catch (err) {
          errors.push('email:' + (err instanceof Error ? err.message : 'err'))
        }
      }

      if (recipientSent) {
        await supabase.from('broadcast_deliveries').insert({
          broadcast_id: id, customer_id: r.id, status: 'sent',
          sent_at: new Date().toISOString(),
        })
        sent++
      } else {
        await supabase.from('broadcast_deliveries').insert({
          broadcast_id: id, customer_id: r.id, status: 'failed',
          error: errors.length > 0 ? errors.join('; ') : 'no channel matched',
        })
        failed++
      }
    }

    await supabase.from('broadcasts').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      sent_count: sent,
      failed_count: failed,
    }).eq('id', id)

    console.log(`[broadcast:${id}] done sent=${sent} failed=${failed} total=${recipients.length}`)
    return { ok: true, sent, failed, total: recipients.length }
  } catch (err) {
    console.error(`[broadcast:${id}] fatal:`, err)
    try {
      await getSupabase().from('broadcasts').update({ status: 'draft' }).eq('id', id)
    } catch { /* ignore */ }
    return { ok: false, error: err instanceof Error ? err.message : 'Internal error' }
  }
}

/**
 * Собирает реальных получателей:
 * - Для Telegram-канала — только те кто делал /start этому боту
 *   (есть в chatbot_conversations c этим telegram_bot_id, chat_blocked=false).
 * - Для Email-канала — любые клиенты с email.
 * - Для «both» — клиент попадает если доступен хотя бы один канал.
 *
 * Сегменты (funnel_stage/tag/source/scenario_message_*) применяются поверх.
 * Экспортируется чтобы preview-count endpoint мог переиспользовать без отправки.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadRecipients(supabase: SupabaseClient, broadcast: any, opts: { useTelegram: boolean; useEmail: boolean }): Promise<Recipient[]> {
  const { useTelegram, useEmail } = opts

  // ─── Карта customer_id → conversation для Telegram ───
  // Если useTelegram: собираем всех кто делал /start этому боту (не заблокировал).
  const telegramConvMap = new Map<string, { conversation_id: string; chat_id: number }>()
  if (useTelegram && broadcast.telegram_bot_id) {
    const { data: convs } = await supabase
      .from('chatbot_conversations')
      .select('id, customer_id, telegram_chat_id')
      .eq('telegram_bot_id', broadcast.telegram_bot_id)
      .eq('chat_blocked', false)
      .not('customer_id', 'is', null)

    for (const c of (convs ?? []) as Array<{ id: string; customer_id: string; telegram_chat_id: number | string }>) {
      const chatId = typeof c.telegram_chat_id === 'string'
        ? parseInt(c.telegram_chat_id, 10)
        : c.telegram_chat_id
      if (!chatId) continue
      // Если у одного клиента несколько conversations (переподписка) — берём любую.
      if (!telegramConvMap.has(c.customer_id)) {
        telegramConvMap.set(c.customer_id, { conversation_id: c.id, chat_id: chatId })
      }
    }
  }

  // ─── Сегмент по блокам сценария ───
  let customerIdFilter: string[] | null = null
  if (broadcast.segment_type === 'scenario_message_in' && broadcast.segment_value) {
    customerIdFilter = await customersWhoReceivedBlock(supabase, broadcast.project_id, broadcast.segment_value)
    if (customerIdFilter.length === 0) return []
  } else if (broadcast.segment_type === 'scenario_message_not_in' && broadcast.segment_value) {
    const received = await customersWhoReceivedBlock(supabase, broadcast.project_id, broadcast.segment_value)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase.from('customers').select('id').eq('project_id', broadcast.project_id)
    if (received.length > 0) {
      q = q.not('id', 'in', `(${received.join(',')})`)
    }
    const { data } = await q
    const ids = ((data ?? []) as { id: string }[]).map(c => c.id)
    if (ids.length === 0) return []
    customerIdFilter = ids
  }

  // ─── Базовая выборка customers ───
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('customers')
    .select('id, telegram_id, email')
    .eq('project_id', broadcast.project_id)
    .neq('is_blocked', true)

  if (customerIdFilter !== null) {
    query = query.in('id', customerIdFilter)
  }

  if (broadcast.segment_type === 'funnel_stage' && broadcast.segment_value) {
    query = query.eq('funnel_stage_id', broadcast.segment_value)
  } else if (broadcast.segment_type === 'source' && broadcast.segment_value) {
    query = query.eq('source_slug', broadcast.segment_value)
  } else if (broadcast.segment_type === 'tag' && broadcast.segment_value) {
    query = query.contains('tags', [broadcast.segment_value])
  }

  const { data } = await query
  const allCustomers = (data ?? []) as Array<{ id: string; telegram_id: string | null; email: string | null }>

  // ─── Финальный фильтр по доступным каналам ───
  const out: Recipient[] = []
  for (const c of allCustomers) {
    const tgConv = telegramConvMap.get(c.id)
    const canTg = useTelegram && !!tgConv
    const canEmail = useEmail && !!c.email
    if (!canTg && !canEmail) continue
    out.push({
      id: c.id,
      telegram_id: c.telegram_id,
      email: c.email,
      conversation_id: tgConv?.conversation_id ?? null,
      conversation_chat_id: tgConv?.chat_id ?? null,
    })
  }
  return out
}

/**
 * Уникальные customer_id клиентов которым реально был отправлен блок сценария
 * (через chatbot_messages.scenario_message_id).
 */
async function customersWhoReceivedBlock(
  supabase: SupabaseClient,
  projectId: string,
  scenarioMessageId: string
): Promise<string[]> {
  const { data: msgRows } = await supabase
    .from('chatbot_messages')
    .select('conversation_id')
    .eq('scenario_message_id', scenarioMessageId)
    .limit(5000)

  if (!msgRows || msgRows.length === 0) return []

  const convIds = Array.from(new Set(
    msgRows.map((r: { conversation_id: string | null }) => r.conversation_id).filter((x): x is string => !!x)
  ))
  if (convIds.length === 0) return []

  const { data: convRows } = await supabase
    .from('chatbot_conversations')
    .select('customer_id, telegram_bots!inner(project_id)')
    .in('id', convIds)
    .eq('telegram_bots.project_id', projectId)
    .not('customer_id', 'is', null)

  if (!convRows) return []

  return Array.from(new Set(
    convRows
      .map((r: { customer_id: string | null }) => r.customer_id)
      .filter((x): x is string => !!x)
  ))
}
