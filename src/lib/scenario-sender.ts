// Shared helper: send a scenario message with its buttons, schedule followups and next-message chains
// Used by both webhook (for immediate sends) and cron (for delayed sends from queue)

import { SupabaseClient } from '@supabase/supabase-js'
import { sendTelegramMessage } from '@/lib/telegram'
import { waitUntil } from '@vercel/functions'

// Delays shorter than this are handled via waitUntil; longer ones go to the queue
const IMMEDIATE_THRESHOLD_MS = 25_000

export function delayToMs(value: number, unit: string): number {
  switch (unit) {
    case 'sec':  return value * 1000
    case 'min':  return value * 60 * 1000
    case 'hour': return value * 60 * 60 * 1000
    case 'day':  return value * 24 * 60 * 60 * 1000
    default:     return value * 60 * 1000
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendScenarioMessage(
  supabase: SupabaseClient,
  botToken: string,
  chatId: number,
  messageId: string,
  conversationId: string,
  userId?: number,
  scenarioId?: string
) {
  const { data: msg } = await supabase
    .from('scenario_messages')
    .select('*')
    .eq('id', messageId)
    .single()

  if (!msg || !msg.text) return

  const resolvedScenarioId = scenarioId ?? msg.scenario_id ?? null

  // Get buttons
  const { data: btns } = await supabase
    .from('scenario_buttons')
    .select('*')
    .eq('message_id', msg.id)
    .order('order_position')

  const telegramButtons = (btns ?? [])
    .filter((b: { text: string }) => b.text)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((b: any) => {
      let url = b.action_type === 'url' && b.action_url ? b.action_url : undefined
      if (url && userId) url = url.replace(/\{tgid\}/g, String(userId))
      return {
        text: b.text,
        url,
        callback_data: b.action_type !== 'url' ? `btn:${b.id}` : undefined,
      }
    })

  if (telegramButtons.length > 0) {
    await sendTelegramMessage(botToken, chatId, msg.text, telegramButtons)
  } else {
    await sendTelegramMessage(botToken, chatId, msg.text)
  }

  // Save outgoing
  await supabase.from('chatbot_messages').insert({
    conversation_id: conversationId,
    direction: 'outgoing',
    content: msg.text,
    scenario_id: resolvedScenarioId,
  })

  // Schedule followups
  const { data: followups } = await supabase
    .from('message_followups')
    .select('*')
    .eq('scenario_message_id', msg.id)
    .eq('is_active', true)
    .order('order_index')

  if (followups && followups.length > 0) {
    const now = Date.now()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shortDelay: any[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queueRows: any[] = []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const f of followups as any[]) {
      const delayMs = delayToMs(f.delay_value, f.delay_unit)
      if (delayMs < IMMEDIATE_THRESHOLD_MS) {
        shortDelay.push({ f, delayMs })
      } else {
        queueRows.push({
          followup_id: f.id,
          conversation_id: conversationId,
          chat_id: chatId,
          bot_token: botToken,
          send_at: new Date(now + delayMs).toISOString(),
          status: 'pending',
        })
      }
    }

    if (queueRows.length > 0) {
      const { error } = await supabase.from('followup_queue').insert(queueRows)
      if (error) console.error('followup_queue insert error:', error)
    }

    if (shortDelay.length > 0) {
      const startedAt = Date.now()
      waitUntil(Promise.all(shortDelay.map(({ f, delayMs }) =>
        (async () => {
          const elapsed = Date.now() - startedAt
          const remaining = Math.max(0, delayMs - elapsed)
          await new Promise(res => setTimeout(res, remaining))
          try {
            const channel = f.channel ?? 'telegram'
            if (channel === 'telegram' || channel === 'both') {
              await sendTelegramMessage(botToken, chatId, f.text)
            }
            await supabase.from('chatbot_messages').insert({
              conversation_id: conversationId,
              direction: 'outgoing',
              content: f.text,
            })
          } catch (err) {
            console.error('short followup send error:', err)
          }
        })()
      )))
    }
  }

  // Handle next message in chain
  if (msg.next_message_id) {
    const delayMs = delayToMs(msg.delay_minutes || 0, msg.delay_unit || 'min')

    if (delayMs === 0) {
      // Send immediately (recursive)
      await sendScenarioMessage(supabase, botToken, chatId, msg.next_message_id, conversationId, userId, resolvedScenarioId)
    } else if (delayMs < IMMEDIATE_THRESHOLD_MS) {
      // Short delay — waitUntil
      waitUntil((async () => {
        await new Promise(res => setTimeout(res, delayMs))
        try {
          await sendScenarioMessage(supabase, botToken, chatId, msg.next_message_id, conversationId, userId, resolvedScenarioId)
        } catch (err) {
          console.error('short next-message send error:', err)
        }
      })())
    } else {
      // Long delay — queue for cron
      const { error } = await supabase.from('scenario_message_queue').insert({
        next_message_id: msg.next_message_id,
        conversation_id: conversationId,
        chat_id: chatId,
        bot_token: botToken,
        user_id: userId ?? null,
        scenario_id: resolvedScenarioId,
        send_at: new Date(Date.now() + delayMs).toISOString(),
        status: 'pending',
      })
      if (error) console.error('scenario_message_queue insert error:', error)
    }
  }
}
