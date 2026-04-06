import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendTelegramMessage } from '@/lib/telegram'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const message = body.message || body.callback_query?.message

    if (!message) {
      return NextResponse.json({ ok: true })
    }

    const chatId = message.chat.id
    const userId = message.from?.id
    const username = message.from?.username
    const firstName = message.from?.first_name
    const text = body.message?.text || body.callback_query?.data || ''

    // Find which bot this webhook belongs to by checking all active bots
    // The bot token is extracted from the webhook URL path
    const botToken = request.nextUrl.searchParams.get('token')
    if (!botToken) {
      return NextResponse.json({ error: 'No token' }, { status: 400 })
    }

    // Find bot in database
    const { data: bot } = await supabase
      .from('telegram_bots')
      .select('*, projects(id)')
      .eq('token', botToken)
      .eq('is_active', true)
      .single()

    if (!bot) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 })
    }

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

    if (!conversation) {
      return NextResponse.json({ ok: true })
    }

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
      // Create new customer
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
        await supabase
          .from('chatbot_conversations')
          .update({ customer_id: customer.id })
          .eq('id', conversation.id)

        // Log action
        await supabase.from('customer_actions').insert({
          customer_id: customer.id,
          project_id: projectId,
          action: 'bot_start',
          data: { bot_name: bot.name, telegram_username: username },
        })
      }
    } else {
      // Log message action
      await supabase.from('customer_actions').insert({
        customer_id: customerId,
        project_id: projectId,
        action: 'bot_message',
        data: { text, bot_name: bot.name },
      })
    }

    // Find active scenario for this bot
    const { data: scenario } = await supabase
      .from('chatbot_scenarios')
      .select('*')
      .eq('telegram_bot_id', bot.id)
      .eq('status', 'active')
      .order('is_default', { ascending: false })
      .limit(1)
      .single()

    if (scenario) {
      // Get current step
      const stepPosition = conversation.current_step_position || 0

      const { data: steps } = await supabase
        .from('scenario_steps')
        .select('*')
        .eq('scenario_id', scenario.id)
        .order('order_position')

      if (steps && steps[stepPosition]) {
        const step = steps[stepPosition]

        if (step.step_type === 'message' && step.content) {
          await sendTelegramMessage(botToken, chatId, step.content)

          // Save outgoing message
          await supabase.from('chatbot_messages').insert({
            conversation_id: conversation.id,
            direction: 'outgoing',
            content: step.content,
          })
        }

        if (step.step_type === 'button' && step.button_text) {
          await sendTelegramMessage(
            botToken,
            chatId,
            step.content || 'Выберите действие:',
            [{ text: step.button_text, url: step.button_url || undefined }]
          )
        }

        // Advance to next step
        await supabase
          .from('chatbot_conversations')
          .update({
            current_scenario_id: scenario.id,
            current_step_position: stepPosition + 1,
          })
          .eq('id', conversation.id)
      }
    } else {
      // No scenario — send default message
      if (text === '/start') {
        await sendTelegramMessage(botToken, chatId, `Привет, ${firstName || 'друг'}! Бот подключён к Studency.`)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
