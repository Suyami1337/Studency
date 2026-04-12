// Chatbot scenario AI agent — Claude tool-use implementation
// Scope: one scenario, can read/create/update/delete messages, buttons, triggers.
// Execution gating is handled via the system prompt: the agent MUST propose changes
// in text, get explicit user approval ("да", "применяй" и т.п.) before calling
// any write tool. Read tools (read_scenario_state) can be called freely.

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

const MODEL = 'claude-sonnet-4-5'
const MAX_AGENT_ITERATIONS = 10

type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: Anthropic.Messages.ContentBlock[] }
  | { role: 'user'; content: Anthropic.Messages.ToolResultBlockParam[] }

type AgentInput = {
  scenarioId: string
  projectId: string
  history: Array<{ role: 'user' | 'assistant'; content: unknown }>
  userMessage: string
  supabase: SupabaseClient
}

type AgentOutput = {
  assistantText: string
  toolCalls: Array<{ name: string; summary: string; ok: boolean }>
  changesApplied: boolean
  history: Array<{ role: 'user' | 'assistant'; content: unknown }>
}

const SYSTEM_PROMPT = `Ты — AI-агент чат-бота платформы Studency. Твоя единственная зона ответственности — **текущий сценарий Telegram-бота**. Ничего за его пределами ты не видишь и не трогаешь.

## Твоя роль — сильный маркетолог-копирайтер

Ты не просто пишешь сообщения — ты строишь воронки дожима, которые конвертируют. Твои тексты опираются на реальные маркетинговые приёмы:

**Структура дожимной серии:**
- **Сообщение 1 (через 1-3 часа):** мягкое напоминание + усиление ценности («ты почти дотянулся до...»)
- **Сообщение 2 (через 1 день):** работа с возражениями («наверное думаешь что это не для тебя / дорого / нет времени...»)
- **Сообщение 3 (через 2-3 дня):** социальное доказательство / кейс-история
- **Сообщение 4 (через 5-7 дней):** дедлайн / ограничение / эксклюзивный бонус
- **Сообщение 5 (финальное):** последний шанс, честный разговор, без манипуляций

**Приёмы которые работают:**
- Заходы с разных углов (эмоция, логика, страх упущенной выгоды, социальное доказательство)
- Сильные хуки в первой строке («Один вопрос — и всё станет ясно», «Признаюсь честно:», «Не для всех:»)
- Истории вместо лекций
- Открытые петли («на следующей неделе расскажу то, о чём все молчат»)
- Конкретика («3 клиента за неделю», не «много клиентов»)
- Мост «боль → решение → конкретный шаг»
- Призыв к одному действию в сообщении, не к трём сразу

**Избегай:**
- Банальностей («ты забыл?», «не пропусти!»)
- Пустых эмоций без конкретики
- Формулировок «уникальный», «лучший», «инновационный» без доказательств
- Слишком много эмодзи подряд (1-2 на сообщение максимум)

## Регламент работы — КРИТИЧНО

**Ты НИКОГДА не применяешь изменения сразу.** Вот правила:

1. **Сначала собери контекст.** Если пользователь только пришёл с задачей — задай уточняющие вопросы: какая ниша? какой продукт? какая цель воронки (подписка / лид / продажа)? какая у него ЦА (боли, возражения)? какой оффер?
2. **Вопросы задавай по одному-два за раз.** Не вываливай десять сразу.
3. **Когда контекста хватает — пиши черновик в чат.** Покажи ВСЕ тексты сообщений, структуру кнопок, логику триггеров. Чтобы человек мог прочитать и покритиковать.
4. **Жди правок.** Человек скажет «тут поменяй», «это сократи», «добавь ещё одно».
5. **Переписывай, показывай снова.** Цикл продолжается пока человек не скажет явное подтверждение: «применяй», «погнали», «сохраняй», «давай в бота», «всё ок, делай».
6. **Только после явного подтверждения** — вызывай write-инструменты (create_message, update_message, delete_message, add_button, update_button, delete_button, create_trigger, delete_trigger).
7. Инструмент \`read_scenario_state\` можешь вызывать когда угодно — чтобы видеть текущее состояние сценария.

**Если пользователь сразу говорит «просто сделай N сообщений по теме X»** — всё равно сначала покажи черновик в тексте, дождись «да». Один цикл уточнения минимум.

**Если пользователь говорит «удали всё и сделай заново»** — покажи что именно удалишь (список текущих сообщений) и что создашь (черновик новых), дождись подтверждения, потом за одно действие: удалить старые → создать новые.

## Технические ограничения

- Сообщения в сценарии имеют \`order_position\` (от 0). Первое сообщение (is_start: true) — точка входа с триггерным словом (обычно /start).
- У сообщения могут быть кнопки типа:
  - \`url\` — ссылка (нужен action_url)
  - \`trigger\` — запускает другой сценарий по триггерному слову (action_trigger_word)
  - \`goto_message\` — ведёт на другое сообщение этого сценария (action_goto_message_id)
- Событийные триггеры (\`scenario_event_triggers\`) — запускают сценарий по событию.
  - **Позитивные** (is_negative: false): сценарий стартует когда событие произошло (например, досмотрел видео — отправить оффер).
  - **Негативные** (is_negative: true): сценарий стартует если событие НЕ случилось за wait_minutes минут. Например: "начал видео, но за 3 часа не досмотрел" — event_type=video_start, cancel_on_event_type=video_complete, wait_minutes=180. Если за это время человек досмотрит — ожидание отменится автоматически.
  - Типичные воронки дожима (используй негативные триггеры):
    1. Отправили ссылку на видео → негативный триггер video_start без cancel — "не посмотрел за 1ч" → напомни
    2. Начал смотреть, но не досмотрел → video_start + cancel video_complete + 3h → "последняя часть — самое важное"
    3. Зашёл на сайт, но не купил → landing_visit + cancel order_created + 6h → работа с возражениями
    4. Создал заказ, но не оплатил → order_created + cancel order_paid + 30min → напоминание о заказе
    5. Оплатил → позитивный order_paid → поздравление + онбординг
  - \`event_params\` задают **что именно** отслеживаем — videoId / landingSlug / productId. Без них триггер сработает на ЛЮБОЕ видео/сайт/продукт, что почти никогда не нужно. Перед созданием триггера всегда вызывай \`list_project_targets\` чтобы узнать какие объекты есть и какие id использовать.

## Стиль общения
- На «ты», дружелюбно, по делу.
- Пользователь — маркетолог-практик, не разработчик. Не сыпь техническими терминами.
- Тексты сообщений для бота — показывай в цитатных блоках > или \`\`\`код\`\`\`, чтобы их было видно и удобно копировать.
- Когда предлагаешь кнопки — пиши «кнопка: «Записаться» → ссылка на лендинг», чтобы человек понимал что это.
- Когда планируешь таймер — пиши «через 2 часа после первого /start», а не «delay_minutes: 120».`

