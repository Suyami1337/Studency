// Landing AI agent — Claude tool-use implementation.
// Scope: один конкретный лендинг. Может читать состояние, редактировать HTML
// целиком или патчами, менять метаданные, смотреть видео проекта.
// Те же правила что у chatbot-agent: UI-parity, Haiku 4.5, prompt caching,
// history trimming, auto-recovery from broken history.

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { ROLE } from './knowledge/landing/role'
import { CHECKLIST } from './knowledge/landing/checklist'
import { EXAMPLES } from './knowledge/landing/examples'
import { wrapLegacyHtmlAsBlock } from '../landing-blocks'

// ─── base64-картинки в html_content ───────────────────────────────────────
// Импортированные шаблоны (Лендинг.html / Урок 2.html) содержат картинки
// инлайн как data:image/...;base64,<огромная-строка>. Один такой блок
// HTML занимает 1.6+ MB и пробивает лимит контекста Claude (200K токенов).
// Решение:
//  - На read_block: заменяем base64 на короткий плейсхолдер (hash от данных)
//  - На update_block: восстанавливаем плейсхолдеры обратно из БД-снапшота
const B64_RE = /data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)/g

function redactBase64Images(html: string): { redacted: string; count: number } {
  let count = 0
  const redacted = html.replace(B64_RE, (_, mime, b64) => {
    count++
    const hash = crypto.createHash('sha1').update(b64 as string).digest('hex').slice(0, 12)
    return `data:image/${mime};base64,__B64_${hash}__`
  })
  return { redacted, count }
}

/** Восстанавливаем base64 картинки в новом HTML из старого (по hash в плейсхолдере). */
function restoreBase64FromOld(newHtml: string, oldHtml: string): string {
  // Соберём mapping hash → реальный base64 из старого html
  const map = new Map<string, string>()
  const oldMatches = oldHtml.matchAll(B64_RE)
  for (const m of oldMatches) {
    const b64 = m[2]
    const hash = crypto.createHash('sha1').update(b64).digest('hex').slice(0, 12)
    if (!map.has(hash)) map.set(hash, b64)
  }
  // Заменяем плейсхолдеры в новом html на реальный base64
  return newHtml.replace(/data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,__B64_([a-f0-9]{12})__/g, (full, mime, hash) => {
    const real = map.get(hash)
    return real ? `data:image/${mime};base64,${real}` : full
  })
}

/** Алиас для единообразия имени в этом файле */
const wrapLegacyHtmlAsBlockForAgent = wrapLegacyHtmlAsBlock

const MODEL = 'claude-haiku-4-5'
const MAX_AGENT_ITERATIONS = 10
const TIMEOUT_BUDGET_MS = 45000
const MAX_HISTORY_TURNS = 40
const MAX_OUTPUT_TOKENS = 32768  // Haiku 4.5 поддерживает до 64k output, 32k с большим запасом

type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: Anthropic.Messages.ContentBlock[] }
  | { role: 'user'; content: Anthropic.Messages.ToolResultBlockParam[] }

