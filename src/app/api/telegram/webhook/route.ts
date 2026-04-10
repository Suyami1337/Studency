import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendTelegramMessage } from '@/lib/telegram'
import { waitUntil } from '@vercel/functions'

// Порог: задержки короче этого — отправляем через waitUntil сразу из webhook
const IMMEDIATE_THRESHOLD_MS = 25_000

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Convert delay_value + delay_unit → milliseconds
function delayToMs(value: number, unit: string): number {
  switch (unit) {
    case 'sec':  return value * 1000
    case 'min':  return value * 60 * 1000
    case 'hour': return value * 60 * 60 * 1000
    case 'day':  return value * 24 * 60 * 60 * 1000
    default:     return value * 60 * 1000 // fallback: minutes
  }
}

// Helper: send a scenario message with its buttons
async function sendScenarioMessage(
  supabase: ReturnType<typeof getSupabase>,
  botToken: string,
  chatId: number,
  messageId: string,
  conversationId: string,
  userId?: number,   // для подстановки {tgid} в URL кнопках
  scenarioId?: string  // для аналитики — в каком сценарии участвовал пользователь
) {
  const { data: msg } = await supabase
    .from('scenario_messages')
    .select('*')
    .eq('id', messageId)
    .single()

  if (!msg || !msg.text) return

  // Определяем scenario_id: из параметра или из самого сообщения
  const resolvedScenarioId = scenarioId ?? msg.scenario_id ?? null

  // Get buttons
  const { data: btns } = await supabase
    .from('scenario_buttons')
    .select('*')
    .eq('message_id', msg.id)
    .order('order_position')

  const telegramButtons = (btns ?? [])
    .filter(b => b.text)
    .map(b => {
      let url = b.action_type === 'url' && b.action_url ? b.action_url : undefined
      // Подставляем Telegram ID пользователя вместо {tgid}
      if (url && userId) {
        url = url.replace(/\{tgid\}/g, String(userId))
      }
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

  // Schedule followups for this message
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

    for (const f of followups) {
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

    // Длинные задержки — в очередь для cron
    if (queueRows.length > 0) {
      const { error: queueErr } = await supabase.from('followup_queue').insert(queueRows)
      if (queueErr) console.error('followup_queue insert error:', queueErr)
    }

    // Короткие задержки — waitUntil (фоново, все параллельно от одной точки отсчёта)
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

  // If next message exists and delay is 0, send it too
  if (msg.next_message_id && msg.delay_minutes === 0) {
    await sendScenarioMessage(supabase, botToken, chatId, msg.next_message_id, conversationId, userId, resolvedScenarioId)
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const body = await request.json()

    const isCallback = !!body.callback_query
    const message = isCallback ? body.callback_query.message : body.message
    if (!message) return NextResponse.json({ ok: true })

    const chatId = message.chat.id
    const userId = isCallback ? body.callback_query.from?.id : message.from?.id
    const username = isCallback ? body.callback_query.from?.username : message.from?.username
    const firstName = isCallback ? body.callback_query.from?.first_name : message.from?.first_name
    const text = isCallback ? '' : (message.text || '')
    const callbackData = isCallback ? body.callback_query.data : null

    const botToken = request.nextUrl.searchParams.get('token')
    if (!botToken) return NextResponse.json({ error: 'No token' }, { status: 400 })

    // Find bot
    const { data: bot } = await supabase
      .from('telegram_bots')
      .select('*')
      .eq('token', botToken)
      .eq('is_active', true)
      .single()

    if (!bot) return NextResponse.json({ error: 'Bot not found' }, { status: 404 })

    const projectId = bot.project_id

    // Find or create conversation
    const { data: conversation } = await supabase
      .from('chatbot_conversations')
      .upsert({
        telegram_bot_id: bot.id,
        telegram_chat_id: chatId,
        telegram_user_id: userId,
        telegram_username: username,
        telegram_first_name: firstName,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'telegram_bot_id,telegram_chat_id' })
      .select()
      .single()

    if (!conversation) return NextResponse.json({ ok: true })

    // Save incoming
    if (text) {
      await supabase.from('chatbot_messages').insert({
        conversation_id: conversation.id,
        direction: 'incoming',
        content: text,
        telegram_message_id: message.message_id,
      })

      // Cancel pending followups with cancel_on_reply=true for this conversation
      const { data: pendingFollowups } = await supabase
        .from('followup_queue')
        .select('id, followup_id')
        .eq('conversation_id', conversation.id)
        .eq('status', 'pending')

      if (pendingFollowups && pendingFollowups.length > 0) {
        const followupIds = pendingFollowups.map((q: { followup_id: string }) => q.followup_id)
        // Check which followups have cancel_on_reply=true
        const { data: cancelFollowups } = await supabase
          .from('message_followups')
          .select('id')
          .in('id', followupIds)
          .eq('cancel_on_reply', true)

        if (cancelFollowups && cancelFollowups.length > 0) {
          const cancelIds = cancelFollowups.map((f: { id: string }) => f.id)
          const queueIdsToCancel = pendingFollowups
            .filter((q: { followup_id: string }) => cancelIds.includes(q.followup_id))
            .map((q: { id: string }) => q.id)

          if (queueIdsToCancel.length > 0) {
            await supabase
              .from('followup_queue')
              .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
              .in('id', queueIdsToCancel)
          }
        }
      }
    }

    // Извлекаем source slug если пришёл /start src_SLUG (из UTM-ссылки /go/[slug])
    let sourceSlugFromStart: string | null = null
    if (text.startsWith('/start src_')) {
      sourceSlugFromStart = text.replace('/start src_', '').trim().replace(/_/g, '-') || null
    }

    // Find or create customer
    let customerId = conversation.customer_id
    if (!customerId) {
      const { data: customer } = await supabase
        .from('customers')
        .insert({
          project_id: projectId,
          telegram_id: String(userId),
          telegram_username: username,
          full_name: firstName,
        })
        .select()
        .single()

      if (customer) {
        customerId = customer.id
        await supabase.from('chatbot_conversations').update({ customer_id: customer.id }).eq('id', conversation.id)
        await supabase.from('customer_actions').insert({
          customer_id: customer.id, project_id: projectId, action: 'bot_start',
          data: { bot_name: bot.name, telegram_username: username },
        })

        // Привязываем источник трафика если пришёл через UTM deep link
        if (sourceSlugFromStart) {
          const { data: source } = await supabase
            .from('traffic_sources')
            .select('id, name, slug')
            .eq('project_id', projectId)
            .eq('slug', sourceSlugFromStart)
            .single()

          if (source) {
            await supabase.from('customers').update({
              source_id: source.id,
              source_slug: source.slug,
              source_name: source.name,
            }).eq('id', customer.id)

            await supabase.from('customer_actions').insert({
              customer_id: customer.id, project_id: projectId, action: 'source_linked',
              data: { source_name: source.name, source_slug: source.slug, via: 'bot_start' },
            })
          }
        }
      }
    } else if (sourceSlugFromStart && customerId) {
      // Уже существующий клиент — обновляем источник если ещё не установлен
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('source_id')
        .eq('id', customerId)
        .single()

      if (existingCustomer && !existingCustomer.source_id) {
        const { data: source } = await supabase
          .from('traffic_sources')
          .select('id, name, slug')
          .eq('project_id', projectId)
          .eq('slug', sourceSlugFromStart)
          .single()

        if (source) {
          await supabase.from('customers').update({
            source_id: source.id,
            source_slug: source.slug,
            source_name: source.name,
          }).eq('id', customerId)

          await supabase.from('customer_actions').insert({
            customer_id: customerId, project_id: projectId, action: 'source_linked',
            data: { source_name: source.name, source_slug: source.slug, via: 'bot_start' },
          })
        }
      }
    }

    // Get all scenarios for this bot
    const { data: scenarios } = await supabase
      .from('chatbot_scenarios')
      .select('id')
      .eq('telegram_bot_id', bot.id)

    if (!scenarios || scenarios.length === 0) {
      return NextResponse.json({ ok: true })
    }

    const scenarioIds = scenarios.map(s => s.id)

    // =============================================
    // HANDLE BUTTON CALLBACK
    // =============================================
    if (callbackData && callbackData.startsWith('btn:')) {
      const buttonId = callbackData.replace('btn:', '')

      const { data: btn } = await supabase
        .from('scenario_buttons')
        .select('*')
        .eq('id', buttonId)
        .single()

      if (btn) {
        // Log action
        if (customerId) {
          await supabase.from('customer_actions').insert({
            customer_id: customerId, project_id: projectId, action: 'bot_button_click',
            data: { button_text: btn.text, action_type: btn.action_type },
          })
        }

        // Handle action
        if (btn.action_type === 'goto_message' && btn.action_goto_message_id) {
          // scenario_id определяется из целевого сообщения внутри sendScenarioMessage
          await sendScenarioMessage(supabase, botToken, chatId, btn.action_goto_message_id, conversation.id, userId)
        } else if (btn.action_type === 'trigger' && btn.action_trigger_word) {
          // Find start message with this trigger
          const { data: triggerMsgs } = await supabase
            .from('scenario_messages')
            .select('*')
            .in('scenario_id', scenarioIds)
            .eq('is_start', true)
            .eq('trigger_word', btn.action_trigger_word)
            .limit(1)

          if (triggerMsgs && triggerMsgs[0]) {
            await sendScenarioMessage(supabase, botToken, chatId, triggerMsgs[0].id, conversation.id, userId, triggerMsgs[0].scenario_id)
          }
        }
        // url buttons are handled by Telegram directly
      }

      return NextResponse.json({ ok: true })
    }

    // =============================================
    // HANDLE TEXT MESSAGE — match trigger words
    // =============================================
    const { data: startMessages } = await supabase
      .from('scenario_messages')
      .select('*')
      .in('scenario_id', scenarioIds)
      .eq('is_start', true)

    const normalizedText = text.toLowerCase().trim()
    const matchedStart = (startMessages ?? []).find(m =>
      m.trigger_word && normalizedText === m.trigger_word.toLowerCase().trim()
    )

    if (matchedStart) {
      await sendScenarioMessage(supabase, botToken, chatId, matchedStart.id, conversation.id, userId, matchedStart.scenario_id)
      return NextResponse.json({ ok: true })
    }

    // No match — do nothing
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