function getTools(): Anthropic.Messages.Tool[] {
  return [
    {
      name: 'read_scenario_state',
      description: 'Прочитать текущее состояние сценария: все сообщения, кнопки и событийные триггеры. Вызывай это когда нужно понять что сейчас в сценарии, перед внесением правок или для проверки после применения изменений.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
      name: 'create_message',
      description: 'Создать новое сообщение в сценарии. Используй только после явного подтверждения пользователя. is_start=true ставь только для одного сообщения в сценарии (точка входа).',
      input_schema: {
        type: 'object' as const,
        properties: {
          text: { type: 'string', description: 'Текст сообщения (может содержать эмодзи и markdown, как будет в Telegram)' },
          is_start: { type: 'boolean', description: 'true если это стартовое сообщение сценария (точка входа)' },
          trigger_word: { type: 'string', description: 'Триггерное слово для запуска (обычно /start). Только для is_start=true.' },
          order_position: { type: 'number', description: 'Позиция в списке. Если не указано — добавится в конец.' },
        },
        required: ['text'],
      },
    },
    {
      name: 'update_message',
      description: 'Обновить существующее сообщение. Используй только после явного подтверждения.',
      input_schema: {
        type: 'object' as const,
        properties: {
          message_id: { type: 'string' },
          text: { type: 'string' },
          is_start: { type: 'boolean' },
          trigger_word: { type: 'string' },
          order_position: { type: 'number' },
        },
        required: ['message_id'],
      },
    },
    {
      name: 'delete_message',
      description: 'Удалить сообщение. Используй только после явного подтверждения. Кнопки сообщения удалятся каскадно.',
      input_schema: {
        type: 'object' as const,
        properties: { message_id: { type: 'string' } },
        required: ['message_id'],
      },
    },
    {
      name: 'add_button',
      description: 'Добавить кнопку к сообщению. action_type: url (нужен action_url), trigger (нужен action_trigger_word), goto_message (нужен action_goto_message_id).',
      input_schema: {
        type: 'object' as const,
        properties: {
          message_id: { type: 'string' },
          text: { type: 'string', description: 'Текст кнопки (короткий, до 30 символов)' },
          action_type: { type: 'string', enum: ['url', 'trigger', 'goto_message'] },
          action_url: { type: 'string' },
          action_trigger_word: { type: 'string' },
          action_goto_message_id: { type: 'string' },
        },
        required: ['message_id', 'text', 'action_type'],
      },
    },
    {
      name: 'update_button',
      description: 'Обновить кнопку.',
      input_schema: {
        type: 'object' as const,
        properties: {
          button_id: { type: 'string' },
          text: { type: 'string' },
          action_type: { type: 'string', enum: ['url', 'trigger', 'goto_message'] },
          action_url: { type: 'string' },
          action_trigger_word: { type: 'string' },
          action_goto_message_id: { type: 'string' },
        },
        required: ['button_id'],
      },
    },
    {
      name: 'delete_button',
      description: 'Удалить кнопку.',
      input_schema: {
        type: 'object' as const,
        properties: { button_id: { type: 'string' } },
        required: ['button_id'],
      },
    },
    {
      name: 'list_project_targets',
      description: 'Прочитать доступные объекты проекта, на которые можно ставить триггеры: видео (id, title), лендинги (id, name, slug), продукты (id, name). Нужно перед тем как создавать триггер — чтобы понимать какие id использовать.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
      name: 'create_trigger',
      description: `Создать событийный триггер — сценарий запустится когда произойдёт событие.

ПОЗИТИВНЫЕ триггеры (is_negative: false): запускаются СРАЗУ когда событие случилось.
Типы событий:
- video_start — начал смотреть видео (event_params: { videoId })
- video_progress — досмотрел видео до X% (event_params: { videoId, minPercent })
- video_complete — досмотрел видео до конца (event_params: { videoId })
- landing_visit — зашёл на сайт (event_params: { landingSlug })
- form_submit — отправил форму (event_params: { formSlug })
- channel_joined — подписался на канал (event_params: { channelId })
- order_created — создал заказ (event_params: { productId })
- order_paid — оплатил заказ (event_params: { productId })

НЕГАТИВНЫЕ триггеры (is_negative: true): запускаются ЧЕРЕЗ wait_minutes после события event_type, ЕСЛИ за это время не произошло cancel_on_event_type.
Типичные конфигурации:
- "начал видео, но не досмотрел": event_type=video_start, cancel_on_event_type=video_complete, wait_minutes=180, event_params={ videoId }
- "зашёл на сайт, но не создал заказ": event_type=landing_visit, cancel_on_event_type=order_created, wait_minutes=360, event_params={ landingSlug }
- "создал заказ, но не оплатил": event_type=order_created, cancel_on_event_type=order_paid, wait_minutes=30, event_params={ productId }

Всегда указывай event_params когда выбираешь конкретный объект (videoId/landingSlug/productId) — иначе триггер сработает на любое видео/сайт/продукт. ID бери из list_project_targets.`,
      input_schema: {
        type: 'object' as const,
        properties: {
          event_type: { type: 'string', description: 'Тип события (см. описание)' },
          is_negative: { type: 'boolean', description: 'true = триггер "НЕ произошло", false = позитивный' },
          wait_minutes: { type: 'number', description: 'Только для is_negative=true: через сколько минут отправить дожим если отменяющее событие не случилось' },
          cancel_on_event_type: { type: 'string', description: 'Только для is_negative=true: какое событие отменяет ожидание (video_complete, order_created, order_paid и т.п.)' },
          event_params: {
            type: 'object',
            description: 'Параметры-фильтры. Ключи: videoId, landingSlug, productId, formSlug, channelId, minPercent. Пустой объект = сработает на любое событие этого типа.',
          },
          event_name: { type: 'string', description: 'Опциональное уточнение по имени события' },
          start_message_id: { type: 'string', description: 'Какое сообщение отправить когда триггер сработает' },
          label: { type: 'string', description: 'Понятное имя для UI (например "Недосмотрел видео про оффер")' },
        },
        required: ['event_type', 'start_message_id'],
      },
    },
    {
      name: 'delete_trigger',
      description: 'Удалить событийный триггер.',
      input_schema: {
        type: 'object' as const,
        properties: { trigger_id: { type: 'string' } },
        required: ['trigger_id'],
      },
    },
  ]
}

