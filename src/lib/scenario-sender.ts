// Shared helper: send a scenario message with its buttons, schedule followups and next-message chains
// Used by both webhook (for immediate sends) and cron (for delayed sends from queue)

import { SupabaseClient } from '@supabase/supabase-js'
import {
  sendTelegramMessage, sendTelegramPhoto, sendTelegramVideo,
  sendTelegramAnimation, sendTelegramVideoNote, sendTelegramDocument, sendTelegramAudio,
} from '@/lib/telegram'
import { sendProjectEmail } from '@/lib/email'
import { waitUntil } from '@vercel/functions'

/**
 * If followup has duplicate_to_email flag, find customer's email and send a copy.
 */
export async function maybeDuplicateToEmail(
  supabase: SupabaseClient,
  conversationId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  followup: any
) {
  if (!followup.duplicate_to_email) return
  if (!followup.text && !followup.media_url) return

  // Находим customer + project (project_id нужен для sendProjectEmail)
  const { data: conv } = await supabase
    .from('chatbot_conversations')
    .select('customer_id, telegram_bots(project_id)')
    .eq('id', conversationId)
    .maybeSingle()
  if (!conv?.customer_id) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const botInfo = (conv as any).telegram_bots
  const projectId = botInfo?.project_id as string | undefined
  if (!projectId) return

  const { data: customer } = await supabase
    .from('customers').select('email, full_name').eq('id', conv.customer_id).single()
  if (!customer?.email) return

  const subject = followup.text
    ? followup.text.slice(0, 60)
    : 'Сообщение от бота'
  const body = followup.text ?? 'Сообщение со вложением'
  const html = followup.media_url
    ? `<p>${(followup.text ?? '').replace(/\n/g, '<br>')}</p><p><a href="${followup.media_url}">Открыть вложение</a></p>`
    : `<p>${(followup.text ?? '').replace(/\n/g, '<br>')}</p>`

  await sendProjectEmail(supabase, {
    projectId,
    to: customer.email,
    subject,
    text: body,
    html,
  })
}

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

