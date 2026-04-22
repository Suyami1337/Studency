'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}

/**
 * Набор поддерживаемых тегов Telegram Bot API (HTML parse mode).
 * Редактор визуально рендерит их как настоящее форматирование (без тегов в вводе),
 * а onChange отдаёт строку уже с Telegram-совместимым HTML.
 */

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Normalize browser innerHTML → чистый Telegram HTML.
 * Преобразует <strong>→<b>, <em>→<i>, <span style="font-weight:bold">→<b>,
 * <br>→\n, <div>/<p>→\n, <span class="tg-spoiler">→<tg-spoiler>, и т.д.
 */
function domToTelegramHtml(root: Node): string {
  let out = ''

  function walk(node: Node, inlineOnly = false) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += escapeHtml(node.textContent || '')
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return

    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()
    const style = el.getAttribute('style') || ''
    const cls = el.getAttribute('class') || ''

    // block-level breaks
    if (tag === 'br') { out += '\n'; return }
    if (tag === 'div' || tag === 'p') {
      if (out && !out.endsWith('\n')) out += '\n'
      Array.from(el.childNodes).forEach(c => walk(c, inlineOnly))
      if (!out.endsWith('\n')) out += '\n'
      return
    }

    // span: detect style-based formatting from execCommand in Safari/Firefox
    if (tag === 'span') {
      if (cls.includes('tg-spoiler')) { out += '<tg-spoiler>'; Array.from(el.childNodes).forEach(c => walk(c, true)); out += '</tg-spoiler>'; return }
      if (/font-weight:\s*(bold|[6-9]\d\d)/i.test(style)) { out += '<b>'; Array.from(el.childNodes).forEach(c => walk(c, true)); out += '</b>'; return }
      if (/font-style:\s*italic/i.test(style)) { out += '<i>'; Array.from(el.childNodes).forEach(c => walk(c, true)); out += '</i>'; return }
      if (/text-decoration:[^;]*underline/i.test(style)) { out += '<u>'; Array.from(el.childNodes).forEach(c => walk(c, true)); out += '</u>'; return }
      if (/text-decoration:[^;]*line-through/i.test(style)) { out += '<s>'; Array.from(el.childNodes).forEach(c => walk(c, true)); out += '</s>'; return }
      // plain span — просто дети
      Array.from(el.childNodes).forEach(c => walk(c, inlineOnly))
      return
    }

    // canonical tags
    const mapped: Record<string, string> = {
      strong: 'b', b: 'b',
      em: 'i', i: 'i',
      ins: 'u', u: 'u',
      del: 's', strike: 's', s: 's',
      code: 'code',
      pre: 'pre',
      blockquote: 'blockquote',
      'tg-spoiler': 'tg-spoiler',
    }
    const canonical = mapped[tag]
    if (canonical) {
      out += `<${canonical}>`
      Array.from(el.childNodes).forEach(c => walk(c, true))
      out += `</${canonical}>`
      return
    }

    if (tag === 'a') {
      const href = el.getAttribute('href') || ''
      out += `<a href="${href.replace(/"/g, '&quot;')}">`
      Array.from(el.childNodes).forEach(c => walk(c, true))
      out += '</a>'
      return
    }

    // unknown — рекурсим детей, теряем тег
    Array.from(el.childNodes).forEach(c => walk(c, inlineOnly))
  }

  Array.from(root.childNodes).forEach(c => walk(c))
  // schließen: убрать trailing \n
  return out.replace(/\n+$/, '')
}

/**
 * Telegram HTML → editable HTML для contenteditable.
 * \n → <br>, <tg-spoiler> → <span class="tg-spoiler"> (чтобы браузер CSS-стилизовал).
 */
function telegramToEditable(html: string): string {
  let out = html || ''
  // Нормализовать переносы строк в <br>, сохраняя существующие теги
  out = out.replace(/\r\n/g, '\n')
  // Заменяем \n на <br>, НО только между тегов / текстом — без разрушения атрибутов
  // Просто заменяем все \n — внутри <a href="..."> они не возникают в нашем формате
  out = out.split('\n').join('<br>')
  // tg-spoiler кастомный тег → span для браузера
  out = out.replace(/<tg-spoiler>/gi, '<span class="tg-spoiler">')
  out = out.replace(/<\/tg-spoiler>/gi, '</span>')
  return out
}

