import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendTelegramMessage } from '@/lib/telegram'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const body = await request.json()
    const message = body.message || body.callback_query?.message

    if (!message) return NextResponse.json({ ok: true })

    const chatId = message.chat.id
    const userId = message.from?.id
    const username = message.from?.username
    const firstName = message.from?.first_name
    const text = body.message?.text || body.callback_query?.data || ''

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

    // Save incoming message
    await supabase.from('chatbot_messages').insert({
      conversation_id: conversation.id,
      direction: 'incoming',
      content: text,
      telegram_message_id: message.message_id,
    })

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

    // =============================================
    // NEW: Find matching start message by trigger word
    // =============================================

    // Get all scenarios for this bot
    const { data: scenarios } = await supabase
      .from('chatbot_scenarios')
      .select('id')
      .eq('telegram_bot_id', bot.id)

    if (!scenarios || scenarios.length === 0) {
      return NextResponse.json({ ok: true })
    }

    const scenarioIds = scenarios.map(s => s.id)

    // Find start message matching the trigger word
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
      // Send the start message
      if (matchedStart.text) {
        // Get buttons for this message
        const { data: btns } = await supabase
          .from('scenario_buttons')
          .select('*')
          .eq('message_id', matchedStart.id)
          .order('order_position')

        const telegramButtons = (btns ?? []).map(b => ({
          text: b.text,
          url: b.action_type === 'url' ? b.action_url || undefined : undefined,
        }))

        if (telegramButtons.length > 0) {
          await sendTelegramMessage(botToken, chatId, matchedStart.text, telegramButtons)
        } else {
          await sendTelegramMessage(botToken, chatId, matchedStart.text)
        }

        // Save outgoing
        await supabase.from('chatbot_messages').insert({
          conversation_id: conversation.id,
          direction: 'outgoing',
          content: matchedStart.text,
        })
      }

      // If there's a next message linked, queue it (for now just send immediately if no delay)
      if (matchedStart.next_message_id) {
        const { data: nextMsg } = await supabase
          .from('scenario_messages')
          .select('*')
          .eq('id', matchedStart.next_message_id)
          .single()

        if (nextMsg && nextMsg.text && nextMsg.delay_minutes === 0) {
          await sendTelegramMessage(botToken, chatId, nextMsg.text)
          await supabase.from('chatbot_messages').insert({
            conversation_id: conversation.id,
            direction: 'outgoing',
            content: nextMsg.text,
          })
        }
      }

      return NextResponse.json({ ok: true })
    }

    // No matching trigger — check if it's a callback/button press that triggers a word
    // For now, do nothing if no trigger matches

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
