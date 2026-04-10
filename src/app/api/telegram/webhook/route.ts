import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendTelegramMessage } from '@/lib/telegram'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Helper: send a scenario message with its buttons
async function sendScenarioMessage(
  supabase: ReturnType<typeof getSupabase>,
  botToken: string,
  chatId: number,
  messageId: string,
  conversationId: string,
  userId?: number  // для подстановки {tgid} в URL кнопках
) {
  const { data: msg } = await supabase
    .from('scenario_messages')
    .select('*')
    .eq('id', messageId)
    .single()

  if (!msg || !msg.text) return

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
  })

  // If next message exists and delay is 0, send it too
  if (msg.next_message_id && msg.delay_minutes === 0) {
    await sendScenarioMessage(supabase, botToken, chatId, msg.next_message_id, conversationId, userId)
  }

  // TODO: If delay > 0, schedule via cron/queue (for now skip delayed messages)
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
            await sendScenarioMessage(supabase, botToken, chatId, triggerMsgs[0].id, conversation.id, userId)
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
      await sendScenarioMessage(supabase, botToken, chatId, matchedStart.id, conversation.id, userId)
      return NextResponse.json({ ok: true })
    }

    // No match — do nothing
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