const TOOLBAR: Array<{ label: string; title: string; cmd: () => void; style?: string }> = []

export default function RichTextEditor({ value, onChange, placeholder, rows = 4 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const lastEmitted = useRef<string>('')
  const [isEmpty, setIsEmpty] = useState(!value)

  // Sync внешнего value → innerHTML (но только когда оно РЕАЛЬНО отличается
  // от того что мы сами только что отдали — иначе курсор прыгает)
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

  function exec(cmd: string, val?: string) {
    ref.current?.focus()
    document.execCommand(cmd, false, val)
    emit()
  }

  function wrapSelection(tag: string) {
    ref.current?.focus()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    const text = range.toString()
    if (!text) return
    const el = document.createElement(tag === 'tg-spoiler' ? 'span' : tag)
    if (tag === 'tg-spoiler') el.className = 'tg-spoiler'
    el.textContent = text
    range.deleteContents()
    range.insertNode(el)
    // cursor после вставленного
    const r2 = document.createRange()
    r2.setStartAfter(el)
    r2.collapse(true)
    sel.removeAllRanges()
    sel.addRange(r2)
    emit()
  }

  function insertLink() {
    ref.current?.focus()
    const url = prompt('URL ссылки (https://...):', 'https://')
    if (!url || url === 'https://') return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
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
      if (ev.key === 'b' || ev.key === 'B') { ev.preventDefault(); exec('bold') }
      else if (ev.key === 'i' || ev.key === 'I') { ev.preventDefault(); exec('italic') }
      else if (ev.key === 'u' || ev.key === 'U') { ev.preventDefault(); exec('underline') }
    }
  }

  // При вставке — очищаем HTML, оставляем только простой текст (избегаем styled markup из других приложений)
  function onPaste(ev: React.ClipboardEvent<HTMLDivElement>) {
    ev.preventDefault()
    const text = ev.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  const minHeight = Math.max(rows * 24, 72)

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1 px-0.5">
        <button type="button" onClick={() => exec('bold')} title="Жирный (Ctrl+B)"
          className="min-w-7 h-7 px-1.5 rounded text-xs font-bold bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors">B</button>
        <button type="button" onClick={() => exec('italic')} title="Курсив (Ctrl+I)"
          className="min-w-7 h-7 px-1.5 rounded text-xs italic bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors">I</button>
        <button type="button" onClick={() => exec('underline')} title="Подчёркнутый (Ctrl+U)"
          className="min-w-7 h-7 px-1.5 rounded text-xs underline bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors">U</button>
        <button type="button" onClick={() => exec('strikeThrough')} title="Зачёркнутый"
          className="min-w-7 h-7 px-1.5 rounded text-xs line-through bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors">S</button>
        <button type="button" onClick={() => wrapSelection('code')} title="Моноширинный"
          className="min-w-7 h-7 px-1.5 rounded text-[10px] font-mono bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors">{'</>'}</button>
        <button type="button" onClick={() => wrapSelection('blockquote')} title="Цитата"
          className="min-w-7 h-7 px-1.5 rounded text-xs bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors">❝</button>
        <button type="button" onClick={() => wrapSelection('tg-spoiler')} title="Спойлер"
          className="min-w-7 h-7 px-1.5 rounded text-xs bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors">⊘</button>
        <button type="button" onClick={insertLink} title="Ссылка"
          className="min-w-7 h-7 px-1.5 rounded text-xs bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors">🔗</button>
        <button type="button" onClick={() => { if (ref.current) { ref.current.innerHTML = ''; emit() } }} title="Очистить форматирование — удаляет весь текст"
          className="ml-auto text-[10px] text-gray-400 hover:text-gray-600">сбросить</button>
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
