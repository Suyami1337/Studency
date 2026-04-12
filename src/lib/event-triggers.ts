// Event catalog + unified emitter with positive/negative trigger evaluation.
//
// Positive trigger: event happens → scenario fires immediately for this customer.
// Negative trigger: event_type happens → scheduled_trigger row with scheduled_at =
//   now + wait_minutes. If cancel_on_event_type[:event_name] fires for this customer
//   before scheduled_at, the row is marked 'cancelled'. Otherwise cron fires it.
//
// Params filter: each trigger can have event_params jsonb — e.g. { videoId, minPercent }.
// Emitter compares with the event's metadata/source_id to decide if trigger matches.

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendScenarioMessage } from './scenario-sender'

// =====================================================
// Event catalog
// =====================================================
export type EventType =
  | 'video_start'
  | 'video_progress'
  | 'video_complete'
  | 'landing_visit'
  | 'form_submit'
  | 'button_click'
  | 'channel_joined'
  | 'order_created'
  | 'order_paid'
  | 'custom'

export type EventCatalogEntry = {
  type: EventType
  label: string                              // "Досмотрел видео"
  description: string
  targetKind?: 'video' | 'landing' | 'product' | 'channel' | 'form' | null
  extraParams?: Array<{
    key: string
    label: string
    kind: 'number' | 'text'
    suffix?: string
    defaultValue?: number | string
  }>
  /** если это событие может отменять какие-то негативные триггеры — тип исходного */
  cancels?: EventType[]
}

/** Каталог событий для UI и агента */
export const EVENT_CATALOG: EventCatalogEntry[] = [
  {
    type: 'video_start',
    label: 'Начал смотреть видео',
    description: 'Клиент открыл плеер и запустил видео',
    targetKind: 'video',
  },
  {
    type: 'video_progress',
    label: 'Досмотрел видео до X%',
    description: 'Дошёл до определённого процента просмотра',
    targetKind: 'video',
    extraParams: [{ key: 'minPercent', label: 'Минимум', kind: 'number', suffix: '%', defaultValue: 50 }],
    cancels: ['video_start'],
  },
  {
    type: 'video_complete',
    label: 'Досмотрел видео до конца',
    description: 'Видео просмотрено полностью',
    targetKind: 'video',
    cancels: ['video_start', 'video_progress'],
  },
  {
    type: 'landing_visit',
    label: 'Зашёл на сайт',
    description: 'Открыл лендинг',
    targetKind: 'landing',
  },
  {
    type: 'form_submit',
    label: 'Отправил форму',
    description: 'Заполнил форму на лендинге',
    targetKind: 'form',
  },
  {
    type: 'button_click',
    label: 'Нажал кнопку',
    description: 'Клик по кнопке на сайте / в сообщении',
    targetKind: null,
  },
  {
    type: 'channel_joined',
    label: 'Подписался на канал',
    description: 'Подписался на Telegram-канал',
    targetKind: 'channel',
  },
  {
    type: 'order_created',
    label: 'Создал заказ',
    description: 'Оформил заказ, но не факт что оплатил',
    targetKind: 'product',
    cancels: ['landing_visit'],
  },
  {
    type: 'order_paid',
    label: 'Оплатил заказ',
    description: 'Заказ успешно оплачен',
    targetKind: 'product',
    cancels: ['order_created', 'landing_visit'],
  },
  {
    type: 'custom',
    label: 'Произвольное событие',
    description: 'Любое событие по имени (event_name)',
    targetKind: null,
    extraParams: [{ key: 'eventName', label: 'Имя события', kind: 'text' }],
  },
]

export function getEventCatalog() { return EVENT_CATALOG }

// =====================================================
// Emit event
// =====================================================
export type EmitEventInput = {
  projectId: string
  eventType: EventType | string
  eventName?: string | null
  source?: string | null
  sourceId?: string | null
  customerId?: string | null
  sessionId?: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>
}

export type EmitEventResult = {
  eventId: string
  positiveFired: number
  negativeScheduled: number
  cancelled: number
}

/**
 * Checks whether trigger's event_params are satisfied by the emitted event.
 * Missing param in trigger = matches anything. Presence = must match exactly
 * (or, for minPercent — event value must be >= trigger minPercent).
 */
function paramsMatch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  triggerParams: Record<string, any>,
  input: EmitEventInput,
): boolean {
  if (!triggerParams || Object.keys(triggerParams).length === 0) return true

  // videoId / landingSlug / productId / formSlug / channelId compare to sourceId
  const idParams = ['videoId', 'landingSlug', 'productId', 'formSlug', 'channelId']
  for (const key of idParams) {
    if (triggerParams[key] && triggerParams[key] !== input.sourceId) return false
  }

  // minPercent: event.metadata.percent or .max_position_seconds/duration
  if (triggerParams.minPercent !== undefined && triggerParams.minPercent !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = (input.metadata ?? {}) as Record<string, any>
    let percent = meta.percent
    if (percent === undefined && meta.max_position_seconds && meta.duration_seconds) {
      percent = (meta.max_position_seconds / meta.duration_seconds) * 100
    }
    if (percent === undefined) return false
    if (percent < Number(triggerParams.minPercent)) return false
  }

  // eventName
  if (triggerParams.eventName && triggerParams.eventName !== input.eventName) return false

  return true
}

