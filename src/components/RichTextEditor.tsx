'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}

/**
 * Escape только амперсанды. Угловые скобки оставляем как есть —
 * если юзер пишет `<b>` руками или через тулбар, Telegram увидит
 * тег и отрендерит его. Ошибочные `<xyz` просто останутся в тексте
 * (Telegram проигнорирует неизвестные теги).
 */
function escapeForTelegram(s: string) {
  return s.replace(/&/g, '&amp;')
}

/**
 * DOM → Telegram HTML. Нормализует <strong>→<b>, <span style=bold>→<b>
 * и т.п. Пропускает текст с угловыми скобками как есть — если юзер
 * напечатал `<b>` руками, он останется в output.
 */
function domToTelegramHtml(root: Node): string {
  let out = ''

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += escapeForTelegram(node.textContent || '')
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return

    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()
    const style = el.getAttribute('style') || ''
    const cls = el.getAttribute('class') || ''

    if (tag === 'br') { out += '\n'; return }
    if (tag === 'div' || tag === 'p') {
      if (out && !out.endsWith('\n')) out += '\n'
      Array.from(el.childNodes).forEach(walk)
      if (!out.endsWith('\n')) out += '\n'
      return
    }

    if (tag === 'span') {
      if (cls.includes('tg-spoiler')) { out += '<tg-spoiler>'; Array.from(el.childNodes).forEach(walk); out += '</tg-spoiler>'; return }
      if (/font-weight:\s*(bold|[6-9]\d\d)/i.test(style)) { out += '<b>'; Array.from(el.childNodes).forEach(walk); out += '</b>'; return }
      if (/font-style:\s*italic/i.test(style)) { out += '<i>'; Array.from(el.childNodes).forEach(walk); out += '</i>'; return }
      if (/text-decoration:[^;]*underline/i.test(style)) { out += '<u>'; Array.from(el.childNodes).forEach(walk); out += '</u>'; return }
      if (/text-decoration:[^;]*line-through/i.test(style)) { out += '<s>'; Array.from(el.childNodes).forEach(walk); out += '</s>'; return }
      Array.from(el.childNodes).forEach(walk)
      return
    }

    const mapped: Record<string, string> = {
      strong: 'b', b: 'b',
      em: 'i', i: 'i',
      ins: 'u', u: 'u',
      del: 's', strike: 's', s: 's',
      code: 'code', pre: 'pre',
      blockquote: 'blockquote',
      'tg-spoiler': 'tg-spoiler',
    }
    const canonical = mapped[tag]
    if (canonical) {
      out += `<${canonical}>`
      Array.from(el.childNodes).forEach(walk)
      out += `</${canonical}>`
      return
    }

    if (tag === 'a') {
      const href = el.getAttribute('href') || ''
      out += `<a href="${href.replace(/"/g, '&quot;')}">`
      Array.from(el.childNodes).forEach(walk)
      out += '</a>'
      return
    }

    Array.from(el.childNodes).forEach(walk)
  }

  Array.from(root.childNodes).forEach(walk)
  return out.replace(/\n+$/, '')
}

/**
 * Telegram HTML → editable HTML для contenteditable.
 * \n → <br>, <tg-spoiler> → <span.tg-spoiler>.
 */
function telegramToEditable(html: string): string {
  let out = html || ''
  out = out.replace(/\r\n/g, '\n')
  out = out.split('\n').join('<br>')
  out = out.replace(/<tg-spoiler>/gi, '<span class="tg-spoiler">')
  out = out.replace(/<\/tg-spoiler>/gi, '</span>')
  return out
}