type AgentInput = {
  landingId: string
  projectId: string
  history: Array<{ role: 'user' | 'assistant'; content: unknown }>
  userMessage: string
  /** data URL картинок от юзера (`data:image/png;base64,...`). Добавятся в текущую user-message блоками type:'image'. */
  attachments?: string[]
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

Лендинг состоит из **БЛОКОВ**. Каждый блок — отдельная секция страницы (Hero, Текст, Видео, CTA, Картинка, Кастомный HTML, Zero-блок). У каждого:
- своё имя и тип
- свой контент (структурированный для типизированных, HTML для custom_html)
- отдельные стили для **desktop** и **mobile** (mobile попадает в \`@media (max-width: 640px)\`)
- лейаут: паддинги, max-width, цвет фона, скрыть на моб/десктопе

**Правки одного блока не ломают соседние.** Это самое важное — работай точечно, по блокам.

## ⛔ UI-parity — что юзер может сам в редакторе и как ты делаешь то же

Юзер открывает блочный редактор (Tilda-style canvas с pan/zoom). Внутри он умеет ВСЁ перечисленное ниже — и ты должен уметь сделать то же через тулы. Соответствие действий UI → тулов:

**Структура страницы**
- Юзер: добавил/удалил/переставил блок → ты: \`create_block\` / \`delete_block\` / \`reorder_blocks\`
- Юзер: скрыл блок → ты: \`update_block(is_hidden: true)\`
- Юзер: поменял имя блока → ты: \`update_block(name)\`

**Контент типизированных блоков (hero/text/image/video/cta)**
- Юзер: правит заголовки/тексты/CTA в правой панели → ты: \`update_block(content: {...})\`
- Юзер: вставил видео → ты: \`{{video:UUID}}\` шорткод (UUID из \`list_project_videos\`) либо \`content: { videoId }\` для блока video

**Контент custom_html и zero блоков**
- Юзер: правит элементы напрямую (двойной клик, правая панель, drag/resize) → ты: \`update_block(html_content)\` для custom_html, или \`update_block(content: { zeroItems: [...] })\` для zero

**Стили любого элемента (правая панель «Настройки» в редакторе)**
Юзер видит контролы: Position, Width, Height, Font size, Text color, Background, Padding, Margin, Border-radius, Opacity, Z-index, для ссылок — URL.
Ты делаешь это через \`desktop_styles\` (или \`mobile_styles\` для мобилки):
\`\`\`json
{
  "&":           { "background": "#0a0a0a", "padding": "60px 0" },
  "h1":          { "font-size": "54px", "color": "#fff", "margin-bottom": "16px" },
  ".cta-button": { "background": "#6A55F8", "color": "#fff", "padding": "14px 32px", "border-radius": "8px", "opacity": "1" },
  ".badge":      { "position": "absolute", "top": "20px", "left": "40px", "z-index": "10" }
}
\`\`\`
Для z-index не забывай про \`position: relative\` (или absolute), иначе z-index не работает.

**Свободное позиционирование элементов (drag/resize в редакторе)**
Когда юзер тянет элемент по canvas, в DOM пишется \`position: absolute; left: Xpx; top: Ypx; width: Wpx; height: Hpx\`. Ты делаешь то же через \`desktop_styles\` для нужного селектора.

**Слои (front/back/top/bottom кнопки)**
Юзер двигает элемент по слоям → меняется \`z-index\`. Ты: \`desktop_styles: { ".element": { "position": "relative", "z-index": "999" } }\`.

**Группировка (Cmd+G в редакторе)**
Юзер выделил несколько элементов и сгруппировал → они оборачиваются в \`<div data-stud-group>\`. Для custom_html/zero блоков ты можешь делать то же в html_content вручную, если просят.

**Добавление элементов внутрь блока (Quick-add: текст / картинка / кнопка / фигура)**
В custom_html ты добавляешь нужный HTML-фрагмент в \`html_content\`. В hero/text/image/video/cta типизированных — нужный элемент уже определён схемой контента, добавлять туда новые элементы нельзя (если нужно — конвертируй блок в custom_html).

**Метаданные лендинга**
Юзер меняет имя/slug/SEO/статус/воронку → ты: \`update_landing_meta\`.

**Чего ты НЕ делаешь:**
- Не трогаешь: другие лендинги, другие проекты, схему БД, биллинг.
- Не используешь pan/zoom/multi-select/box-select редактора — это UI для человека, тебе они не нужны: ты пишешь нужный CSS прямо в \`desktop_styles\`.

## Регламент работы

1. **Начинай с обсуждения структуры.** Если задача «сделай лендинг» / «переделай» — сначала обсуди с юзером **список блоков** (сколько, какие, в каком порядке, за что каждый отвечает). Только после его ОК — верстай блок за блоком.
2. **Никогда не делай правку без чтения актуального состояния.** Сначала \`list_blocks\` для контекста, потом \`read_block\` на конкретный.
3. **Работай с одним блоком за раз.** Не создавай несколько блоков одним ходом без явного ОК юзера — он может захотеть поправить первый прежде чем продолжать.
4. Жди явного «да / делай / поехали» перед вызовом write-инструментов.
5. После каждой правки кратко резюмируй что изменил — 1-2 строки.

## 🎯 Инструменты

**Чтение:**
- \`list_blocks\` — список блоков лендинга (id, имя, тип, порядок) + мета лендинга
- \`read_block(id)\` — детали конкретного блока: контент, стили, лейаут

**Запись (ПО БЛОКАМ — не пытайся менять весь лендинг одной операцией):**
- \`update_block(id, patches)\` — правки одного блока. Передавай только изменяемые поля (content, desktop_styles, mobile_styles, layout, name, html_content, is_hidden).
- \`create_block\` — добавить новый блок (указывай after_block_id чтобы вставить после конкретного).
- \`delete_block(id)\` — удалить
- \`reorder_blocks(ids)\` — задать новый порядок (передавай массив всех id в нужной последовательности).
- \`update_landing_meta\` — мета лендинга (имя, slug, seo, status).

**Утилиты:**
- \`list_project_videos\` — UUID видео для вставки шорткодов \`{{video:UUID}}\`

## Структура блока (content + styles)

### content (зависит от block_type)
- **hero**: \`{ headline, subheadline, ctaText, ctaUrl }\`
- **text**: \`{ text }\` — HTML строка с возможной inline-разметкой (<b>, <i>, <span>)
- **image**: \`{ src, alt }\`
- **video**: \`{ videoId }\` — UUID из \`list_project_videos\`
- **cta**: \`{ buttonText, buttonUrl }\`
- **custom_html**: не используется, HTML в html_content поле
- **zero**: \`{ zeroItems: [{ id, type, x, y, width, height, content, style? }] }\`

### desktop_styles / mobile_styles
Формат \`{ "селектор": { "css-property": "value" } }\`. Селекторы относительно блока:
- \`"&"\` — сам блок (применится к \`.block-<id>\`)
- \`"h1"\`, \`".hero-cta"\`, \`"img"\` — относительно блока
- Любой валидный CSS

Примеры:
\`\`\`json
{ "&": { "background": "#060418" }, "h1": { "font-size": "54px", "color": "#fff" } }
\`\`\`
Mobile-стили ТЕ ЖЕ селекторы, но применятся только на экранах ≤ 640px.

### layout
\`{ paddingY, maxWidth, align, bgColor, bgImage, hideOnMobile, hideOnDesktop, mobile: { paddingY, maxWidth, align } }\`

## Шорткоды видео

В \`content.text\` / \`html_content\` можно вставить \`{{video:UUID}}\` — на публичной странице заменится на iframe Kinescope. Чтобы узнать UUID видео — \`list_project_videos\`.

## Стиль общения

На «ты», без тех-жаргона. Пользователь — маркетолог, не фронтендер. Когда обсуждаешь структуру — показывай списком блоков («1. Hero, 2. Видео, 3. 3 преимущества, 4. Отзывы, 5. CTA»). Когда правишь — коротко скажи что поменял в каком блоке.`

function getTools(): Anthropic.Messages.Tool[] {
  return [
    {
      name: 'list_blocks',
      description: 'Список всех блоков лендинга (id, имя, тип, порядок, is_hidden) + мета лендинга (name, slug, status). Начинай любую задачу с этого — чтобы видеть актуальную структуру.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
      name: 'read_block',
      description: 'Полные детали одного блока: content, html_content (если custom_html), desktop_styles, mobile_styles, layout. Вызывай перед update_block чтобы не затереть существующие правки.',
      input_schema: {
        type: 'object' as const,
        properties: {
          block_id: { type: 'string', description: 'UUID блока из list_blocks' },
        },
        required: ['block_id'],
      },
    },
    {
      name: 'update_block',
      description: 'Точечно обновить один блок. Передавай ТОЛЬКО изменяемые поля — остальные сохранятся. Правки этого блока не затронут соседние.',
      input_schema: {
        type: 'object' as const,
        properties: {
          block_id: { type: 'string', description: 'UUID блока' },
          name: { type: 'string', description: 'Человеко-читаемое имя блока' },
          block_type: { type: 'string', enum: ['custom_html', 'hero', 'text', 'image', 'video', 'cta', 'zero'] },
          html_content: { type: 'string', description: 'Для custom_html — сырой HTML блока' },
          content: {
            type: 'object',
            description: 'Структурированный контент типизированного блока. Для hero: { headline, subheadline, ctaText, ctaUrl }. Для text: { text }. Для image: { src, alt }. Для video: { videoId }. Для cta: { buttonText, buttonUrl }.',
          },
          desktop_styles: {
            type: 'object',
            description: 'CSS override для десктопа: { "селектор": { "css-prop": "value" } }. Селектор "&" — сам блок. Примеры: { "&": { "background": "#000" }, "h1": { "font-size": "54px", "color": "#fff" } }',
          },
          mobile_styles: {
            type: 'object',
            description: 'Тот же формат что desktop_styles, но правила попадут в @media (max-width: 640px). Используй ТОЛЬКО для отличий на мобилке — что одинаково на обоих, пиши в desktop_styles.',
          },
          layout: {
            type: 'object',
            description: 'Лейаут блока. Поля: paddingY (число px), maxWidth (число px), align (left/center/right), bgColor (#hex), bgImage (URL), hideOnMobile (boolean), hideOnDesktop (boolean), mobile: { paddingY, maxWidth, align }',
          },
          is_hidden: { type: 'boolean', description: 'Временно скрыть блок без удаления' },
        },
        required: ['block_id'],
      },
    },
    {
      name: 'create_block',
      description: 'Создать новый блок. Можно вставить после указанного (after_block_id), иначе добавится в конец. После создания сразу вызови update_block если хочешь наполнить контентом.',
      input_schema: {
        type: 'object' as const,
        properties: {
          block_type: { type: 'string', enum: ['custom_html', 'hero', 'text', 'image', 'video', 'cta', 'zero'] },
          name: { type: 'string' },
          after_block_id: { type: 'string', description: 'UUID блока после которого вставить. Если опущено — в конец.' },
          content: { type: 'object', description: 'Начальный контент (по той же схеме что в update_block)' },
          html_content: { type: 'string' },
          layout: { type: 'object' },
        },
        required: ['block_type'],
      },
    },
    {
      name: 'delete_block',
      description: 'Удалить блок. Необратимо.',
      input_schema: {
        type: 'object' as const,
        properties: {
          block_id: { type: 'string' },
        },
        required: ['block_id'],
      },
    },
    {
      name: 'reorder_blocks',
      description: 'Задать новый порядок всех блоков. Передавай массив UUID в нужной последовательности — получишь весь список переставленным.',
      input_schema: {
        type: 'object' as const,
        properties: {
          ids: { type: 'array', items: { type: 'string' }, description: 'Массив UUID блоков в целевом порядке' },
        },
        required: ['ids'],
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
          status: { type: 'string', enum: ['draft', 'published'] },
          funnel_id: { type: 'string' },
          funnel_stage_id: { type: 'string' },
        },
      },
    },
    {
      name: 'list_project_videos',
      description: 'Список видео проекта — чтобы узнать UUID для вставки шорткода {{video:UUID}} или для content.videoId в блоке video.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
  ]
}

/**
 * Строит content для user-message: если нет картинок — просто строка,
 * если есть — массив блоков [text, image, image...]. Пустой text пропускается.
 * Anthropic image API: { type: 'image', source: { type: 'base64', media_type, data } }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildUserMessageContent(text: string, attachments?: string[]): any {
  if (!attachments || attachments.length === 0) return text
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = []
  if (text && text.trim()) blocks.push({ type: 'text', text })
  for (const url of attachments) {
    const parsed = parseDataUrl(url)
    if (!parsed) continue
    blocks.push({
      type: 'image',
      source: { type: 'base64', media_type: parsed.mediaType, data: parsed.data },
    })
  }
  // Если вообще ни одной картинки не удалось распарсить и text пуст — вернём пустой text,
  // чтобы API не ругнулся на пустой content-массив.
  if (blocks.length === 0) return text || ' '
  return blocks
}

function parseDataUrl(url: string): { mediaType: string; data: string } | null {
  // data:image/png;base64,iVBOR...
  const m = /^data:([^;,]+);base64,(.*)$/.exec(url)
  if (!m) return null
  const mediaType = m[1]
  if (!/^image\/(png|jpeg|jpg|gif|webp)$/i.test(mediaType)) return null
  return { mediaType: mediaType.toLowerCase(), data: m[2] }
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
      case 'list_blocks': {
        const { data: l } = await supabase
          .from('landings')
          .select('id, name, slug, status, meta_title, meta_description, funnel_id, funnel_stage_id, is_blocks_based, html_content, project_id')
          .eq('id', landingId)
          .single()
        if (!l) throw new Error('landing not found')
        if (l.project_id !== projectId) throw new Error('landing not in this project')

        // Lazy-миграция если ещё не блочный (у legacy лендингов html_content монолитный)
        if (!l.is_blocks_based && l.html_content) {
          const block = wrapLegacyHtmlAsBlockForAgent(l.html_content, landingId)
          await supabase.from('landing_blocks').insert(block)
          await supabase.from('landings').update({ is_blocks_based: true }).eq('id', landingId)
        }

        const { data: blocks } = await supabase
          .from('landing_blocks')
          .select('id, order_position, block_type, name, is_hidden')
          .eq('landing_id', landingId)
          .order('order_position', { ascending: true })

        const meta = [
          `name: ${l.name}`,
          `slug: ${l.slug}`,
          `status: ${l.status ?? 'draft'}`,
          `meta_title: ${l.meta_title ?? '(не задан)'}`,
          `meta_description: ${l.meta_description ?? '(не задано)'}`,
        ].join('\n')
        const blocksList = (blocks ?? []).map((b, i) => {
          const hidden = b.is_hidden ? ' [скрыт]' : ''
          return `${i + 1}. [${b.block_type}] ${b.name || '(без имени)'}${hidden} — id: ${b.id}`
        }).join('\n')
        const content = `# Мета лендинга\n${meta}\n\n# Блоки (${(blocks ?? []).length})\n${blocksList || '(блоков нет — создай первый через create_block)'}`
        return {
          content,
          summary: `список блоков: ${(blocks ?? []).length}`,
          ok: true, wrote: false,
        }
      }

      case 'read_block': {
        const blockId = String(input.block_id ?? '')
        if (!blockId) throw new Error('block_id обязателен')
        const { data: b } = await supabase
          .from('landing_blocks')
          .select('*')
          .eq('id', blockId)
          .eq('landing_id', landingId)
          .single()
        if (!b) throw new Error('блок не найден')
        // base64-картинки заменяем на плейсхолдеры — иначе один импортированный
        // лендинг 1.6MB пробивает лимит контекста.
        let html: string = b.html_content || ''
        let redactNote = ''
        if (html) {
          const { redacted, count } = redactBase64Images(html)
          if (count > 0) {
            html = redacted
            redactNote = `\n===ВНИМАНИЕ===\nВ этом HTML ${count} base64-картинок заменены на плейсхолдеры вида __B64_<hash>__. Это нужно чтобы вписаться в лимит контекста. При update_block ОСТАВЛЯЙ плейсхолдеры на месте картинок которые НЕ должны меняться — система автоматически восстановит реальные base64 из текущей версии в БД. Если хочешь заменить картинку — поставь новый src (URL или новый data:image base64). Если хочешь удалить картинку — удали весь <img>.\n`
          }
        }
        const htmlSection = html ? `\n===HTML_START===\n${html}\n===HTML_END===\n` : ''
        const content = JSON.stringify({
          id: b.id,
          name: b.name,
          block_type: b.block_type,
          order_position: b.order_position,
          is_hidden: b.is_hidden,
          content: b.content,
          desktop_styles: b.desktop_styles,
          mobile_styles: b.mobile_styles,
          layout: b.layout,
        }, null, 2) + redactNote + htmlSection
        return {
          content,
          summary: `прочитал блок «${b.name || b.block_type}»`,
          ok: true, wrote: false,
        }
      }

      case 'update_block': {
        const blockId = String(input.block_id ?? '')
        if (!blockId) throw new Error('block_id обязателен')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updates: any = {}
        for (const k of ['name', 'block_type', 'html_content', 'content', 'desktop_styles', 'mobile_styles', 'layout', 'is_hidden']) {
          if (input[k] !== undefined) updates[k] = input[k]
        }
        if (Object.keys(updates).length === 0) throw new Error('нет полей для обновления')
        // Если агент прислал html_content с плейсхолдерами __B64_xxx__, подменяем
        // обратно на реальный base64 из текущего html в БД.
        if (typeof updates.html_content === 'string' && updates.html_content.includes('__B64_')) {
          const { data: cur } = await supabase
            .from('landing_blocks')
            .select('html_content')
            .eq('id', blockId)
            .eq('landing_id', landingId)
            .single()
          if (cur?.html_content) {
            updates.html_content = restoreBase64FromOld(updates.html_content, cur.html_content)
          }
        }
        const { data, error } = await supabase
          .from('landing_blocks')
          .update(updates)
          .eq('id', blockId)
          .eq('landing_id', landingId)
          .select('id, name, block_type')
          .single()
        if (error || !data) throw new Error(error?.message || 'блок не найден')
        const changed = Object.keys(updates).join(', ')
        return {
          content: JSON.stringify({ ok: true, id: data.id }),
          summary: `обновил блок «${data.name || data.block_type}»: ${changed}`,
          ok: true, wrote: true,
        }
      }

      case 'create_block': {
        const blockType = String(input.block_type ?? '')
        const allowed = ['custom_html', 'hero', 'text', 'image', 'video', 'cta', 'zero']
        if (!allowed.includes(blockType)) throw new Error(`неизвестный block_type: ${blockType}`)

        // Вычисляем позицию — после указанного блока или в конец
        let newOrder = 0
        const afterId = input.after_block_id ? String(input.after_block_id) : null
        if (afterId) {
          const { data: after } = await supabase
            .from('landing_blocks').select('order_position').eq('id', afterId).eq('landing_id', landingId).maybeSingle()
          if (after) {
            newOrder = after.order_position + 1
            const { data: toShift } = await supabase
              .from('landing_blocks').select('id, order_position').eq('landing_id', landingId).gte('order_position', newOrder)
            for (const s of (toShift ?? [])) {
              await supabase.from('landing_blocks').update({ order_position: s.order_position + 1 }).eq('id', s.id)
            }
          }
        } else {
          const { data: last } = await supabase
            .from('landing_blocks').select('order_position').eq('landing_id', landingId).order('order_position', { ascending: false }).limit(1).maybeSingle()
          newOrder = (last?.order_position ?? -1) + 1
        }

        const { data: created, error } = await supabase.from('landing_blocks').insert({
          landing_id: landingId,
          order_position: newOrder,
          block_type: blockType,
          name: input.name ?? null,
          html_content: input.html_content ?? null,
          content: input.content ?? {},
          desktop_styles: {},
          mobile_styles: {},
          layout: input.layout ?? {},
        }).select().single()
        if (error || !created) throw new Error(error?.message || 'не удалось создать блок')

        // Переключаем лендинг на блочный режим если ещё не
        await supabase.from('landings').update({ is_blocks_based: true }).eq('id', landingId)

        return {
          content: JSON.stringify({ ok: true, id: created.id, order_position: newOrder }),
          summary: `создал блок ${blockType} «${created.name || '(без имени)'}»`,
          ok: true, wrote: true,
        }
      }

      case 'delete_block': {
        const blockId = String(input.block_id ?? '')
        if (!blockId) throw new Error('block_id обязателен')
        const { error } = await supabase
          .from('landing_blocks')
          .delete()
          .eq('id', blockId)
          .eq('landing_id', landingId)
        if (error) throw error
        return {
          content: JSON.stringify({ ok: true }),
          summary: `удалил блок`,
          ok: true, wrote: true,
        }
      }

      case 'reorder_blocks': {
        const ids: unknown = input.ids
        if (!Array.isArray(ids) || !ids.every(x => typeof x === 'string')) {
          throw new Error('ids[] обязателен (массив UUID)')
        }
        for (let i = 0; i < ids.length; i++) {
          await supabase
            .from('landing_blocks')
            .update({ order_position: i })
            .eq('id', ids[i])
            .eq('landing_id', landingId)
        }
        return {
          content: JSON.stringify({ ok: true, count: ids.length }),
          summary: `переупорядочил ${ids.length} блоков`,
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
    // Берём последнее окно MAX_HISTORY_TURNS сообщений. ОБЯЗАТЕЛЬНО первое
    // должно быть user — иначе Anthropic API падает «messages must start with user».
    // Раньше тут был поиск последнего «user со строкой» — это срезало контекст
    // до «продолжай», и агент забывал ВСЕ предыдущие tool calls.
    const wantFrom = rawHistory.length - MAX_HISTORY_TURNS
    let safeStart = wantFrom
    while (safeStart < rawHistory.length && rawHistory[safeStart].role !== 'user') {
      safeStart++
    }
    if (safeStart < rawHistory.length) trimmedHistory = rawHistory.slice(safeStart)
  }
  const conversation: ChatMessage[] = [
    ...trimmedHistory,
    { role: 'user', content: buildUserMessageContent(ctx.userMessage, ctx.attachments) } as ChatMessage,
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
      // Streaming: при max_tokens > 21333 (или time > 10 мин) Anthropic SDK
      // требует stream API. Используем .stream().finalMessage() — семантика
      // как у .create(), просто SDK не блокирует на long-request guard.
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: getTools().map((t, i, arr) => i === arr.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: conversation as any,
      })
      response = await stream.finalMessage()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[landing-agent] anthropic api error at iter=${iter}:`, msg)
      const isBrokenHistory = /tool_use.*tool_result|invalid_request_error/i.test(msg)
      if (isBrokenHistory && iter === 0 && conversation.length > 1) {
        console.warn('[landing-agent] rebuilding conversation from scratch')
        conversation.length = 0
        conversation.push({ role: 'user', content: buildUserMessageContent(ctx.userMessage, ctx.attachments) } as ChatMessage)
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
      // Автоматически продолжаем тем же ходом — добавляем user-message
      // «продолжи» и идём ещё одну итерацию loop. Пользователь видит
      // результат как одно цельное сообщение.
      conversation.push({ role: 'user', content: 'Продолжи с того места, где остановился. Тот же ход, не приветствуй заново.' })
      continue
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