/**
 * Sends a followup/message row using the correct Telegram method based on media_type.
 * Works for both followups and standalone messages.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendFollowupContent(botToken: string, chatId: number, f: any) {
  const caption = f.text || undefined
  if (f.media_type && f.media_url) {
    switch (f.media_type) {
      case 'photo':
        await sendTelegramPhoto(botToken, chatId, f.media_url, caption)
        return
      case 'video':
        await sendTelegramVideo(botToken, chatId, f.media_url, caption)
        return
      case 'animation':
        await sendTelegramAnimation(botToken, chatId, f.media_url, caption)
        return
      case 'video_note':
        await sendTelegramVideoNote(botToken, chatId, f.media_url)
        if (f.text) await sendTelegramMessage(botToken, chatId, f.text)
        return
      case 'audio':
        await sendTelegramAudio(botToken, chatId, f.media_url, caption)
        return
      case 'document':
      default:
        await sendTelegramDocument(botToken, chatId, f.media_url, caption)
        return
    }
  }
  if (f.text) await sendTelegramMessage(botToken, chatId, f.text)
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

  if (!msg) return

  const resolvedScenarioId = scenarioId ?? msg.scenario_id ?? null

  console.log(`[send] msg=${msg.id} pos=${msg.order_position} is_start=${msg.is_start} is_gate=${msg.is_subscription_gate} gate_channel=${msg.gate_channel_account_id} next=${msg.next_message_id}`)

  // =================================================================
  // Gate: проверка подписки на канал
  // Если customer уже подписан — пропускаем этот шаг, идём сразу к next.
  // Если нет — отправляем сообщение с кнопкой "Подписаться" + создаём
  // pending_subscription_gate. Когда webhook chat_member зафиксирует
  // подписку, продолжим цепочку с msg.next_message_id автоматически.
  // =================================================================
  if (msg.is_subscription_gate && msg.gate_channel_account_id) {
    const { data: channel, error: channelErr } = await supabase
      .from('social_accounts')
      .select('id, external_id, external_username, project_id')
      .eq('id', msg.gate_channel_account_id)
      .maybeSingle()

    console.log(`[gate] msg=${msg.id} channel_lookup=${channel ? `found external_id=${channel.external_id} username=${channel.external_username || 'none'}` : 'NOT FOUND'}${channelErr ? ` error=${channelErr.code}:${channelErr.message}` : ''}`)

    if (channel) {
      // Находим customer по conversation → chat_id=telegram_id
      const { data: conv } = await supabase
        .from('chatbot_conversations')
        .select('telegram_chat_id, project_id')
        .eq('id', conversationId)
        .maybeSingle()

      const { data: customer } = conv ? await supabase
        .from('customers')
        .select('id, channel_subscribed')
        .eq('telegram_id', String(conv.telegram_chat_id))
        .eq('project_id', conv.project_id)
        .maybeSingle() : { data: null }

      // Реалтайм-проверка через Bot API (getChatMember) — источник истины
      let isSubscribed = false
      try {
        const resp = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${channel.external_id}&user_id=${chatId}`)
        const js = await resp.json()
        if (js.ok) {
          const status = js.result?.status
          isSubscribed = status === 'member' || status === 'administrator' || status === 'creator'
          console.log(`[gate] channel=${channel.external_id} user=${chatId} status=${status} isSubscribed=${isSubscribed}`)
        } else {
          console.warn(`[gate] getChatMember failed channel=${channel.external_id} user=${chatId} err=${js.description || js.error_code}`)
        }
      } catch (err) {
        console.warn(`[gate] getChatMember threw channel=${channel.external_id} user=${chatId}`, err)
      }

      if (isSubscribed) {
        // Обновим БД на всякий случай
        if (customer && !customer.channel_subscribed) {
          await supabase.from('customers').update({
            channel_subscribed: true,
            channel_subscribed_at: new Date().toISOString(),
          }).eq('id', customer.id)
        }
        // Gate пройден — идём к следующему сообщению без задержки
        if (msg.next_message_id) {
          await sendScenarioMessage(supabase, botToken, chatId, msg.next_message_id, conversationId, userId, resolvedScenarioId)
        }
        return
      }

      // Не подписан → шлём сообщение с кнопкой "Подписаться" и запоминаем gate
      const username = channel.external_username?.replace(/^@/, '') || null
      const inviteUrl = username ? `https://t.me/${username}` : null
      if (inviteUrl) {
        const gateText = msg.text || 'Подпишись на канал, чтобы получить следующее сообщение 👇'
        // Оборачиваем через прокси /gate/<msgId> чтобы трекать клики
        // ?to=<username> включает fast-path (редирект без БД-lookup, лог асинхронно)
        const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.studency.ru').replace(/\/$/, '')
        const qs = new URLSearchParams()
        qs.set('to', username!)
        if (customer?.id) qs.set('c', customer.id)
        const proxyUrl = `${appUrl}/gate/${msg.id}?${qs.toString()}`
        const subscribeLabel = (msg.gate_button_label && msg.gate_button_label.trim()) || 'Подписаться'

        // Собираем кнопки: сначала автокнопка подписки, потом пользовательские
        const { data: extraBtns } = await supabase
          .from('scenario_buttons')
          .select('*')
          .eq('message_id', msg.id)
          .order('order_position')

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const userButtons = (extraBtns ?? []).filter((b: any) => b.text).map((b: any) => {
          let url: string | undefined
          if (b.action_type === 'url' && b.action_url) {
            const cParam = customer?.id ? `?c=${customer.id}` : ''
            url = `${appUrl}/btn/${b.id}${cParam}`
          }
          return {
            text: b.text,
            url,
            callback_data: b.action_type !== 'url' ? `btn:${b.id}` : undefined,
          }
        })

        await sendTelegramMessage(botToken, chatId, gateText, [
          { text: subscribeLabel, url: proxyUrl },
          ...userButtons,
        ])
        await supabase.from('chatbot_messages').insert({
          conversation_id: conversationId,
          direction: 'outgoing',
          content: gateText,
          scenario_id: resolvedScenarioId,
        })
        // Запоминаем что клиент завис на этом gate — продолжим при chat_member
        await supabase.from('pending_subscription_gates').insert({
          conversation_id: conversationId,
          gate_message_id: msg.id,
          channel_account_id: channel.id,
          channel_telegram_id: Number(channel.external_id),
          telegram_user_id: chatId,
          customer_id: customer?.id ?? null,
        })
      }
      return
    }
  }

  // Обычное сообщение: нужно иметь текст или медиа
  if (!msg.text && !msg.media_url) return

  // Get buttons
  const { data: btns } = await supabase
    .from('scenario_buttons')
    .select('*')
    .eq('message_id', msg.id)
    .order('order_position')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.studency.ru').replace(/\/$/, '')

  // Находим customer_id для прокси-трекинга кликов
  let customerIdForClicks: string | null = null
  try {
    const { data: conv } = await supabase
      .from('chatbot_conversations')
      .select('project_id')
      .eq('id', conversationId)
      .maybeSingle()
    if (conv) {
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('telegram_id', String(chatId))
        .eq('project_id', conv.project_id)
        .maybeSingle()
      if (customer) customerIdForClicks = customer.id
    }
  } catch { /* ignore */ }

  const telegramButtons = (btns ?? [])
    .filter((b: { text: string }) => b.text)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((b: any) => {
      let url: string | undefined
      if (b.action_type === 'url' && b.action_url) {
        // Подстановка {tgid}
        const resolvedDest = userId ? b.action_url.replace(/\{tgid\}/g, String(userId)) : b.action_url
        // Заворачиваем в прокси-редирект для аналитики кликов
        const cParam = customerIdForClicks ? `?c=${customerIdForClicks}` : ''
        url = `${appUrl}/btn/${b.id}${cParam}`
        // Если b.action_url уже указывает на telegram или если мы не знаем project_id,
        // всё равно прокси работает — он редиректит на оригинальный action_url из БД.
        // (Временная переменная resolvedDest нужна если включить inline-подстановку)
        void resolvedDest
      }
      return {
        text: b.text,
        url,
        callback_data: b.action_type !== 'url' ? `btn:${b.id}` : undefined,
      }
    })

  const hasButtons = telegramButtons.length > 0
  const buttonsArg = hasButtons ? telegramButtons : undefined
  const caption = msg.text || undefined

  // Отправляем в зависимости от типа медиа
  if (msg.media_type && msg.media_url) {
    switch (msg.media_type) {
      case 'photo':
        await sendTelegramPhoto(botToken, chatId, msg.media_url, caption, buttonsArg)
        break
      case 'video':
        await sendTelegramVideo(botToken, chatId, msg.media_url, caption, buttonsArg)
        break
      case 'animation':
        await sendTelegramAnimation(botToken, chatId, msg.media_url, caption, buttonsArg)
        break
      case 'video_note':
        // video_note не поддерживает caption/buttons — отправляем отдельно текст если есть
        await sendTelegramVideoNote(botToken, chatId, msg.media_url)
        if (msg.text) await sendTelegramMessage(botToken, chatId, msg.text, buttonsArg)
        break
      case 'audio':
        await sendTelegramAudio(botToken, chatId, msg.media_url, caption, buttonsArg)
        break
      case 'document':
      default:
        await sendTelegramDocument(botToken, chatId, msg.media_url, caption, buttonsArg)
        break
    }
  } else {
    // Обычное текстовое сообщение
    await sendTelegramMessage(botToken, chatId, msg.text, buttonsArg)
  }

  // Save outgoing
  await supabase.from('chatbot_messages').insert({
    conversation_id: conversationId,
    direction: 'outgoing',
    content: msg.text || `[${msg.media_type}]`,
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
              await sendFollowupContent(botToken, chatId, f)
            }
            if (channel === 'email' || channel === 'both' || f.duplicate_to_email) {
              await maybeDuplicateToEmail(supabase, conversationId, f)
            }
            await supabase.from('chatbot_messages').insert({
              conversation_id: conversationId,
              direction: 'outgoing',
              content: f.text || `[${f.media_type}]`,
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
