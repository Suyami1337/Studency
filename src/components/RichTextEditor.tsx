'use client'

import { useRef } from 'react'

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}

/**
 * Telegram HTML → HTML пригодный для dangerouslySetInnerHTML в превью.
 * \n → <br>, <tg-spoiler> → <span class="tg-spoiler"> для стилизации.
 */
function toPreviewHtml(text: string): string {
  let out = text || ''
  out = out.replace(/\r\n/g, '\n')
  out = out.split('\n').join('<br>')
  out = out.replace(/<tg-spoiler>/gi, '<span class="tg-spoiler">')
  out = out.replace(/<\/tg-spoiler>/gi, '</span>')
  return out
}

type FormatTag = 'b' | 'i' | 'u' | 's' | 'code' | 'blockquote' | 'tg-spoiler'

export default function RichTextEditor({ value, onChange, placeholder, rows = 4 }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  function wrap(tag: FormatTag) {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = value.substring(start, end)
    const before = `<${tag}>`
    const after = `</${tag}>`

    const insertText = selected
      ? `${before}${selected}${after}`
      : `${before}${after}`

    const newValue = value.substring(0, start) + insertText + value.substring(end)
    onChange(newValue)

    setTimeout(() => {
      if (!ref.current) return
      const cursorPos = selected
        ? start + insertText.length
        : start + before.length
      ref.current.focus()
      ref.current.setSelectionRange(cursorPos, cursorPos)
    }, 0)
  }

  function insertLink() {
    const ta = ref.current
    if (!ta) return
    const url = prompt('URL ссылки (https://...):', 'https://')
    if (!url || url === 'https://') return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = value.substring(start, end) || 'текст ссылки'
    const insertText = `<a href="${url}">${selected}</a>`
    const newValue = value.substring(0, start) + insertText + value.substring(end)
    onChange(newValue)

    setTimeout(() => {
      if (!ref.current) return
      const cursorPos = start + insertText.length
      ref.current.focus()
      ref.current.setSelectionRange(cursorPos, cursorPos)
    }, 0)
  }

  function handleKeyDown(ev: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey) {
      if (ev.key === 'b' || ev.key === 'B') { ev.preventDefault(); wrap('b') }
      else if (ev.key === 'i' || ev.key === 'I') { ev.preventDefault(); wrap('i') }
      else if (ev.key === 'u' || ev.key === 'U') { ev.preventDefault(); wrap('u') }
    }
  }

  const previewHtml = toPreviewHtml(value)
  const hasText = !!(value && value.trim())

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1 px-0.5">
        <button type="button" onClick={() => wrap('b')} title="Жирный (Ctrl+B)"
          className="min-w-7 h-7 px-1.5 rounded text-xs font-bold bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors">B</button>
        <button type="button" onClick={() => wrap('i')} title="Курсив (Ctrl+I)"
          className="min-w-7 h-7 px-1.5 rounded text-xs italic bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors">I</button>
        <button type="button" onClick={() => wrap('u')} title="Подчёркнутый (Ctrl+U)"
          className="min-w-7 h-7 px-1.5 rounded text-xs underline bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors">U</button>
        <button type="button" onClick={() => wrap('s')} title="Зачёркнутый"
          className="min-w-7 h-7 px-1.5 rounded text-xs line-through bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors">S</button>
        <button type="button" onClick={() => wrap('code')} title="Моноширинный"
          className="min-w-7 h-7 px-1.5 rounded text-[10px] font-mono bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors">{'</>'}</button>
        <button type="button" onClick={() => wrap('blockquote')} title="Цитата"
          className="min-w-7 h-7 px-1.5 rounded text-xs bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors">❝</button>
        <button type="button" onClick={() => wrap('tg-spoiler')} title="Спойлер"
          className="min-w-7 h-7 px-1.5 rounded text-xs bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors">⊘</button>
        <button type="button" onClick={insertLink} title="Ссылка"
          className="min-w-7 h-7 px-1.5 rounded text-xs bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors">🔗</button>
        <span className="text-[10px] text-gray-400 ml-2">Выдели текст → жми кнопку</span>
      </div>

      <textarea
        ref={ref}
        value={value}
        onChange={ev => onChange(ev.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-1 focus:ring-[#6A55F8]/20 resize-y font-mono text-[13px]"
      />

      {/* Живой предпросмотр — как клиент увидит в Telegram */}
      {hasText && (
        <div className="mt-2">
          <div className="text-[11px] text-gray-500 mb-1 flex items-center gap-1.5">
            <span>👁</span> Предпросмотр (как увидит клиент в Telegram):
          </div>
          <div
            className="px-3 py-2 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] text-sm text-gray-800 rich-preview whitespace-pre-wrap break-words"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      )}

      <style jsx global>{`
        .rich-preview { line-height: 1.45; }
        .rich-preview b, .rich-preview strong { font-weight: 700 !important; }
        .rich-preview i, .rich-preview em { font-style: italic !important; }
        .rich-preview u, .rich-preview ins { text-decoration: underline !important; }
        .rich-preview s, .rich-preview strike, .rich-preview del { text-decoration: line-through !important; }
        .rich-preview a { color: #6A55F8 !important; text-decoration: underline !important; }
        .rich-preview code {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace !important;
          background: #F3F4F6; padding: 1px 4px; border-radius: 3px; font-size: 0.9em;
        }
        .rich-preview pre {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace !important;
          background: #F3F4F6; padding: 6px 8px; border-radius: 4px;
          white-space: pre-wrap;
        }
        .rich-preview blockquote {
          border-left: 3px solid #6A55F8;
          padding: 2px 10px;
          margin: 4px 0;
          color: #4B5563;
          background: #F9FAFB;
          border-radius: 0 4px 4px 0;
        }
        .rich-preview .tg-spoiler {
          background: #D1D5DB;
          color: transparent;
          text-shadow: 0 0 8px rgba(0,0,0,0.5);
          border-radius: 2px;
          padding: 0 2px;
          cursor: pointer;
        }
        .rich-preview .tg-spoiler:hover {
          color: inherit;
          text-shadow: none;
          background: transparent;
        }
      `}</style>
    </div>
  )
}
