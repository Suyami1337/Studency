import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendScenarioMessage } from '@/lib/scenario-sender'

export const runtime = 'nodejs'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/events
 * Принимает события от сайтов, лендингов, плееров, ботов и т.д.
 * Автоматически проверяет event triggers чат-ботов и запускает сценарии.
 *
 * Body: {
 *   project_id: string,
 *   event_type: 'page_view' | 'button_click' | 'form_submit' | 'custom' | ...
 *   event_name?: string,
 *   source?: 'landing' | 'bot' | 'site' | ...
 *   source_id?: string,
 *   customer_id?: string,
 *   session_id?: string,
 *   metadata?: Record<string, any>
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      project_id, event_type, event_name, source, source_id,
      customer_id, session_id, metadata = {},
    } = body

    if (!project_id || !event_type) {
      return NextResponse.json({ error: 'project_id and event_type required' }, { status: 400 })
    }

    const supabase = getSupabase()

    // 1. Пишем событие
    const { data: event, error } = await supabase.from('events').insert({
      project_id, event_type, event_name, source, source_id,
      customer_id: customer_id ?? null,
      session_id: session_id ?? null,
      metadata,
    }).select().single()

    if (error) {
      console.error('events insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 2. Проверяем триггеры чат-ботов
    // Находим все триггеры с matching event_type для проекта
    const { data: triggers } = await supabase
      .from('scenario_event_triggers')
      .select(`
        *,
        chatbot_scenarios!inner(
          id, telegram_bot_id,
          telegram_bots!inner(project_id, token, is_active)
        )
      `)
      .eq('event_type', event_type)
      .eq('chatbot_scenarios.telegram_bots.project_id', project_id)
      .eq('chatbot_scenarios.telegram_bots.is_active', true)

    if (triggers && triggers.length > 0 && customer_id) {
      // Находим telegram_chat_id для этого customer
      const { data: customer } = await supabase
        .from('customers').select('telegram_id').eq('id', customer_id).single()

      if (customer?.telegram_id) {
        const chatId = parseInt(customer.telegram_id, 10)

        for (const trigger of triggers) {
          // Проверяем event_name если указан
          if (trigger.event_name && trigger.event_name !== event_name) continue

          // Проверяем source если указан
          if (trigger.source && trigger.source !== source) continue

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const bot = (trigger.chatbot_scenarios as any).telegram_bots

          // Находим conversation
          const { data: conv } = await supabase
            .from('chatbot_conversations')
            .select('id')
            .eq('telegram_bot_id', bot.id ?? (trigger.chatbot_scenarios as { telegram_bot_id: string }).telegram_bot_id)
            .eq('telegram_chat_id', chatId)
            .maybeSingle()

          if (conv) {
            try {
              await sendScenarioMessage(
                supabase, bot.token, chatId,
                trigger.start_message_id, conv.id,
                chatId, trigger.scenario_id
              )
            } catch (err) {
              console.error('trigger send error:', err)
            }
          }
        }
      }
    }

    return NextResponse.json({ ok: true, event_id: event.id })
  } catch (err) {
    console.error('events route error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