async function fireScenarioForCustomer(
  supabase: SupabaseClient,
  args: {
    scenarioId: string
    startMessageId: string
    telegramBotId: string | null
    customerId: string
  },
): Promise<boolean> {
  // Load bot + customer's chat_id + conversation
  const [{ data: scenario }, { data: customer }] = await Promise.all([
    supabase.from('chatbot_scenarios').select('id, telegram_bot_id, telegram_bots(id, token)').eq('id', args.scenarioId).single(),
    supabase.from('customers').select('telegram_id').eq('id', args.customerId).single(),
  ])
  if (!scenario || !customer?.telegram_id) return false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bot: any = Array.isArray((scenario as any).telegram_bots) ? (scenario as any).telegram_bots[0] : (scenario as any).telegram_bots
  if (!bot?.token) return false

  const chatId = typeof customer.telegram_id === 'string' ? parseInt(customer.telegram_id, 10) : Number(customer.telegram_id)
  if (!Number.isFinite(chatId)) return false

  const { data: conv } = await supabase
    .from('chatbot_conversations')
    .select('id')
    .eq('telegram_bot_id', bot.id)
    .eq('telegram_chat_id', chatId)
    .maybeSingle()
  if (!conv) return false

  try {
    await sendScenarioMessage(supabase, bot.token, chatId, args.startMessageId, conv.id, chatId, args.scenarioId)
    return true
  } catch (err) {
    console.error('fireScenarioForCustomer failed:', err)
    return false
  }
}

/**
 * Emit an event. Writes to events table. Evaluates matching triggers:
 *   - Positive triggers for this event_type → fire immediately (if customer known).
 *   - Negative triggers for this event_type → schedule scheduled_triggers row.
 *   - Pending scheduled_triggers whose cancel_on matches → mark cancelled.
 */
export async function emitEvent(
  supabase: SupabaseClient,
  input: EmitEventInput,
): Promise<EmitEventResult> {
  const result: EmitEventResult = { eventId: '', positiveFired: 0, negativeScheduled: 0, cancelled: 0 }

  // 1. Write to events table
  const { data: event, error } = await supabase.from('events').insert({
    project_id: input.projectId,
    event_type: input.eventType,
    event_name: input.eventName ?? null,
    source: input.source ?? null,
    source_id: input.sourceId ?? null,
    customer_id: input.customerId ?? null,
    session_id: input.sessionId ?? null,
    metadata: input.metadata ?? {},
  }).select().single()

  if (error) {
    console.error('emitEvent: events insert failed', error)
    return result
  }
  result.eventId = event.id

  // Without a customer we can't target triggers. Events are still logged for analytics.
  if (!input.customerId) return result

  // 2. Find all triggers in this project matching this event_type
  const { data: triggers } = await supabase
    .from('scenario_event_triggers')
    .select(`
      id, scenario_id, start_message_id, event_type, event_name, is_negative,
      wait_minutes, wait_value, wait_unit, event_params, cancel_on_event_type, cancel_on_event_name,
      chatbot_scenarios!inner(
        id, telegram_bot_id,
        telegram_bots!inner(project_id, is_active)
      )
    `)
    .eq('event_type', input.eventType)
    .eq('chatbot_scenarios.telegram_bots.project_id', input.projectId)
    .eq('chatbot_scenarios.telegram_bots.is_active', true)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = (triggers ?? []) as any[]

  for (const t of all) {
    if (t.event_name && t.event_name !== input.eventName) continue
    if (!paramsMatch(t.event_params ?? {}, input)) continue

    if (!t.is_negative) {
      // Positive → fire
      const ok = await fireScenarioForCustomer(supabase, {
        scenarioId: t.scenario_id,
        startMessageId: t.start_message_id,
        telegramBotId: t.chatbot_scenarios?.telegram_bot_id ?? null,
        customerId: input.customerId,
      })
      if (ok) result.positiveFired++
    } else {
      // Negative → schedule
      const unitMs: Record<string, number> = { sec: 1000, min: 60_000, hour: 3_600_000, day: 86_400_000 }
      const waitMs = t.wait_value > 0
        ? Number(t.wait_value) * (unitMs[t.wait_unit] ?? 60_000)
        : Number(t.wait_minutes || 0) * 60_000
      const scheduledAt = new Date(Date.now() + waitMs)
      const telegramBotId = t.chatbot_scenarios?.telegram_bot_id ?? null

      const { error: insErr } = await supabase.from('scheduled_triggers').insert({
        trigger_id: t.id,
        scenario_id: t.scenario_id,
        start_message_id: t.start_message_id,
        customer_id: input.customerId,
        project_id: input.projectId,
        telegram_bot_id: telegramBotId,
        scheduled_at: scheduledAt.toISOString(),
        status: 'pending',
      })
      if (!insErr) result.negativeScheduled++
    }
  }

  // 3. Cancel pending scheduled_triggers whose cancel_on matches this event
  //    We need to look at the underlying triggers where cancel_on_event_type = event_type
  //    (and cancel_on_event_name matches if set), then nullify pending rows for this customer.
  const { data: cancellingTriggers } = await supabase
    .from('scenario_event_triggers')
    .select('id, cancel_on_event_name, event_params')
    .eq('is_negative', true)
    .eq('cancel_on_event_type', input.eventType)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ct = (cancellingTriggers ?? []) as any[]
  for (const trig of ct) {
    if (trig.cancel_on_event_name && trig.cancel_on_event_name !== input.eventName) continue
    if (!paramsMatch(trig.event_params ?? {}, input)) continue

    const { data: updated, error: updErr } = await supabase
      .from('scheduled_triggers')
      .update({
        status: 'cancelled',
        cancel_reason: `Отменён событием ${input.eventType}`,
        cancelled_by_event_id: event.id,
      })
      .eq('trigger_id', trig.id)
      .eq('customer_id', input.customerId)
      .eq('status', 'pending')
      .select('id')
    if (!updErr && updated) result.cancelled += updated.length
  }

  return result
}
