/**
 * Landing blocks — блочный движок лендингов.
 *
 * Идея: лендинг = упорядоченный список блоков. У каждого блока:
 *   - тип (custom_html / hero / text / image / video / cta / zero)
 *   - общий контент (HTML или структурированный, зависит от типа)
 *   - desktop_styles (CSS overrides для широких экранов)
 *   - mobile_styles (override'ы попадают в @media (max-width: 640px))
 *   - layout (paddingY, maxWidth, align, hideOnMobile/Desktop, bgColor, bgImage)
 *
 * Публичный рендер собирает блоки в порядке и генерирует один HTML-документ
 * с секциями. Каждый блок в итоговом HTML окружён <section class="block-{id}">,
 * стили блока идут в <style> с селекторами `.block-{id} ...`.
 *
 * Это позволяет:
 *   - правки одного блока не ломать соседние
 *   - раздельно стилизовать desktop и mobile (через @media)
 *   - AI-агенту работать точечно (только с одним блоком)
 */

export type BlockType = 'custom_html' | 'hero' | 'text' | 'image' | 'video' | 'cta' | 'zero'

/** Структурированный контент для типизированных блоков. Для custom_html поле не используется. */
export type BlockContent = {
  // hero
  headline?: string
  subheadline?: string
  ctaText?: string
  ctaUrl?: string
  // text
  text?: string          // HTML со span/b/i разметкой
  // image
  src?: string
  alt?: string
  // video
  videoId?: string       // UUID из таблицы videos → будет заменено на iframe
  // cta
  buttonText?: string
  buttonUrl?: string
  // zero (canvas) — массив свободно-позиционированных элементов
  zeroItems?: Array<{
    id: string
    type: 'text' | 'image' | 'button'
    x: number            // px от левого края блока
    y: number            // px от верха блока
    width: number
    height: number
    content: string      // HTML
    style?: Record<string, string>
  }>
}

/** layout-параметры — общие для всех типов */
export type BlockLayout = {
  paddingY?: number          // вертикальный padding, px — default 64
  maxWidth?: number          // макс-ширина контейнера, px — default 880
  align?: 'left' | 'center' | 'right'
  bgColor?: string           // фон секции
  bgImage?: string           // URL
  hideOnMobile?: boolean
  hideOnDesktop?: boolean
  // mobile-overrides тех же layout-полей
  mobile?: {
    paddingY?: number
    maxWidth?: number
    align?: 'left' | 'center' | 'right'
  }
}

/** CSS override-обьект: { "selector_относительно_блока": { "prop": "value" } } */
export type StyleOverrides = Record<string, Record<string, string>>

export type LandingBlock = {
  id: string
  landing_id: string
  order_position: number
  block_type: BlockType
  name: string | null
  html_content: string | null        // для custom_html — сырой HTML блока; для типизированных может быть null (генерим из content)
  content: BlockContent
  desktop_styles: StyleOverrides
  mobile_styles: StyleOverrides
  layout: BlockLayout
  is_hidden: boolean
}

// ────────────────────────────────────────────────────────────────────────────
// Рендер одного блока в HTML + CSS
// ────────────────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]!))
}

