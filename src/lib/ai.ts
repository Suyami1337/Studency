// Claude AI helper for generating chatbot scenarios and landing content
// Uses Anthropic SDK with ANTHROPIC_API_KEY env var

import Anthropic from '@anthropic-ai/sdk'

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')
  return new Anthropic({ apiKey })
}

// Default to Claude Sonnet 4.5 — good balance of quality and cost
const DEFAULT_MODEL = 'claude-sonnet-4-5'

export async function claudeMessage(params: {
  system: string
  user: string
  maxTokens?: number
  /** data URL картинок (`data:image/png;base64,...`) — прицепятся image-блоками к user-сообщению */
  attachments?: string[]
}): Promise<string> {
  const client = getClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let content: any = params.user
  if (params.attachments && params.attachments.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocks: any[] = []
    if (params.user && params.user.trim()) blocks.push({ type: 'text', text: params.user })
    for (const url of params.attachments) {
      const m = /^data:([^;,]+);base64,(.*)$/.exec(url)
      if (!m) continue
      const mediaType = m[1].toLowerCase()
      if (!/^image\/(png|jpeg|jpg|gif|webp)$/.test(mediaType)) continue
      blocks.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: m[2] } })
    }
    if (blocks.length > 0) content = blocks
  }
  const msg = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: params.maxTokens ?? 4096,
    system: params.system,
    messages: [{ role: 'user', content }],
  })

  const first = msg.content[0]
  if (first.type === 'text') return first.text
  return ''
}

/**
 * Generate a chatbot scenario from a short description.
 * Returns a structured scenario with messages and buttons.
 */
export async function generateChatbotScenario(description: string): Promise<{
  name: string
  messages: Array<{
    text: string
    is_start: boolean
    trigger_word?: string
    buttons?: Array<{ text: string; action_type: 'url' | 'trigger' | 'goto_message'; value?: string }>
  }>
}> {
  const system = `Ты эксперт по созданию сценариев чат-ботов для маркетинга и продаж.
Твоя задача — сгенерировать структурированный сценарий для Telegram-бота на основе описания.

Отвечай СТРОГО в формате JSON без каких-либо пояснений:
{
  "name": "короткое название сценария",
  "messages": [
    {
      "text": "текст сообщения",
      "is_start": true/false,
      "trigger_word": "триггерное слово (только для is_start=true)",
      "buttons": [
        { "text": "текст кнопки", "action_type": "url|trigger|goto_message", "value": "URL или кодовое слово" }
      ]
    }
  ]
}

Правила:
- Первое сообщение должно иметь is_start: true и trigger_word (например "/start")
- Используй эмодзи для живости
- Делай цепочки сообщений с кнопками для интерактива
- 3-7 сообщений в одном сценарии
- Текст должен быть дружелюбным, разговорным, на "ты"`

  const text = await claudeMessage({
    system,
    user: `Создай сценарий для такого бота: ${description}`,
    maxTokens: 4096,
  })

  // Extract JSON from response (may be wrapped in ```json blocks)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, text]
  const jsonStr = jsonMatch[1] ?? text
  try {
    return JSON.parse(jsonStr.trim())
  } catch {
    throw new Error('Failed to parse AI response as JSON: ' + text.slice(0, 200))
  }
}

/**
 * Generate landing page content from a description.
 */
export async function generateLandingContent(description: string): Promise<{
  title: string
  subtitle: string
  blocks: Array<{ type: string; heading?: string; body?: string; cta?: string }>
}> {
  const system = `Ты эксперт копирайтер и маркетолог. Твоя задача — сгенерировать структуру лендинга на основе описания.

Отвечай СТРОГО в формате JSON:
{
  "title": "главный заголовок",
  "subtitle": "подзаголовок",
  "blocks": [
    { "type": "hero|features|benefits|pricing|cta|testimonials", "heading": "заголовок блока", "body": "текст", "cta": "текст кнопки (опционально)" }
  ]
}

Правила:
- 5-8 блоков
- Сильный заголовок с чёткой ценностью
- Продающий копирайтинг, без воды
- Каждый блок раскрывает одну мысль`

  const text = await claudeMessage({
    system,
    user: `Создай лендинг для: ${description}`,
    maxTokens: 3000,
  })

  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, text]
  const jsonStr = jsonMatch[1] ?? text
  try {
    return JSON.parse(jsonStr.trim())
  } catch {
    throw new Error('Failed to parse AI response: ' + text.slice(0, 200))
  }
}

/**
 * Simple assistant query for the chat interface.
 */
export async function aiAssistant(question: string, context?: string, attachments?: string[]): Promise<string> {
  const system = `Ты AI-ассистент маркетинговой платформы Studency. Помогаешь пользователю с воронками, чат-ботами, лендингами, CRM и аналитикой. Отвечай на русском, кратко и по делу.${context ? `\n\nКонтекст: ${context}` : ''}`

  return claudeMessage({ system, user: question, maxTokens: 1500, attachments })
}