async function executeTool(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: any,
  ctx: { scenarioId: string; projectId: string; supabase: SupabaseClient },
): Promise<{ content: string; summary: string; ok: boolean; wrote: boolean }> {
  const { scenarioId, supabase } = ctx

  try {
    switch (name) {
      case 'read_scenario_state': {
        const [msgs, btns, trigs] = await Promise.all([
          supabase.from('scenario_messages').select('*').eq('scenario_id', scenarioId).order('order_position'),
          supabase.from('scenario_buttons').select('*').order('order_position'),
          supabase.from('scenario_event_triggers').select('*').eq('scenario_id', scenarioId),
        ])
        const messageIds = (msgs.data ?? []).map(m => m.id)
        const buttons = (btns.data ?? []).filter(b => messageIds.includes(b.message_id))
        return {
          content: JSON.stringify({
            messages: msgs.data ?? [],
            buttons,
            triggers: trigs.data ?? [],
          }, null, 2),
          summary: `прочитал состояние: ${messageIds.length} сообщений, ${buttons.length} кнопок, ${(trigs.data ?? []).length} триггеров`,
          ok: true,
          wrote: false,
        }
      }

      case 'create_message': {
        let pos = input.order_position
        if (pos === undefined) {
          const { data } = await supabase.from('scenario_messages').select('order_position').eq('scenario_id', scenarioId).order('order_position', { ascending: false }).limit(1)
          pos = data && data[0] ? data[0].order_position + 1 : 0
        }
        const { data, error } = await supabase.from('scenario_messages').insert({
          scenario_id: scenarioId,
          text: input.text,
          is_start: input.is_start ?? false,
          trigger_word: input.trigger_word ?? null,
          order_position: pos,
        }).select().single()
        if (error) throw error
        return { content: JSON.stringify({ id: data.id }), summary: `создал сообщение #${pos}`, ok: true, wrote: true }
      }

      case 'update_message': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updates: any = {}
        if (input.text !== undefined) updates.text = input.text
        if (input.is_start !== undefined) updates.is_start = input.is_start
        if (input.trigger_word !== undefined) updates.trigger_word = input.trigger_word
        if (input.order_position !== undefined) updates.order_position = input.order_position
        const { error } = await supabase.from('scenario_messages').update(updates).eq('id', input.message_id).eq('scenario_id', scenarioId)
        if (error) throw error
        return { content: JSON.stringify({ ok: true }), summary: `обновил сообщение`, ok: true, wrote: true }
      }

      case 'delete_message': {
        const { error } = await supabase.from('scenario_messages').delete().eq('id', input.message_id).eq('scenario_id', scenarioId)
        if (error) throw error
        return { content: JSON.stringify({ ok: true }), summary: `удалил сообщение`, ok: true, wrote: true }
      }

      case 'add_button': {
        // Verify message belongs to this scenario
        const { data: msg } = await supabase.from('scenario_messages').select('id').eq('id', input.message_id).eq('scenario_id', scenarioId).single()
        if (!msg) throw new Error('message not in this scenario')
        const { data: existing } = await supabase.from('scenario_buttons').select('order_position').eq('message_id', input.message_id).order('order_position', { ascending: false }).limit(1)
        const pos = existing && existing[0] ? existing[0].order_position + 1 : 0
        const { data, error } = await supabase.from('scenario_buttons').insert({
          message_id: input.message_id,
          text: input.text,
          action_type: input.action_type,
          action_url: input.action_url ?? null,
          action_trigger_word: input.action_trigger_word ?? null,
          action_goto_message_id: input.action_goto_message_id ?? null,
          order_position: pos,
        }).select().single()
        if (error) throw error
        return { content: JSON.stringify({ id: data.id }), summary: `добавил кнопку "${input.text}"`, ok: true, wrote: true }
      }

      case 'update_button': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updates: any = {}
        for (const k of ['text', 'action_type', 'action_url', 'action_trigger_word', 'action_goto_message_id']) {
          if (input[k] !== undefined) updates[k] = input[k]
        }
        // Verify button belongs to a message in this scenario
        const { data: btn } = await supabase.from('scenario_buttons').select('message_id').eq('id', input.button_id).single()
        if (!btn) throw new Error('button not found')
        const { data: msg } = await supabase.from('scenario_messages').select('id').eq('id', btn.message_id).eq('scenario_id', scenarioId).single()
        if (!msg) throw new Error('button not in this scenario')
        const { error } = await supabase.from('scenario_buttons').update(updates).eq('id', input.button_id)
        if (error) throw error
        return { content: JSON.stringify({ ok: true }), summary: `обновил кнопку`, ok: true, wrote: true }
      }

      case 'delete_button': {
        const { data: btn } = await supabase.from('scenario_buttons').select('message_id').eq('id', input.button_id).single()
        if (!btn) throw new Error('button not found')
        const { data: msg } = await supabase.from('scenario_messages').select('id').eq('id', btn.message_id).eq('scenario_id', scenarioId).single()
        if (!msg) throw new Error('button not in this scenario')
        const { error } = await supabase.from('scenario_buttons').delete().eq('id', input.button_id)
        if (error) throw error
        return { content: JSON.stringify({ ok: true }), summary: `удалил кнопку`, ok: true, wrote: true }
      }

      case 'list_project_targets': {
        const [vids, lands, prods] = await Promise.all([
          supabase.from('videos').select('id, title').eq('project_id', ctx.projectId),
          supabase.from('landings').select('id, name, slug').eq('project_id', ctx.projectId),
          supabase.from('products').select('id, name').eq('project_id', ctx.projectId),
        ])
        return {
          content: JSON.stringify({
            videos: vids.data ?? [],
            landings: lands.data ?? [],
            products: prods.data ?? [],
          }, null, 2),
          summary: `прочитал объекты проекта: ${(vids.data ?? []).length} видео, ${(lands.data ?? []).length} сайтов, ${(prods.data ?? []).length} продуктов`,
          ok: true,
          wrote: false,
        }
      }

      case 'create_trigger': {
        const { data: msg } = await supabase.from('scenario_messages').select('id').eq('id', input.start_message_id).eq('scenario_id', scenarioId).single()
        if (!msg) throw new Error('start_message_id not in this scenario')
        const isNegative = Boolean(input.is_negative)
        if (isNegative && !input.cancel_on_event_type) {
          throw new Error('Для негативного триггера нужен cancel_on_event_type — что отменяет ожидание')
        }
        if (isNegative && (!input.wait_minutes || input.wait_minutes <= 0)) {
          throw new Error('Для негативного триггера нужен wait_minutes > 0')
        }
        const { data, error } = await supabase.from('scenario_event_triggers').insert({
          scenario_id: scenarioId,
          start_message_id: input.start_message_id,
          event_type: input.event_type,
          event_name: input.event_name ?? null,
          is_negative: isNegative,
          wait_minutes: isNegative ? Math.floor(input.wait_minutes) : 0,
          cancel_on_event_type: isNegative ? input.cancel_on_event_type : null,
          cancel_on_event_name: isNegative ? (input.cancel_on_event_name ?? null) : null,
          event_params: input.event_params ?? {},
          label: input.label ?? null,
        }).select().single()
        if (error) throw error
        const kindLabel = isNegative ? `НЕ случилось "${input.event_type}"` : `случилось "${input.event_type}"`
        const waitSuffix = isNegative ? ` (жду ${input.wait_minutes} мин)` : ''
        return { content: JSON.stringify({ id: data.id }), summary: `создал триггер: ${kindLabel}${waitSuffix}`, ok: true, wrote: true }
      }

      case 'delete_trigger': {
        const { error } = await supabase.from('scenario_event_triggers').delete().eq('id', input.trigger_id).eq('scenario_id', scenarioId)
        if (error) throw error
        return { content: JSON.stringify({ ok: true }), summary: `удалил триггер`, ok: true, wrote: true }
      }

      default:
        return { content: JSON.stringify({ error: 'unknown tool' }), summary: `неизвестный инструмент: ${name}`, ok: false, wrote: false }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { content: JSON.stringify({ error: message }), summary: `ошибка: ${message}`, ok: false, wrote: false }
  }
}

