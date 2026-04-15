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
- **Триггеры событий** — это группы, создаются атомарно через \`create_trigger_group\`. Одна группа = одно событие + (опционально) immediate-сообщение «если случилось» + (опционально) N дожимов «если НЕ случилось за время». Дожимы привязаны к тому же событию и параметрам что и immediate.
  - \`has_immediate: true\` — создастся сообщение которое бот шлёт СРАЗУ когда событие произошло
  - \`followups: [{wait_value, wait_unit}, ...]\` — массив дожимов, каждый со своим таймингом (unit: sec/min/hour/day). Отменяющее событие автоматом определяется по event_type (video_start→video_complete, landing_visit→order_created, order_created→order_paid). Для video_complete/order_paid/form_submit/channel_joined дожимов нет — это финальные события.
  - \`event_params\`: { videoId, landingSlug, productId, formSlug, channelId, minPercent } — ВСЕГДА указывай конкретный объект (id берёшь из list_project_targets), иначе триггер сработает на любой объект этого типа.
  - Тексты сообщений пустые при создании. После \`create_trigger_group\` получаешь массив \`message_ids\` — дальше наполняешь текстом через \`update_message\` и добавляешь кнопки через \`add_button\`.
  - Типичные воронки дожима:
    1. Началсмотреть видео, не досмотрел за 3ч → event_type=video_start, followups=[{value:3, unit:'hour'}]
    2. Зашёл на сайт, не купил за 6ч → event_type=landing_visit, followups=[{value:6, unit:'hour'}]
    3. Создал заказ, не оплатил за 30мин → event_type=order_created, followups=[{value:30, unit:'min'}]
    4. Оплатил → event_type=order_paid, has_immediate=true, followups=[] (только поздравление)
    5. Длинная дожимная серия: followups=[{value:1, unit:'hour'}, {value:3, unit:'hour'}, {value:1, unit:'day'}, {value:3, unit:'day'}, {value:7, unit:'day'}]
  - Перед созданием триггера ВСЕГДА вызывай \`list_project_targets\` чтобы узнать какие видео/лендинги/продукты есть и какие id использовать.
  - Удалить триггер целиком → \`delete_trigger_group\`. Временно выключить секцию без удаления сообщений → \`toggle_trigger_section\`.

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
      name: 'create_trigger_group',
      description: `Создать триггер событий (группу). Триггер = одно событие + опционально immediate сообщение ("если случилось") + опционально N дожимов ("если НЕ случилось за время").

АТОМАРНО создаёт сразу всю группу: сообщения (пустые, пользователь/ты наполнишь через update_message/add_button) + записи триггеров. Возвращает group_id и список созданных message_id в порядке: [immediate?, followup1, followup2, ...].

ТИПЫ СОБЫТИЙ:
- video_start — начал смотреть видео (event_params: { videoId })
- video_progress — досмотрел до X% (event_params: { videoId, minPercent })
- video_complete — досмотрел до конца (event_params: { videoId })
- landing_visit — зашёл на лендинг (event_params: { landingSlug })
- form_submit — отправил форму (event_params: { formSlug })
- channel_joined — подписался на канал (event_params: { channelId })
- order_created — создал заказ (event_params: { productId })
- order_paid — оплатил заказ (event_params: { productId })

ДОЖИМЫ (followups) — работают только для событий у которых есть отменяющее:
- video_start / video_progress → отменяет video_complete
- landing_visit → отменяет order_created
- order_created → отменяет order_paid
Для video_complete / order_paid / form_submit / channel_joined дожимов нет (не с чем отменять).

ВРЕМЯ ОЖИДАНИЯ: для каждого дожима — { value: N, unit: 'sec'|'min'|'hour'|'day' }. Если юзер сказал "через 3 часа" — value=3 unit='hour'.