function cssEscapeId(id: string): string {
  // UUID содержит только [0-9a-f-] — все безопасны для CSS-селектора, но экранируем на всякий
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/** Строит HTML одного блока (section + inner) и CSS-правила для него. */
export function renderBlock(block: LandingBlock): { html: string; css: string } {
  const klass = `block-${cssEscapeId(block.id)}`
  const innerHtml = renderBlockInner(block)
  const css = buildBlockCss(block, klass)

  const layout = block.layout || {}
  const bgStyles: string[] = []
  if (layout.bgColor) bgStyles.push(`background-color:${layout.bgColor}`)
  if (layout.bgImage) bgStyles.push(`background-image:url("${layout.bgImage.replace(/"/g, '%22')}");background-size:cover;background-position:center`)

  const sectionStyle = bgStyles.join(';')
  const styleAttr = sectionStyle ? ` style="${sectionStyle}"` : ''
  const hiddenClass = block.is_hidden ? ' block-hidden' : ''

  return {
    html: `<section class="${klass}${hiddenClass}" data-block-id="${block.id}" data-block-type="${block.block_type}"${styleAttr}>
<div class="block-inner">${innerHtml}</div>
</section>`,
    css,
  }
}

/** Содержимое блока в зависимости от типа */
function renderBlockInner(block: LandingBlock): string {
  const c = block.content || {}
  switch (block.block_type) {
    case 'custom_html':
      return block.html_content || ''

    case 'hero': {
      const h = escapeHtml(c.headline || 'Заголовок')
      const sh = c.subheadline ? `<p class="hero-sub">${escapeHtml(c.subheadline)}</p>` : ''
      const cta = c.ctaText ? `<a href="${escapeHtml(c.ctaUrl || '#')}" class="hero-cta">${escapeHtml(c.ctaText)}</a>` : ''
      return `<h1 class="hero-headline">${h}</h1>${sh}${cta}`
    }

    case 'text':
      // text.text — уже HTML (из визуального редактора). Просто отдаём как есть.
      return c.text || ''

    case 'image': {
      if (!c.src) return '<div class="block-placeholder">Выбери картинку</div>'
      return `<img src="${escapeHtml(c.src)}" alt="${escapeHtml(c.alt || '')}" class="block-image" />`
    }

    case 'video':
      // Шорткод — будет заменён на iframe в public renderer
      if (!c.videoId) return '<div class="block-placeholder">Выбери видео</div>'
      return `{{video:${c.videoId}}}`

    case 'cta': {
      const t = escapeHtml(c.buttonText || 'Кнопка')
      const u = escapeHtml(c.buttonUrl || '#')
      return `<a href="${u}" class="block-cta-btn">${t}</a>`
    }

    case 'zero': {
      const items = c.zeroItems || []
      if (items.length === 0) return '<div class="block-placeholder">Пустой холст. Добавь элементы через панель настроек справа.</div>'
      return items.map(item => {
        const styleParts: string[] = [
          `position:absolute`,
          `left:${item.x}px`,
          `top:${item.y}px`,
          `width:${item.width}px`,
          `height:${item.height}px`,
        ]
        if (item.style) {
          for (const [k, v] of Object.entries(item.style)) styleParts.push(`${k}:${v}`)
        }
        return `<div class="zero-item" data-zero-id="${escapeHtml(item.id)}" data-zero-block-id="${escapeHtml(block.id)}" style="${styleParts.join(';')}">${item.content}</div>`
      }).join('\n')
    }

    default:
      return ''
  }
}

/** CSS-правила для блока: лейаут + override'ы пользователя + mobile @media */
function buildBlockCss(block: LandingBlock, klass: string): string {
  const layout = block.layout || {}
  const paddingY = layout.paddingY ?? 64
  const maxWidth = layout.maxWidth ?? 880
  const align = layout.align ?? 'center'

  const lines: string[] = []

  // Базовые стили секции + inner-контейнер с max-width
  lines.push(`.${klass} { padding: ${paddingY}px 20px; position: relative; }`)
  lines.push(`.${klass} > .block-inner { max-width: ${maxWidth}px; margin: 0 auto; text-align: ${align}; }`)
  if (layout.hideOnMobile) lines.push(`@media (max-width: 640px) { .${klass} { display: none !important; } }`)
  if (layout.hideOnDesktop) lines.push(`@media (min-width: 641px) { .${klass} { display: none !important; } }`)

  // Типо-специфичные дефолты (минимум — остальное задаёт шаблонный CSS ниже)
  switch (block.block_type) {
    case 'hero':
      lines.push(`.${klass} .hero-headline { font-size: 54px; font-weight: 900; letter-spacing: 0.5px; line-height: 1.05; margin: 0 0 22px; text-transform: uppercase; }`)
      lines.push(`.${klass} .hero-sub { font-size: 16px; line-height: 1.6; color: #555; margin: 0 auto 28px; max-width: 640px; }`)
      lines.push(`.${klass} .hero-cta { display: inline-block; padding: 16px 40px; background: #6A55F8; color: #fff; text-decoration: none; border-radius: 10px; font-weight: 700; }`)
      lines.push(`@media (max-width: 640px) { .${klass} .hero-headline { font-size: 32px; } }`)
      break
    case 'image':
      lines.push(`.${klass} .block-image { max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 8px; }`)
      break
    case 'cta':
      lines.push(`.${klass} .block-cta-btn { display: inline-block; padding: 20px 48px; background: #6A55F8; color: #fff; text-decoration: none; border-radius: 12px; font-weight: 800; letter-spacing: 1px; font-size: 16px; box-shadow: 0 10px 30px rgba(106,85,248,0.4); }`)
      break
    case 'zero':
      lines.push(`.${klass} > .block-inner { position: relative; height: 600px; max-width: 100%; }`)
      break
  }

  // Override'ы пользователя — desktop
  for (const [selector, rules] of Object.entries(block.desktop_styles || {})) {
    const full = normalizeSelector(klass, selector)
    const body = stringifyRules(rules)
    if (body) lines.push(`${full} { ${body} }`)
  }

  // Override'ы mobile → @media
  const mobileEntries = Object.entries(block.mobile_styles || {})
  if (mobileEntries.length > 0) {
    const mediaLines: string[] = []
    for (const [selector, rules] of mobileEntries) {
      const full = normalizeSelector(klass, selector)
      const body = stringifyRules(rules)
      if (body) mediaLines.push(`  ${full} { ${body} }`)
    }
    if (mediaLines.length > 0) {
      lines.push(`@media (max-width: 640px) {\n${mediaLines.join('\n')}\n}`)
    }
  }

  return lines.join('\n')
}

function normalizeSelector(klass: string, selector: string): string {
  const sel = selector.trim()
  if (sel === '' || sel === '&' || sel === 'self') return `.${klass}`
  // Если пользователь уже включил .block- префикс — не дублируем
  if (sel.startsWith('.block-')) return sel
  // Иначе делаем относительно блока
  return `.${klass} ${sel}`
}

function stringifyRules(rules: Record<string, string>): string {
  return Object.entries(rules)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ')
}

// ────────────────────────────────────────────────────────────────────────────
// Сборка всех блоков в полный HTML-документ
// ────────────────────────────────────────────────────────────────────────────

export type AssembleOptions = {
  title: string
  metaDescription?: string
  bodyBgColor?: string
  /** extra HTML в <head> — для google fonts и т.п. */
  extraHead?: string
  /** extra HTML перед </body> — трекинг-скрипт, Telegram SDK */
  extraBodyEnd?: string
}

/**
 * Собирает все блоки в один HTML-документ с:
 *   - CSS-ресетом + общими стилями
 *   - Блоками секциями по порядку
 *   - Inline-стилями блоков
 */
export function assembleLandingHtml(blocks: LandingBlock[], opts: AssembleOptions): string {
  const visible = [...blocks].sort((a, b) => a.order_position - b.order_position)
  const rendered = visible.map(b => renderBlock(b))
  const allHtml = rendered.map(r => r.html).join('\n\n')
  const allCss = rendered.map(r => r.css).join('\n\n')

  const title = escapeHtml(opts.title || 'Лендинг')
  const description = opts.metaDescription ? `<meta name="description" content="${escapeHtml(opts.metaDescription)}">` : ''

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
${description}
<style>
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif; color: #1a1a2e; ${opts.bodyBgColor ? `background:${opts.bodyBgColor};` : ''} }
body { overflow-x: hidden; }
.block-hidden { display: none !important; }
.block-placeholder { padding: 40px; background: #f3f4f6; border: 2px dashed #d1d5db; border-radius: 8px; color: #6b7280; text-align: center; font-size: 14px; }
${allCss}
</style>
${opts.extraHead || ''}
</head>
<body>
${allHtml}
${opts.extraBodyEnd || ''}
</body>
</html>`
}

// ────────────────────────────────────────────────────────────────────────────
// Утилита: превратить монолитный html_content в один блок custom_html
// ────────────────────────────────────────────────────────────────────────────

/**
 * Для lazy-миграции старых лендингов: вытаскиваем body и head-инъекции из
 * legacy HTML и оборачиваем в один блок custom_html. Пользователь сможет его
 * потом разбить на несколько через кнопку «Разделить».
 */
export function wrapLegacyHtmlAsBlock(legacyHtml: string, landingId: string): {
  html_content: string
  content: BlockContent
  desktop_styles: StyleOverrides
  mobile_styles: StyleOverrides
  layout: BlockLayout
  block_type: BlockType
  name: string
  landing_id: string
  order_position: number
} {
  // Берём body-inner если есть, иначе весь html — блок будет содержать свой <style> из <head>
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(legacyHtml)
  const headMatch = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(legacyHtml)
  const bodyInner = bodyMatch ? bodyMatch[1] : legacyHtml
  const headInner = headMatch
    ? headMatch[1]
        // Выкидываем <title> — он ставится родительским рендером
        .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')
        // Выкидываем <meta charset>, <meta viewport> — они будут в корневом head
        .replace(/<meta[^>]*charset[^>]*>/gi, '')
        .replace(/<meta[^>]*viewport[^>]*>/gi, '')
    : ''

  // Склеиваем: head-инъекции (шрифты, <style> шаблона) перед body-контентом
  // Оно пойдёт внутрь блока и будет работать благодаря тому что CSS глобален.
  const blockHtml = `${headInner}\n${bodyInner}`

  return {
    landing_id: landingId,
    order_position: 0,
    block_type: 'custom_html',
    name: 'Импортированный лендинг',
    html_content: blockHtml,
    content: {},
    desktop_styles: {},
    mobile_styles: {},
    layout: {
      paddingY: 0,   // custom_html обычно сам управляет своими паддингами
      maxWidth: 99999,
      align: 'center',
    },
  }
}