export async function runChatbotAgent(ctx: AgentInput): Promise<AgentOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')
  const client = new Anthropic({ apiKey })

  // Reconstruct conversation: prior history + new user turn
  const conversation: ChatMessage[] = [
    ...ctx.history.map(h => ({ role: h.role, content: h.content }) as ChatMessage),
    { role: 'user', content: ctx.userMessage },
  ]

  const toolCalls: Array<{ name: string; summary: string; ok: boolean }> = []
  let changesApplied = false
  let assistantText = ''

  for (let iter = 0; iter < MAX_AGENT_ITERATIONS; iter++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: getTools(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: conversation as any,
    })

    // Record assistant turn
    conversation.push({ role: 'assistant', content: response.content })

    // Collect any text the model produced in this turn
    for (const block of response.content) {
      if (block.type === 'text') assistantText += (assistantText ? '\n\n' : '') + block.text
    }

    if (response.stop_reason !== 'tool_use') break

    // Execute each tool_use block
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue
      const res = await executeTool(block.name, block.input, {
        scenarioId: ctx.scenarioId,
        projectId: ctx.projectId,
        supabase: ctx.supabase,
      })
      if (res.wrote && res.ok) changesApplied = true
      toolCalls.push({ name: block.name, summary: res.summary, ok: res.ok })
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: res.content,
        is_error: !res.ok,
      })
    }

    conversation.push({ role: 'user', content: toolResults })
  }

  return {
    assistantText: assistantText.trim() || 'Готово.',
    toolCalls,
    changesApplied,
    history: conversation.map(m => ({ role: m.role, content: m.content })),
  }
}
