// Landing AI agent — Claude tool-use implementation.
// Scope: один конкретный лендинг. Может читать состояние, редактировать HTML
// целиком или патчами, менять метаданные, смотреть видео проекта.
// Те же правила что у chatbot-agent: UI-parity, Haiku 4.5, prompt caching,
// history trimming, auto-recovery from broken history.

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ROLE } from './knowledge/landing/role'
import { CHECKLIST } from './knowledge/landing/checklist'
import { EXAMPLES } from './knowledge/landing/examples'

const MODEL = 'claude-haiku-4-5'
const MAX_AGENT_ITERATIONS = 10
const TIMEOUT_BUDGET_MS = 45000
const MAX_HISTORY_TURNS = 12

type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: Anthropic.Messages.ContentBlock[] }
  | { role: 'user'; content: Anthropic.Messages.ToolResultBlockParam[] }

type AgentInput = {
  landingId: string
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

const EXAMPLES_BLOCK = EXAMPLES.length === 0 ? '' : `

## 📚 Образцовые лендинги — копируй стиль

${EXAMPLES.map((ex, i) => `### Пример ${i + 1}: ${ex.niche}
**Цель:** ${ex.goal}
${ex.why_it_works ? `\n**Почему работает:** ${ex.why_it_works}\n` : ''}
\`\`\`html
${ex.html}
\`\`\``).join('\n\n---\n\n')}
`

const SYSTEM_PROMPT = `${ROLE}

${CHECKLIST}
${EXAMPLES_BLOCK}

---

## Твоя роль в платформе Studency

Ты AI-агент **одного** лендинга. Не знаешь и не трогаешь остальные лендинги, воронки, ботов проекта.

## ⛔ UI-parity

Делаешь только то, что юзер может сам в редакторе лендинга:
- Редактировать HTML (целиком или точечно)
- Менять имя, slug, мета-теги, статус (draft / published)
- Связывать с воронкой / стадией
- Вставлять шорткоды видео \`{{video:UUID}}\`

Не умеешь и не пытаешься: создавать новые лендинги, удалять, менять другие лендинги, трогать схему БД, менять домен без UI.

Если просят невозможное («запусти A/B тест», «подключи пиксель Google Ads», «добавь модуль оплаты прямо сейчас») — честно откажись и предложи альтернативу.

## Регламент

0. **Сначала всегда прочитай текущее состояние лендинга** через \`read_landing_state\` — чтобы править относительно реального HTML, а не придумывать с нуля.
1. Если задача непонятна — уточни (какая ЦА, оффер, цель). По 1-2 вопроса за раз.
2. **Предложи план изменений в чате** (какой блок добавить/переписать). Дождись «да/делай».
3. Только после явного подтверждения вызывай write-инструменты.

## 🎯 Стратегия редактирования

**Точечные правки** (изменить заголовок, переписать абзац, поменять CTA) — через \`apply_html_patch\` с find/replace. НЕ переписывай весь HTML ради одной строки — сломаешь другое.

**Крупные изменения** (добавить новый блок, полная перестройка) — через \`update_landing_html\` (полная замена). Предварительно ОБЯЗАТЕЛЬНО прочти текущий HTML через \`read_landing_state\` и держи в голове что не ломаешь.

## 🚨 Режим исполнения

После «да / делай / применяй / погнали»:
1. Следующий ответ = вызов write-инструмента, без долгих вступлений.
2. Максимум 3-5 tool calls за ход (у тебя 45 секунд до таймаута).
3. После каждой правки кратко резюмируй что изменил.
4. Если правка большая (>4 отдельных блоков) — делай порциями, скажи «первые 3 применил, скажи «продолжай» для остальных».

## Стиль общения

На «ты», без тех-жаргона. Пользователь — маркетолог, не фронтендер. Показывай куски HTML в \`\`\`html код-блоках\`\`\` когда обсуждаешь. Не вываливай весь HTML без просьбы.`

