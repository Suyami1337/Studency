'use client'

import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { Mark, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'

// Кастомный inline-mark для Telegram-спойлера. Работает как жирный/курсив —
// toggle на выделенном тексте, сериализуется в <tg-spoiler>...</tg-spoiler>.
// Вызывается через editor.chain().toggleMark('spoiler') — addCommands не нужен.
const Spoiler = Mark.create({
  name: 'spoiler',
  parseHTML() {
    return [
      { tag: 'tg-spoiler' },
      { tag: 'span.tg-spoiler' },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return ['tg-spoiler', mergeAttributes(HTMLAttributes), 0]
  },
})

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}

/**
 * Нормализуем TipTap-output в Telegram-совместимый HTML:
 * - `<p>xxx</p>` → `xxx\n` (Telegram не понимает <p>)
 * - `<strong>` → `<b>`, `<em>` → `<i>` (каноничные теги)
 */
function toTelegramHtml(html: string): string {
  let out = html || ''
  // <p>...</p> → ...\n (каждый параграф = новая строка)
  out = out.replace(/<p(?:\s[^>]*)?>/gi, '').replace(/<\/p>/gi, '\n')
  // <strong>→<b>, <em>→<i>
  out = out.replace(/<strong(?:\s[^>]*)?>/gi, '<b>').replace(/<\/strong>/gi, '</b>')
  out = out.replace(/<em(?:\s[^>]*)?>/gi, '<i>').replace(/<\/em>/gi, '</i>')
  // <br> → \n
  out = out.replace(/<br\s*\/?>/gi, '\n')
  // Убираем trailing \n и пустые параграфы
  out = out.replace(/\n+$/g, '')
  return out
}

/**
 * Telegram HTML → HTML пригодный для TipTap.
 * Заменяем \n на <br>, <b>→<strong>, <i>→<em> (TipTap использует их внутри).
 */
function fromTelegramHtml(html: string): string {
  let out = html || ''
  out = out.split('\n').join('<br>')
  return out
}

export default function RichTextEditor({ value, onChange, placeholder, rows = 4 }: Props) {
  const lastEmitted = useRef<string>('')

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        codeBlock: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
        },
      }),
      Spoiler,
    ],
    content: fromTelegramHtml(value),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'rich-editor-tiptap px-3 py-2 min-h-[100px] focus:outline-none',
      },
    },
    onUpdate: ({ editor }) => {
      const rawHtml = editor.getHTML()
      const normalized = toTelegramHtml(rawHtml)
      lastEmitted.current = normalized
      onChange(normalized)
    },
  })

  useEffect(() => {
    if (!editor) return
    if (value === lastEmitted.current) return
    const editable = fromTelegramHtml(value)
    // Сравниваем с текущим — чтобы не сбрасывать курсор при равных значениях
    if (editor.getHTML() !== editable) {
      editor.commands.setContent(editable, { emitUpdate: false })
      lastEmitted.current = value || ''
    }
  }, [value, editor])

  const minHeight = Math.max(rows * 24, 96)

  function setLink() {
    if (!editor) return
    const prev = editor.getAttributes('link').href
    const url = prompt('URL ссылки (https://...):', prev || 'https://')
    if (url === null) return
    if (!url || url === 'https://') {
      editor.chain().focus().unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  // Спойлер — inline mark через кастомное расширение, работает как bold/italic
  function toggleSpoiler() {
    if (!editor) return
    editor.chain().focus().toggleMark('spoiler').run()
  }

  // Цитата: blockquote — блочный элемент (и в HTML, и в Telegram), охватывает
  // целый абзац. Если юзер выделил только часть абзаца — разбиваем абзац
  // так, чтобы только выделенное оказалось в blockquote.
  function toggleBlockquoteSmart() {
    if (!editor) return
    const { from, to } = editor.state.selection
    if (from === to) {
      editor.chain().focus().toggleBlockquote().run()
      return
    }
    // Уже в blockquote — снимаем
    if (editor.isActive('blockquote')) {
      editor.chain().focus().toggleBlockquote().run()
      return
    }
    // Проверяем: выделение покрывает весь текущий параграф или только часть
    const $from = editor.state.doc.resolve(from)
    const paragraphStart = $from.start($from.depth)
    const paragraphEnd = $from.end($from.depth)
    if (from <= paragraphStart && to >= paragraphEnd) {
      // Весь параграф — просто toggle
      editor.chain().focus().toggleBlockquote().run()
      return
    }
    // Часть параграфа — разбиваем: до, blockquote, после
    editor.chain()
      .focus()
      .command(({ tr, dispatch }) => {
        if (dispatch) {
          // Сначала разбиваем в конце выделения
          tr.split(to)
          // Потом в начале (индексы сдвинулись)
          tr.split(from)
        }
        return true
      })
      .setTextSelection({ from: from + 1, to: to + 1 })
      .toggleBlockquote()
      .run()
  }

  if (!editor) {
    return (
      <div className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-400" style={{ minHeight: `${minHeight}px` }}>
        Загрузка редактора…
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1 px-0.5">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}
          title="Жирный (Ctrl+B)"
          className={`min-w-7 h-7 px-1.5 rounded text-xs font-bold transition-colors flex items-center justify-center ${editor.isActive('bold') ? 'bg-[#6A55F8] text-white' : 'bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700'}`}>B</button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Курсив (Ctrl+I)"
          className={`min-w-7 h-7 px-1.5 rounded text-xs italic transition-colors flex items-center justify-center ${editor.isActive('italic') ? 'bg-[#6A55F8] text-white' : 'bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700'}`}>I</button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Подчёркнутый (Ctrl+U)"
          className={`min-w-7 h-7 px-1.5 rounded text-xs underline transition-colors flex items-center justify-center ${editor.isActive('underline') ? 'bg-[#6A55F8] text-white' : 'bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700'}`}>U</button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Зачёркнутый"
          className={`min-w-7 h-7 px-1.5 rounded text-xs line-through transition-colors flex items-center justify-center ${editor.isActive('strike') ? 'bg-[#6A55F8] text-white' : 'bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700'}`}>S</button>
        <button type="button" onClick={() => editor.chain().focus().toggleCode().run()}
          title="Моноширинный"
          className={`min-w-7 h-7 px-1.5 rounded text-[10px] font-mono transition-colors flex items-center justify-center ${editor.isActive('code') ? 'bg-[#6A55F8] text-white' : 'bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700'}`}>{'</>'}</button>
        <button type="button" onClick={toggleBlockquoteSmart}
          title="Цитата (блочная — охватывает строку)"
          className={`min-w-7 h-7 px-1.5 rounded text-xs transition-colors flex items-center justify-center ${editor.isActive('blockquote') ? 'bg-[#6A55F8] text-white' : 'bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700'}`}>❝</button>
        <button type="button" onClick={toggleSpoiler}
          title="Спойлер"
          className={`min-w-7 h-7 px-1.5 rounded text-xs transition-colors flex items-center justify-center ${editor.isActive('spoiler') ? 'bg-[#6A55F8] text-white' : 'bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700'}`}>⊘</button>
        <button type="button" onClick={setLink}
          title="Ссылка"
          className={`min-w-7 h-7 px-1.5 rounded text-xs transition-colors flex items-center justify-center ${editor.isActive('link') ? 'bg-[#6A55F8] text-white' : 'bg-gray-100 hover:bg-[#F0EDFF] hover:text-[#6A55F8] text-gray-700'}`}>🔗</button>
      </div>

      <div
        className="rounded-lg border border-gray-200 text-sm focus-within:border-[#6A55F8] focus-within:ring-1 focus-within:ring-[#6A55F8]/20 relative"
        style={{ minHeight: `${minHeight}px` }}
      >
        <EditorContent editor={editor} />
        {editor.isEmpty && placeholder && (
          <div className="absolute top-2 left-3 text-sm text-gray-400 pointer-events-none select-none">
            {placeholder}
          </div>
        )}
      </div>

      <style jsx global>{`
        .rich-editor-tiptap {
          outline: none;
          line-height: 1.45;
          word-break: break-word;
        }
        .rich-editor-tiptap p { margin: 0; }
        .rich-editor-tiptap p + p { margin-top: 0.3em; }
        .rich-editor-tiptap strong, .rich-editor-tiptap b { font-weight: 700 !important; }
        .rich-editor-tiptap em, .rich-editor-tiptap i { font-style: italic !important; }
        .rich-editor-tiptap u { text-decoration: underline !important; }
        .rich-editor-tiptap s, .rich-editor-tiptap strike, .rich-editor-tiptap del {
          text-decoration: line-through !important;
        }
        .rich-editor-tiptap a {
          color: #6A55F8 !important;
          text-decoration: underline !important;
          cursor: pointer;
        }
        .rich-editor-tiptap code {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace !important;
          background: #F3F4F6;
          padding: 1px 4px;
          border-radius: 3px;
          font-size: 0.9em;
        }
        .rich-editor-tiptap blockquote {
          border-left: 3px solid #6A55F8;
          padding: 2px 10px;
          margin: 4px 0;
          color: #4B5563;
          background: #F9FAFB;
          border-radius: 0 4px 4px 0;
        }
        .rich-editor-tiptap tg-spoiler {
          background: #D1D5DB;
          color: transparent;
          text-shadow: 0 0 8px rgba(0,0,0,0.5);
          border-radius: 2px;
          padding: 0 2px;
          cursor: pointer;
        }
        .rich-editor-tiptap tg-spoiler:hover {
          color: inherit;
          text-shadow: none;
          background: transparent;
        }
      `}</style>
    </div>
  )
}