export default function RichTextEditor({ value, onChange, placeholder, rows = 4 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const lastEmitted = useRef<string>('')
  const [isEmpty, setIsEmpty] = useState(!value)
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    if (!ref.current) return
    if (value === lastEmitted.current) return
    const editable = telegramToEditable(value || '')
    if (ref.current.innerHTML !== editable) {
      ref.current.innerHTML = editable
      lastEmitted.current = value || ''
      setIsEmpty(!value)
    }
  }, [value])

  function emit() {
    if (!ref.current) return
    const html = domToTelegramHtml(ref.current)
    lastEmitted.current = html
    setIsEmpty(!ref.current.innerText.trim())
    onChange(html)
  }

  function showHint(msg: string) {
    setHint(msg)
    setTimeout(() => setHint(null), 2500)
  }

  /**
   * Оборачивает текущее выделение в указанный тег (реальный DOM-элемент,
   * не строку — браузер сразу отрисует форматирование).
   * spoiler/code — через специальный путь (spoiler = span.tg-spoiler).
   */
  function applyFormat(tag: string) {
    if (!ref.current) return
    ref.current.focus()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      showHint('Сначала выдели текст — потом жми кнопку')
      return
    }
    const range = sel.getRangeAt(0)
    if (!ref.current.contains(range.commonAncestorContainer)) {
      showHint('Выдели текст внутри этого поля')
      return
    }
    const text = range.toString()
    if (!text) return

    const el = tag === 'tg-spoiler' ? document.createElement('span') : document.createElement(tag)
    if (tag === 'tg-spoiler') el.className = 'tg-spoiler'
    // используем extractContents чтобы сохранить inline-форматирование внутри
    const contents = range.extractContents()
    el.appendChild(contents)
    range.insertNode(el)

    const r2 = document.createRange()
    r2.setStartAfter(el)
    r2.collapse(true)
    sel.removeAllRanges()
    sel.addRange(r2)
    emit()
  }

  function insertLink() {
    if (!ref.current) return
    ref.current.focus()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) {
      showHint('Поставь курсор в тексте или выдели слово')
      return
    }
    const range = sel.getRangeAt(0)
    if (!ref.current.contains(range.commonAncestorContainer)) return
    const url = prompt('URL ссылки (https://...):', 'https://')
    if (!url || url === 'https://') return
    const text = range.toString() || 'текст ссылки'
    const a = document.createElement('a')
    a.href = url
    a.textContent = text
    range.deleteContents()
    range.insertNode(a)
    const r2 = document.createRange()
    r2.setStartAfter(a)
    r2.collapse(true)
    sel.removeAllRanges()
    sel.addRange(r2)
    emit()
  }

  function onKeyDown(ev: React.KeyboardEvent<HTMLDivElement>) {
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey) {
      if (ev.key === 'b' || ev.key === 'B') { ev.preventDefault(); applyFormat('b') }
      else if (ev.key === 'i' || ev.key === 'I') { ev.preventDefault(); applyFormat('i') }
      else if (ev.key === 'u' || ev.key === 'U') { ev.preventDefault(); applyFormat('u') }
    }
  }

  function onPaste(ev: React.ClipboardEvent<HTMLDivElement>) {
    ev.preventDefault()
    const text = ev.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  const minHeight = Math.max(rows * 24, 72)

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1 px-0.5">
        <button type="button" onClick={() => applyFormat('b')} title="Жирный (Ctrl+B)"
          className="min-w-7 h-7 px-1.5 rounded text-xs font-bold bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors">B</button>
        <button type="button" onClick={() => applyFormat('i')} title="Курсив (Ctrl+I)"
          className="min-w-7 h-7 px-1.5 rounded text-xs italic bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors">I</button>
        <button type="button" onClick={() => applyFormat('u')} title="Подчёркнутый (Ctrl+U)"
          className="min-w-7 h-7 px-1.5 rounded text-xs underline bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors">U</button>
        <button type="button" onClick={() => applyFormat('s')} title="Зачёркнутый"
          className="min-w-7 h-7 px-1.5 rounded text-xs line-through bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors">S</button>
        <button type="button" onClick={() => applyFormat('code')} title="Моноширинный"
          className="min-w-7 h-7 px-1.5 rounded text-[10px] font-mono bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors">{'</>'}</button>
        <button type="button" onClick={() => applyFormat('blockquote')} title="Цитата"
          className="min-w-7 h-7 px-1.5 rounded text-xs bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors">❝</button>
        <button type="button" onClick={() => applyFormat('tg-spoiler')} title="Спойлер"
          className="min-w-7 h-7 px-1.5 rounded text-xs bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors">⊘</button>
        <button type="button" onClick={insertLink} title="Ссылка"
          className="min-w-7 h-7 px-1.5 rounded text-xs bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors">🔗</button>
        {hint && (
          <span className="ml-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
            {hint}
          </span>
        )}
      </div>
      <div className="relative">
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-1 focus:ring-[#6A55F8]/20 rich-editor whitespace-pre-wrap break-words"
          style={{ minHeight: `${minHeight}px` }}
        />
        {isEmpty && placeholder && (
          <div className="absolute top-2 left-3 text-sm text-gray-400 pointer-events-none select-none">
            {placeholder}
          </div>
        )}
      </div>
      <style jsx global>{`
        .rich-editor { line-height: 1.45; }
        .rich-editor a { color: #6A55F8; text-decoration: underline; }
        .rich-editor code {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          background: #F3F4F6; padding: 1px 4px; border-radius: 3px; font-size: 0.9em;
        }
        .rich-editor pre {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          background: #F3F4F6; padding: 6px 8px; border-radius: 4px;
          white-space: pre-wrap;
        }
        .rich-editor blockquote {
          border-left: 3px solid #6A55F8;
          padding: 2px 10px;
          margin: 4px 0;
          color: #4B5563;
          background: #F9FAFB;
          border-radius: 0 4px 4px 0;
        }
        .rich-editor .tg-spoiler {
          background: #D1D5DB;
          color: transparent;
          text-shadow: 0 0 8px rgba(0,0,0,0.5);
          border-radius: 2px;
          padding: 0 2px;
          cursor: pointer;
        }
        .rich-editor .tg-spoiler:hover {
          color: inherit;
          text-shadow: none;
          background: transparent;
        }
      `}</style>
    </div>
  )
}