function getTools(): Anthropic.Messages.Tool[] {
  return [
    {
      name: 'read_landing_state',
      description: 'Прочитать текущее состояние лендинга: весь HTML, имя, slug, мета-теги, статус, связь с воронкой. Вызывай перед любой правкой — чтобы видеть актуальный код.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
      name: 'update_landing_html',
      description: 'Полностью заменить HTML лендинга. Используй когда делаешь крупные изменения (перестройка всей страницы, добавление нескольких блоков разом). Для маленьких правок используй apply_html_patch — безопаснее.',
      input_schema: {
        type: 'object' as const,
        properties: {
          html_content: { type: 'string', description: 'Полный HTML лендинга (с Tailwind классами, shortcode-ами {{video:UUID}} если есть)' },
        },
        required: ['html_content'],
      },
    },
    {
      name: 'apply_html_patch',
      description: 'Точечная правка HTML: найти подстроку и заменить на новую. Безопасно для небольших изменений. Если find встречается >1 раза — ошибка (чтобы не поломать случайно). Для таких случаев передавай больше контекста вокруг.',
      input_schema: {
        type: 'object' as const,
        properties: {
          find: { type: 'string', description: 'Точная подстрока которую ищем (с окружающим контекстом для уникальности)' },
          replace: { type: 'string', description: 'Чем заменить. Передай пустую строку чтобы удалить фрагмент.' },
        },
        required: ['find', 'replace'],
      },
    },
    {
      name: 'update_landing_meta',
      description: 'Обновить метаданные лендинга: name, slug, meta_title, meta_description, status (draft/published), funnel_id, funnel_stage_id. Передавай только те поля которые меняешь.',
      input_schema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string' },
          slug: { type: 'string', description: 'URL-slug (латиница, дефисы, без пробелов)' },
          meta_title: { type: 'string', description: 'SEO title (до 60 символов)' },
          meta_description: { type: 'string', description: 'SEO description (до 160 символов)' },
          status: { type: 'string', enum: ['draft', 'published'], description: 'draft — черновик, published — опубликован' },
          funnel_id: { type: 'string', description: 'UUID воронки к которой привязать (null чтобы отвязать)' },
          funnel_stage_id: { type: 'string', description: 'UUID стадии воронки' },
        },
      },
    },
    {
      name: 'list_project_videos',
      description: 'Список видео проекта — чтобы узнать UUID для вставки шорткода {{video:UUID}} в HTML лендинга.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
  ]
}

async function executeTool(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: any,
  ctx: { landingId: string; projectId: string; supabase: SupabaseClient },
): Promise<{ content: string; summary: string; ok: boolean; wrote: boolean }> {
  const { landingId, projectId, supabase } = ctx

  try {
    switch (name) {
      case 'read_landing_state': {
        const { data, error } = await supabase
          .from('landings')
          .select('id, name, slug, html_content, status, meta_title, meta_description, funnel_id, funnel_stage_id, project_id')
          .eq('id', landingId)
          .single()
        if (error || !data) throw new Error(`read landing: ${error?.message}`)
        if (data.project_id !== projectId) throw new Error('landing not in this project')
        return {
          content: JSON.stringify(data, null, 2),
          summary: `прочитал лендинг «${data.name}» (${data.status ?? 'draft'})`,
          ok: true, wrote: false,
        }
      }

      case 'update_landing_html': {
        const { error } = await supabase
          .from('landings')
          .update({ html_content: input.html_content, updated_at: new Date().toISOString() })
          .eq('id', landingId)
          .eq('project_id', projectId)
        if (error) throw error
        return {
          content: JSON.stringify({ ok: true }),
          summary: `заменил весь HTML (${input.html_content.length} символов)`,
          ok: true, wrote: true,
        }
      }

      case 'apply_html_patch': {
        const { data: cur, error: e1 } = await supabase
          .from('landings').select('html_content').eq('id', landingId).eq('project_id', projectId).single()
        if (e1 || !cur) throw new Error(`read for patch: ${e1?.message}`)
        const html = cur.html_content ?? ''
        const find = String(input.find ?? '')
        if (!find) throw new Error('find пустой')
        const firstIdx = html.indexOf(find)
        if (firstIdx < 0) throw new Error(`подстрока не найдена: "${find.slice(0, 40)}..."`)
        const secondIdx = html.indexOf(find, firstIdx + 1)
        if (secondIdx >= 0) throw new Error('подстрока встречается больше одного раза — передай больше контекста для уникальности')
        const replaced = html.slice(0, firstIdx) + String(input.replace ?? '') + html.slice(firstIdx + find.length)
        const { error } = await supabase
          .from('landings')
          .update({ html_content: replaced, updated_at: new Date().toISOString() })
          .eq('id', landingId)
          .eq('project_id', projectId)
        if (error) throw error
        return {
          content: JSON.stringify({ ok: true, new_length: replaced.length }),
          summary: `применил патч HTML (${String(input.replace ?? '').length - find.length >= 0 ? '+' : ''}${String(input.replace ?? '').length - find.length} симв.)`,
          ok: true, wrote: true,
        }
      }

      case 'update_landing_meta': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updates: any = { updated_at: new Date().toISOString() }
        for (const k of ['name', 'slug', 'meta_title', 'meta_description', 'status', 'funnel_id', 'funnel_stage_id']) {
          if (input[k] !== undefined) updates[k] = input[k]
        }
        if (Object.keys(updates).length <= 1) throw new Error('нет полей для обновления')
        const { error } = await supabase
          .from('landings')
          .update(updates)
          .eq('id', landingId)
          .eq('project_id', projectId)
        if (error) throw error
        const changed = Object.keys(updates).filter(k => k !== 'updated_at').join(', ')
        return {
          content: JSON.stringify({ ok: true }),
          summary: `обновил мета: ${changed}`,
          ok: true, wrote: true,
        }
      }

      case 'list_project_videos': {
        const { data } = await supabase.from('videos').select('id, title').eq('project_id', projectId)
        return {
          content: JSON.stringify({ videos: data ?? [] }, null, 2),
          summary: `прочитал видео: ${(data ?? []).length}`,
          ok: true, wrote: false,
        }
      }

      default:
        return { content: JSON.stringify({ error: 'unknown tool' }), summary: `неизвестный инструмент: ${name}`, ok: false, wrote: false }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { content: JSON.stringify({ error: message }), summary: `ошибка: ${message}`, ok: false, wrote: false }
  }
}

