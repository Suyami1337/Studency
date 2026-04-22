'use client'

import { useRef } from 'react'

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  rows?: number
}

// Telegram Bot API HTML parse mode поддерживает эти теги:
// https://core.telegram.org/bots/api#html-style
const BUTTONS: Array<{ label: string; title: string; before: string; after: string; style?: string }> = [
  { label: 'B',  title: 'Жирный (Ctrl+B)',       before: '<b>',           after: '</b>',           style: 'font-bold' },
  { label: 'I',  title: 'Курсив (Ctrl+I)',       before: '<i>',           after: '</i>',           style: 'italic' },
  { label: 'U',  title: 'Подчёркнутый (Ctrl+U)', before: '<u>',           after: '</u>',           style: 'underline' },
  { label: 'S',  title: 'Зачёркнутый',           before: '<s>',           after: '</s>',           style: 'line-through' },
  { label: '</>',title: 'Моноширинный',          before: '<code>',        after: '</code>',        style: 'font-mono text-[10px]' },
  { label: '❝',  title: 'Цитата',                before: '<blockquote>',  after: '</blockquote>' },
  { label: '⊘',  title: 'Спойлер',               before: '<tg-spoiler>',  after: '</tg-spoiler>' },
]

export default function RichTextEditor({ value, onChange, placeholder, className, rows = 4 }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  function wrap(before: string, after: string) {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = value.substring(start, end)
    const newValue = value.substring(0, start) + before + selected + after + value.substring(end)
    onChange(newValue)
    // Восстанавливаем курсор — если был выделен текст, ставим после закрывающего тега;
    // если выделения не было, ставим между тегов чтобы юзер сразу писал
    setTimeout(() => {
      if (!ta) return
      const pos = selected
        ? start + before.length + selected.length + after.length
        : start + before.length
      ta.focus()
      ta.setSelectionRange(pos, pos)
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
    const link = `<a href="${url}">${selected}</a>`
    const newValue = value.substring(0, start) + link + value.substring(end)
    onChange(newValue)
    setTimeout(() => {
      if (!ta) return
      const pos = start + link.length
      ta.focus()
      ta.setSelectionRange(pos, pos)
    }, 0)
  }

  function handleKeyDown(ev: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey) {
      if (ev.key === 'b' || ev.key === 'B') { ev.preventDefault(); wrap('<b>', '</b>') }
      else if (ev.key === 'i' || ev.key === 'I') { ev.preventDefault(); wrap('<i>', '</i>') }
      else if (ev.key === 'u' || ev.key === 'U') { ev.preventDefault(); wrap('<u>', '</u>') }
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1 px-0.5">
        {BUTTONS.map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={() => wrap(b.before, b.after)}
            title={b.title}
            className={`min-w-7 h-7 px-1.5 rounded text-xs bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors ${b.style || ''}`}
          >
            {b.label}
          </button>
        ))}
        <button
          type="button"
          onClick={insertLink}
          title="Ссылка"
          className="min-w-7 h-7 px-1.5 rounded text-xs bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700 flex items-center justify-center transition-colors"
        >
          🔗
        </button>
        <span className="text-[10px] text-gray-400 ml-2">Выдели текст и жми кнопку</span>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={ev => onChange(ev.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={className || 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] resize-y'}
      />
    </div>
  )
}
