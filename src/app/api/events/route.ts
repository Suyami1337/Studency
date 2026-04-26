import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendScenarioMessage } from '@/lib/scenario-sender'
import { evaluateAutoBoards } from '@/lib/crm-automation'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const runtime = 'nodejs'

// /api/events — публичный endpoint (вызывается из лендингов и трекинга),
// поэтому полная аутентификация невозможна. Защищаемся: валидация input,
// проверка существования project_id, rate-limit per IP+project.
const MAX_FIELD_LEN = 200
const MAX_METADATA_BYTES = 4096
const RATE_LIMIT = 60          // events/min на (ip, project_id)
const RATE_WINDOW_MS = 60_000

// Допустимые event_type (всё остальное — мусор)
const ALLOWED_EVENT_TYPES = new Set([
  'page_view', 'button_click', 'link_click', 'form_submit', 'video_start',
  'video_progress', 'video_complete', 'landing_visit', 'mini_app_opened',
  'subscription', 'unsubscribe', 'purchase', 'trigger_fired', 'custom',
])

function truncate(s: unknown, max: number): string | null {
  if (s == null) return null
  const str = String(s)
  return str.length > max ? str.slice(0, max) : str
}

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

    // Валидация event_type (отсекает мусор/спам с произвольными типами)
    if (!ALLOWED_EVENT_TYPES.has(event_type)) {
      return NextResponse.json({ error: 'unsupported event_type' }, { status: 400 })
    }

    // Валидация project_id формата (UUID)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(project_id)) {
      return NextResponse.json({ error: 'invalid project_id' }, { status: 400 })
    }

    // Rate-limit per (IP, project_id)
    const ip = clientIp(request)
    if (!rateLimit(`events:${ip}:${project_id}`, RATE_LIMIT, RATE_WINDOW_MS)) {
      return NextResponse.json({ error: 'rate limit exceeded' }, { status: 429 })
    }

    // Ограничиваем длину строковых полей и размер metadata
    const safeEventName = truncate(event_name, MAX_FIELD_LEN)
    const safeSource = truncate(source, MAX_FIELD_LEN)
    const safeSourceId = truncate(source_id, MAX_FIELD_LEN)
    const safeSessionId = truncate(session_id, MAX_FIELD_LEN)
    let safeMetadata: Record<string, unknown> = {}
    try {
      const metaStr = JSON.stringify(metadata ?? {})
      if (metaStr.length <= MAX_METADATA_BYTES) {
        safeMetadata = metadata && typeof metadata === 'object' ? metadata : {}
      }
    } catch { /* ignore — оставляем пустой metadata */ }

    const supabase = getSupabase()

    // Проверяем что project_id — реальный проект (отсекаем мусор)
    const { data: projectExists } = await supabase
      .from('projects').select('id').eq('id', project_id).maybeSingle()
    if (!projectExists) {
      return NextResponse.json({ error: 'project not found' }, { status: 404 })
    }

    // 1. Пишем событие (санитизированные значения)
    const { data: event, error } = await supabase.from('events').insert({
      project_id, event_type,
      event_name: safeEventName,
      source: safeSource,
      source_id: safeSourceId,
      customer_id: customer_id ?? null,
      session_id: safeSessionId,
      metadata: safeMetadata,
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

    // 3. CRM автоматизация — двигаем клиента по доскам если правила совпали
    if (customer_id && project_id) {
      evaluateAutoBoards(supabase, {
        projectId: project_id,
        customerId: customer_id,
        eventType: event_type,
        eventData: { event_name, source, source_id, ...metadata },
      }).catch(err => console.error('CRM auto error:', err))
    }

    return NextResponse.json({ ok: true, event_id: event.id })
  } catch (err) {
    console.error('events route error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