export async function runLandingAgent(ctx: AgentInput): Promise<AgentOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')
  const client = new Anthropic({ apiKey })

  const rawHistory = ctx.history.map(h => ({ role: h.role, content: h.content }) as ChatMessage)
  let trimmedHistory = rawHistory
  if (rawHistory.length > MAX_HISTORY_TURNS) {
    const wantFrom = rawHistory.length - MAX_HISTORY_TURNS
    let safeStart = -1
    for (let i = wantFrom; i < rawHistory.length; i++) {
      const m = rawHistory[i]
      if (m.role === 'user' && typeof m.content === 'string') {
        safeStart = i
        break
      }
    }
    if (safeStart >= 0) trimmedHistory = rawHistory.slice(safeStart)
  }
  const conversation: ChatMessage[] = [
    ...trimmedHistory,
    { role: 'user', content: ctx.userMessage },
  ]

  const toolCalls: Array<{ name: string; summary: string; ok: boolean }> = []
  let changesApplied = false
  let assistantText = ''
  const startedAt = Date.now()
  let timedOut = false

  for (let iter = 0; iter < MAX_AGENT_ITERATIONS; iter++) {
    if (Date.now() - startedAt > TIMEOUT_BUDGET_MS) {
      timedOut = true
      console.warn(`[landing-agent] timeout budget exceeded at iter=${iter}`)
      break
    }

    let response: Anthropic.Messages.Message
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: getTools().map((t, i, arr) => i === arr.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: conversation as any,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[landing-agent] anthropic api error at iter=${iter}:`, msg)
      const isBrokenHistory = /tool_use.*tool_result|invalid_request_error/i.test(msg)
      if (isBrokenHistory && iter === 0 && conversation.length > 1) {
        console.warn('[landing-agent] rebuilding conversation from scratch')
        conversation.length = 0
        conversation.push({ role: 'user', content: ctx.userMessage })
        iter--
        continue
      }
      assistantText += (assistantText ? '\n\n' : '') + `⚠️ Anthropic API вернул ошибку: ${msg}.`
      break
    }

    conversation.push({ role: 'assistant', content: response.content })

    for (const block of response.content) {
      if (block.type === 'text') assistantText += (assistantText ? '\n\n' : '') + block.text
    }

    if (response.stop_reason === 'max_tokens') {
      assistantText += (assistantText ? '\n\n' : '') + '✂️ Ответ обрезан — напиши «продолжай» чтобы я закончил.'
      break
    }

    if (response.stop_reason !== 'tool_use') break

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue
      const res = await executeTool(block.name, block.input, {
        landingId: ctx.landingId,
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

  if (timedOut) {
    assistantText += (assistantText ? '\n\n' : '') + `⏱ Не успел доделать за один заход. Часть изменений могла примениться — посмотри в редакторе. Напиши «продолжай» чтобы дозаписать остальное.`
  }

  return {
    assistantText: assistantText.trim() || 'Готово.',
    toolCalls,
    changesApplied,
    history: conversation.map(m => ({ role: m.role, content: m.content })),
  }
}
