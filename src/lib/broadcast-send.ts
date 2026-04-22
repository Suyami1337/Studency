import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { sendFollowupContent } from '@/lib/scenario-sender'
import { sendProjectEmail } from '@/lib/email'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type Recipient = { id: string; telegram_id: string | null; email: string | null }

export type BroadcastResult =
  | { ok: false; error: string; status?: number }
  | { ok: true; sent: number; failed: number; total: number }

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

      if (useTelegram && r.telegram_id && bot) {
        const chatId = parseInt(r.telegram_id, 10)
        if (chatId) {
          try {
            const res = await sendFollowupContent(bot.token, chatId, {
              text: broadcast.text,
              media_type: broadcast.media_type,
              media_url: broadcast.media_url,
            })
            if (res.ok) {
              const { data: conv } = await supabase
                .from('chatbot_conversations')
                .select('id')
                .eq('telegram_bot_id', bot.id)
                .eq('telegram_chat_id', chatId)
                .maybeSingle()
              if (conv) {
                await supabase.from('chatbot_messages').insert({
                  conversation_id: conv.id,
                  direction: 'outgoing',
                  content: broadcast.text || `[${broadcast.media_type}]`,
                })
              }
              recipientSent = true
            } else {
              errors.push('tg:' + res.error)
            }
          } catch (err) {
            errors.push('tg:' + (err instanceof Error ? err.message : 'err'))
          }
          // Rate limit для Telegram Bot API
          await new Promise(res => setTimeout(res, 40))
        }
      }

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
 * Собирает получателей по сегменту.
 * - .neq('is_blocked', true) чтобы не терять клиентов с is_blocked IS NULL.
 * - scenario_message_in/not_in — через join chatbot_messages → chatbot_conversations.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadRecipients(supabase: SupabaseClient, broadcast: any, opts: { useTelegram: boolean; useEmail: boolean }): Promise<Recipient[]> {
  const { useTelegram, useEmail } = opts

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('customers')
    .select('id, telegram_id, email')
    .eq('project_id', broadcast.project_id)
    .neq('is_blocked', true)

  if (customerIdFilter !== null) {
    query = query.in('id', customerIdFilter)
  }

  if (useTelegram && !useEmail) {
    query = query.not('telegram_id', 'is', null)
  } else if (useEmail && !useTelegram) {
    query = query.not('email', 'is', null)
  }

  if (broadcast.segment_type === 'funnel_stage' && broadcast.segment_value) {
    query = query.eq('funnel_stage_id', broadcast.segment_value)
  } else if (broadcast.segment_type === 'source' && broadcast.segment_value) {
    query = query.eq('source_slug', broadcast.segment_value)
  } else if (broadcast.segment_type === 'tag' && broadcast.segment_value) {
    query = query.contains('tags', [broadcast.segment_value])
  }

  const { data } = await query
  return (data ?? []) as Recipient[]
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
