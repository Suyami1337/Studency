// Парсер публичной страницы Telegram-канала (t.me/s/channelname)
// Возвращает посты с просмотрами, реакциями и текстом.
// Работает только для публичных каналов (с @username).
// Для приватных — нужен MTProto (этап 3).

export type ScrapedPost = {
  externalId: string      // message_id как строка
  url: string             // https://t.me/channel/123
  publishedAt: string | null
  text: string
  views: number | null
  forwards: number | null
  replies: number | null
  reactions: number | null
  mediaType: 'text' | 'photo' | 'video' | 'poll' | 'document' | 'voice' | 'other'
}

/** Нормализует "11.1K" / "2.3M" в число */
function parseCompactNumber(s: string | null | undefined): number | null {
  if (!s) return null
  const clean = s.trim().replace(/\s+/g, '').replace(',', '.')
  const match = clean.match(/^([0-9.]+)\s*([KMBk]?)/)
  if (!match) return null
  const n = parseFloat(match[1])
  if (isNaN(n)) return null
  const mult = match[2]?.toUpperCase()
  if (mult === 'K') return Math.round(n * 1000)
  if (mult === 'M') return Math.round(n * 1_000_000)
  if (mult === 'B') return Math.round(n * 1_000_000_000)
  return Math.round(n)
}

/** Грубая регулярка — без полноценного DOM-парсера, но даёт стабильный результат
 *  для страницы t.me/s/channel формата. */
export async function scrapeTelegramChannel(username: string, limit = 20): Promise<ScrapedPost[]> {
  const uname = username.replace(/^@/, '')
  const url = `https://t.me/s/${uname}`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; StudencyBot/1.0; +https://studency.ru)',
      'Accept-Language': 'ru,en;q=0.9',
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`t.me/s/${uname} returned ${res.status}`)
  }
  const html = await res.text()

  // Каждый пост обёрнут в <div class="tgme_widget_message_wrap ...">...</div>
  // Режем HTML по позициям открывающих тегов wrap — получаем независимые блоки
  // постов. Это надёжнее регекса с lookahead (который жадно захватывает весь
  // остаток страницы в один матч).
  const markerRe = /<div class="tgme_widget_message_wrap[^"]*"/g
  const markers: number[] = []
  let mm: RegExpExecArray | null
  while ((mm = markerRe.exec(html)) !== null) markers.push(mm.index)

  const posts: ScrapedPost[] = []
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i]
    const end = i < markers.length - 1 ? markers[i + 1] : html.length
    const block = html.substring(start, end)
    const idMatch = block.match(/data-post="[^"]+\/(\d+)"/)
    if (!idMatch) continue
    const msgId = idMatch[1]

    // Текст
    const textMatch = block.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/)
    let text = textMatch ? textMatch[1] : ''
    // Стрип HTML
    text = text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim()

    // Просмотры: <span class="tgme_widget_message_views">11.2K</span>
    const viewsMatch = block.match(/<span class="tgme_widget_message_views">([^<]+)<\/span>/)
    const views = parseCompactNumber(viewsMatch?.[1])

    // Дата публикации: <time datetime="2026-04-15T12:34:56+00:00">
    const dateMatch = block.match(/<time[^>]+datetime="([^"]+)"/)
    const publishedAt = dateMatch ? new Date(dateMatch[1]).toISOString() : null

    // Реакции: <span class="emoji">💎</span>...<span class="...">42</span>
    // Суммарное число реакций — пробежим по всем класс="...reactions...counter..."
    let reactions: number | null = null
    const reactionsRegex = /<span class="(?:[^"]*reactions?[^"]*counter|emoji_counter|reaction-counter)[^"]*">([^<]+)<\/span>/g
    let rMatch
    while ((rMatch = reactionsRegex.exec(block)) !== null) {
      const n = parseCompactNumber(rMatch[1])
      if (n) reactions = (reactions ?? 0) + n
    }

    // Тип медиа
    let mediaType: ScrapedPost['mediaType'] = 'text'
    if (/tgme_widget_message_photo/.test(block)) mediaType = 'photo'
    else if (/tgme_widget_message_video/.test(block)) mediaType = 'video'
    else if (/tgme_widget_message_poll/.test(block)) mediaType = 'poll'
    else if (/tgme_widget_message_document/.test(block)) mediaType = 'document'
    else if (/tgme_widget_message_voice/.test(block)) mediaType = 'voice'

    posts.push({
      externalId: msgId,
      url: `https://t.me/${uname}/${msgId}`,
      publishedAt,
      text,
      views,
      forwards: null, // Публичная страница форварды не показывает
      replies: null,  // То же для ответов
      reactions,
      mediaType,
    })
  }

  // t.me/s/ возвращает посты от старых к новым; берём последние N
  return posts.slice(-limit).reverse()
}