ID объектов всегда бери из list_project_targets. Имя (label) — человекочитаемое, понятное маркетологу.`,
      input_schema: {
        type: 'object' as const,
        properties: {
          label: { type: 'string', description: 'Понятное имя триггера (напр. "Не досмотрел видео про оффер")' },
          event_type: { type: 'string', description: 'Тип события — один из указанных' },
          event_params: {
            type: 'object',
            description: 'Параметры: { videoId, landingSlug, productId, formSlug, channelId, minPercent }. Пустой объект — сработает на любое событие этого типа.',
          },
          has_immediate: { type: 'boolean', description: 'Создавать ли immediate-сообщение (enabled=true). По умолчанию true' },
          followups: {
            type: 'array',
            description: 'Массив дожимов. Пустой — дожимов нет. Игнорируется для финальных событий (video_complete, order_paid, form_submit, channel_joined).',
            items: {
              type: 'object',
              properties: {
                wait_value: { type: 'number' },
                wait_unit: { type: 'string', enum: ['sec', 'min', 'hour', 'day'] },
              },
              required: ['wait_value', 'wait_unit'],
            },
          },
        },
        required: ['label', 'event_type', 'event_params'],
      },
    },
    {
      name: 'delete_trigger_group',
      description: 'Удалить триггер-группу целиком со всеми её сообщениями и дожимами.',
      input_schema: {
        type: 'object' as const,
        properties: { group_id: { type: 'string' } },
        required: ['group_id'],
      },
    },
    {
      name: 'toggle_trigger_section',
      description: 'Включить/выключить секцию триггера (immediate или все followups группы) без удаления сообщений.',
      input_schema: {
        type: 'object' as const,
        properties: {
          group_id: { type: 'string' },
          section: { type: 'string', enum: ['immediate', 'followups'] },
          enabled: { type: 'boolean' },
        },
        required: ['group_id', 'section', 'enabled'],
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

      case 'create_trigger_group': {
        const CANCEL_MAP: Record<string, string> = {
          video_start: 'video_complete',
          video_progress: 'video_complete',
          landing_visit: 'order_created',
          order_created: 'order_paid',
        }
        const UNIT_MIN: Record<string, number> = { sec: 1 / 60, min: 1, hour: 60, day: 1440 }

        const eventType = String(input.event_type)
        const cancelOn = CANCEL_MAP[eventType] ?? null
        const params = input.event_params ?? {}
        const label = String(input.label)
        const hasImmediate = input.has_immediate !== false
        const followups: Array<{ wait_value: number; wait_unit: string }> = Array.isArray(input.followups) ? input.followups : []

        // supports_followups check
        if (followups.length > 0 && !cancelOn) {
          throw new Error(`Для события "${eventType}" дожимы не предусмотрены — оно финальное`)
        }

        const groupId = crypto.randomUUID()
        const createdMessageIds: string[] = []
        let sort = 0

        async function insertTriggerMessage(isNegative: boolean, waitValue: number, waitUnit: string): Promise<string | null> {
          const { data: m, error: mErr } = await supabase.from('scenario_messages').insert({
            scenario_id: scenarioId,
            parent_trigger_group_id: groupId,
            text: '',
            is_start: false,
            order_position: sort,
          }).select('id').single()
          if (mErr || !m) throw new Error(`insert message: ${mErr?.message}`)

          const waitMinutes = isNegative ? Math.max(1, Math.round(waitValue * (UNIT_MIN[waitUnit] ?? 1))) : 0
          const { error: tErr } = await supabase.from('scenario_event_triggers').insert({
            scenario_id: scenarioId,
            start_message_id: m.id,
            event_type: eventType,
            event_params: params,
            is_negative: isNegative,
            enabled: true,
            wait_value: isNegative ? waitValue : 0,
            wait_unit: isNegative ? waitUnit : 'min',
            wait_minutes: waitMinutes,
            cancel_on_event_type: isNegative ? cancelOn : null,
            label,
            group_id: groupId,
            sort_in_group: sort,
          })
          if (tErr) throw new Error(`insert trigger: ${tErr.message}`)
          sort++
          return m.id
        }

        if (hasImmediate) {
          const id = await insertTriggerMessage(false, 0, 'min')
          if (id) createdMessageIds.push(id)
        }
        for (const fu of followups) {
          const id = await insertTriggerMessage(true, Number(fu.wait_value), String(fu.wait_unit))
          if (id) createdMessageIds.push(id)
        }

        return {
          content: JSON.stringify({ group_id: groupId, message_ids: createdMessageIds }),
          summary: `создал триггер "${label}"${hasImmediate ? ' · сразу' : ''}${followups.length > 0 ? ` · ${followups.length} дожимов` : ''}`,
          ok: true, wrote: true,
        }
      }

      case 'delete_trigger_group': {
        await supabase.from('scenario_event_triggers').delete().eq('scenario_id', scenarioId).eq('group_id', input.group_id)
        await supabase.from('scenario_messages').delete().eq('scenario_id', scenarioId).eq('parent_trigger_group_id', input.group_id)
        return { content: JSON.stringify({ ok: true }), summary: `удалил триггер-группу`, ok: true, wrote: true }
      }

      case 'toggle_trigger_section': {
        const isNegative = input.section === 'followups'
        const { error } = await supabase.from('scenario_event_triggers')
          .update({ enabled: Boolean(input.enabled) })
          .eq('scenario_id', scenarioId)
          .eq('group_id', input.group_id)
          .eq('is_negative', isNegative)
        if (error) throw error
        return { content: JSON.stringify({ ok: true }), summary: `${input.enabled ? 'включил' : 'выключил'} секцию ${input.section}`, ok: true, wrote: true }
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
