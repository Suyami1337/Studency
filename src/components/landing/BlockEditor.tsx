'use client'

/**
 * BlockEditor — блочный редактор лендинга (Tilda-подобный).
 *
 * Архитектура:
 *  - Слева: список блоков (drag-n-drop для порядка, иконка типа, имя, скрыть/удалить)
 *  - По центру: превью всего лендинга в iframe (собирается клиентски из блоков)
 *  - Сверху превью: тулбар с desktop/mobile переключателем и inline-форматированием
 *  - При клике на блок в списке — он становится "активным" (подсвечивается в iframe)
 *
 * Desktop/Mobile:
 *  - В режиме desktop изменения стилей пишутся в block.desktop_styles
 *  - В режиме mobile — в block.mobile_styles (попадают в @media (max-width: 640px))
 *  - Контент (текст, картинки, видео) — общий, меняется одинаково в обоих режимах
 *
 * Сохранение:
 *  - Каждое изменение ставит блок в dirty (setLocalBlocks)
 *  - Кнопка Сохранить делает PATCH на каждый изменённый блок
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { assembleLandingHtml, type LandingBlock, type BlockType, type StyleOverrides } from '@/lib/landing-blocks'

type Viewport = 'desktop' | 'mobile'

type Props = {
  landingId: string
  landingName: string
  onSave: () => void  // родитель перечитает список landings если нужно
}

const BLOCK_TYPE_META: Record<BlockType, { icon: string; label: string; description: string }> = {
  custom_html: { icon: '📝', label: 'HTML', description: 'Сырой HTML для продвинутых' },
  hero:        { icon: '🎯', label: 'Hero',  description: 'Заголовок + подзаголовок + CTA' },
  text:        { icon: '¶',  label: 'Текст', description: 'Параграф текста' },
  image:       { icon: '🖼', label: 'Картинка', description: 'Изображение' },
  video:       { icon: '🎬', label: 'Видео', description: 'Встроенное видео' },
  cta:         { icon: '👉', label: 'CTA', description: 'Большая кнопка-призыв' },
  zero:        { icon: '🎨', label: 'Холст', description: 'Свободное размещение элементов' },
}

export function BlockEditor({ landingId, landingName, onSave }: Props) {
  const [blocks, setBlocks] = useState<LandingBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState<{ afterId: string | null } | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [hasSelection, setHasSelection] = useState(false)

  const activeBlock = blocks.find(b => b.id === activeBlockId) ?? null

  // ─── Загрузка блоков + lazy-миграция если нужно ────────────────────────
  const loadBlocks = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/landings/${landingId}/blocks`)
    const json = await res.json()
    if (json.ok) {
      // Если не блочный И есть legacy HTML — сразу мигрируем в один блок
      if (!json.isBlocksBased && json.hasLegacyHtml) {
        await fetch(`/api/landings/${landingId}/blocks?migrate=1`, { method: 'POST' })
        const res2 = await fetch(`/api/landings/${landingId}/blocks`)
        const json2 = await res2.json()
        setBlocks(json2.blocks ?? [])
        if ((json2.blocks ?? []).length > 0) setActiveBlockId(json2.blocks[0].id)
      } else {
        setBlocks(json.blocks ?? [])
        if ((json.blocks ?? []).length > 0 && !activeBlockId) setActiveBlockId(json.blocks[0].id)
      }
    }
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landingId])

  useEffect(() => { void loadBlocks() }, [loadBlocks])

  // ─── Локальные правки: только в state, save отправит на бэк ───────────
  function updateBlockLocal(id: string, patch: Partial<LandingBlock>) {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b))
    setDirty(prev => new Set([...prev, id]))
  }

  async function handleSaveAll() {
    if (dirty.size === 0) return
    setSaving(true)
    for (const id of dirty) {
      const b = blocks.find(x => x.id === id)
      if (!b) continue
      await fetch(`/api/landings/${landingId}/blocks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: b.name,
          html_content: b.html_content,
          content: b.content,
          desktop_styles: b.desktop_styles,
          mobile_styles: b.mobile_styles,
          layout: b.layout,
          is_hidden: b.is_hidden,
          block_type: b.block_type,
        }),
      })
    }
    setDirty(new Set())
    setSaving(false)
    onSave()
  }

  async function handleAddBlock(type: BlockType, afterId: string | null) {
    const res = await fetch(`/api/landings/${landingId}/blocks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ block_type: type, after_block_id: afterId ?? undefined }),
    })
    const json = await res.json()
    if (json.ok) {
      await loadBlocks()
      setActiveBlockId(json.block.id)
    }
    setShowAddMenu(null)
  }

  async function handleDeleteBlock(id: string) {
    if (!confirm('Удалить этот блок?')) return
    await fetch(`/api/landings/${landingId}/blocks/${id}`, { method: 'DELETE' })
    setBlocks(prev => prev.filter(b => b.id !== id))
    setDirty(prev => { const n = new Set(prev); n.delete(id); return n })
    if (activeBlockId === id) {
      const rest = blocks.filter(b => b.id !== id)
      setActiveBlockId(rest[0]?.id ?? null)
    }
  }

  function handleToggleHidden(id: string) {
    const b = blocks.find(x => x.id === id)
    if (!b) return
    updateBlockLocal(id, { is_hidden: !b.is_hidden })
  }

  // ─── Drag-n-drop порядка блоков ────────────────────────────────────────
  async function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) return
    const fromIdx = blocks.findIndex(b => b.id === draggedId)
    const toIdx = blocks.findIndex(b => b.id === targetId)
    if (fromIdx < 0 || toIdx < 0) return
    const next = [...blocks]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    const reordered = next.map((b, i) => ({ ...b, order_position: i }))
    setBlocks(reordered)
    setDraggedId(null)
    setDropTargetId(null)
    // Сохраняем порядок на бэк
    await fetch(`/api/landings/${landingId}/blocks?reorder=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: reordered.map(b => b.id) }),
    })
  }

  // ─── Inline-форматирование (работает в iframe preview) ────────────────
  function applyFormat(command: string, value?: string) {
    const doc = iframeRef.current?.contentDocument
    const win = iframeRef.current?.contentWindow
    if (!doc || !win) return
    win.focus()
    try {
      doc.execCommand(command, false, value)
      syncActiveBlockFromIframe()
    } catch { /* ignore */ }
  }

  function applyFontSize(px: number) {
    const doc = iframeRef.current?.contentDocument
    const win = iframeRef.current?.contentWindow
    if (!doc || !win) return
    const sel = doc.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
    const range = sel.getRangeAt(0)
    const span = doc.createElement('span')
    span.style.fontSize = `${px}px`
    try {
      range.surroundContents(span)
      win.focus()
      syncActiveBlockFromIframe()
    } catch { /* ignore */ }
  }

  /** Синхронизировать innerHTML активного блока из iframe в state */
  function syncActiveBlockFromIframe() {
    if (!activeBlockId) return
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    const section = doc.querySelector(`[data-block-id="${activeBlockId}"]`)
    if (!section) return
    const inner = section.querySelector(':scope > .block-inner')
    if (!inner) return
    const newHtml = inner.innerHTML
    // Пишем в html_content для custom_html, для остальных — в content.text (для text-блока) или разбираем
    const b = blocks.find(x => x.id === activeBlockId)
    if (!b) return
    if (b.block_type === 'custom_html') {
      updateBlockLocal(b.id, { html_content: newHtml })
    } else if (b.block_type === 'text') {
      updateBlockLocal(b.id, { content: { ...b.content, text: newHtml } })
    } else {
      // Для hero/cta/image/video — не сохраняем сырой HTML через inline-edit,
      // эти блоки редактируются через структурированные поля справа
      // (но позволим менять текст заголовков — они внутри inner тоже)
      updateBlockLocal(b.id, { html_content: newHtml })  // можно улучшить потом
    }
  }

  // ─── Слушаем postMessage от iframe: клик по блоку, selection, input, zero-move ──
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const src = iframeRef.current?.contentWindow
      if (!src || e.source !== src) return
      const data = e.data
      if (!data || typeof data !== 'object') return
      if (data.type === 'stud-block-click' && typeof data.blockId === 'string') {
        setActiveBlockId(data.blockId)
      } else if (data.type === 'stud-selection') {
        setHasSelection(Boolean(data.has))
      } else if (data.type === 'stud-input') {
        syncActiveBlockFromIframe()
      } else if (data.type === 'stud-zero-move' && typeof data.blockId === 'string') {
        // Перемещение zero-item внутри zero-блока
        const b = blocks.find(x => x.id === data.blockId)
        if (!b || b.block_type !== 'zero') return
        const items = (b.content.zeroItems || []).map(it =>
          it.id === data.itemId ? { ...it, x: Math.max(0, Math.round(data.x)), y: Math.max(0, Math.round(data.y)) } : it
        )
        updateBlockLocal(b.id, { content: { ...b.content, zeroItems: items } })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBlockId, blocks])

  // ─── Сборка HTML для iframe preview ───────────────────────────────────
  const previewDoc = assembleLandingHtml(blocks, {
    title: landingName,
  }) + `
<style data-stud-editor>
  [data-block-id] { cursor: pointer; transition: outline 0.15s; }
  [data-block-id]:hover { outline: 2px dashed rgba(106,85,248,0.5); outline-offset: -2px; }
  [data-block-id].stud-active { outline: 2px solid #6A55F8; outline-offset: -2px; }
  [contenteditable="true"]:focus { outline: 2px solid #F59E0B; outline-offset: 2px; }
  .zero-item { cursor: move; }
  .zero-item:hover { outline: 2px dashed rgba(106,85,248,0.6); }
  .zero-item.stud-dragging { opacity: 0.7; outline: 2px solid #6A55F8; }
</style>
<script data-stud-editor>
  (function() {
    var ACTIVE = ${JSON.stringify(activeBlockId)};
    // Подсветка активного
    document.querySelectorAll('[data-block-id]').forEach(function(el) {
      if (el.getAttribute('data-block-id') === ACTIVE) el.classList.add('stud-active');
      el.addEventListener('click', function(e) {
        var blockId = el.getAttribute('data-block-id');
        if (!blockId) return;
        e.stopPropagation();
        parent.postMessage({ type: 'stud-block-click', blockId: blockId }, '*');
      });
    });
    // Делаем контент блоков редактируемым
    document.querySelectorAll('[data-block-id] .block-inner').forEach(function(inner) {
      var blockType = inner.parentElement.getAttribute('data-block-type');
      // custom_html и text — редактируем целиком; типизированные — только текстовые узлы
      var BLOCK_SEL = 'h1, h2, h3, h4, h5, h6, p, li, td, th, label, blockquote';
      inner.querySelectorAll(BLOCK_SEL).forEach(function(el) {
        if (el.textContent.trim()) el.setAttribute('contenteditable', 'true');
      });
      var INLINE_SEL = 'a, button, span, b, i, em, strong';
      inner.querySelectorAll(INLINE_SEL).forEach(function(el) {
        if (!el.textContent.trim()) return;
        if (el.closest('[contenteditable="true"]')) return;
        el.setAttribute('contenteditable', 'true');
      });
      inner.querySelectorAll('div').forEach(function(el) {
        if (el.children.length > 0) return;
        if (!el.textContent.trim()) return;
        if (el.closest('[contenteditable="true"]')) return;
        el.setAttribute('contenteditable', 'true');
      });
    });
    // Selection → parent
    document.addEventListener('selectionchange', function() {
      var sel = document.getSelection();
      var has = !!(sel && sel.rangeCount > 0 && !sel.isCollapsed);
      parent.postMessage({ type: 'stud-selection', has: has }, '*');
    });
    // Input → parent
    document.addEventListener('input', function() {
      parent.postMessage({ type: 'stud-input' }, '*');
    });

    // Zero-item drag внутри zero-блока
    (function initZeroDrag() {
      document.querySelectorAll('.zero-item').forEach(function(item) {
        var el = item;
        var state = null;
        el.addEventListener('mousedown', function(e) {
          if (e.target.closest('[contenteditable="true"]')) return;
          e.preventDefault();
          var rect = el.getBoundingClientRect();
          var canvas = el.parentElement;
          var canvasRect = canvas.getBoundingClientRect();
          state = {
            startX: e.clientX,
            startY: e.clientY,
            origLeft: rect.left - canvasRect.left,
            origTop: rect.top - canvasRect.top,
            canvasLeft: canvasRect.left,
            canvasTop: canvasRect.top,
          };
          el.classList.add('stud-dragging');
        });
        document.addEventListener('mousemove', function(e) {
          if (!state) return;
          var dx = e.clientX - state.startX;
          var dy = e.clientY - state.startY;
          var newX = state.origLeft + dx;
          var newY = state.origTop + dy;
          el.style.left = newX + 'px';
          el.style.top = newY + 'px';
        });
        document.addEventListener('mouseup', function() {
          if (!state) return;
          el.classList.remove('stud-dragging');
          var blockId = el.getAttribute('data-zero-block-id');
          var itemId = el.getAttribute('data-zero-id');
          parent.postMessage({
            type: 'stud-zero-move',
            blockId: blockId,
            itemId: itemId,
            x: parseFloat(el.style.left) || 0,
            y: parseFloat(el.style.top) || 0,
          }, '*');
          state = null;
        });
      });
    })();
  })();
</script>`

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-160px)] min-h-[700px] gap-4">
      {/* ── Левый сайдбар: список блоков ── */}
      <aside className="w-72 bg-white rounded-xl border border-gray-100 flex flex-col overflow-hidden flex-shrink-0">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Блоки ({blocks.length})</h3>
          <button
            onClick={() => setShowAddMenu({ afterId: null })}
            className="text-xs text-[#6A55F8] font-medium hover:underline"
            title="Добавить блок в конец"
          >
            + Добавить
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <p className="text-xs text-gray-400 p-3">Загрузка...</p>
          ) : blocks.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-sm text-gray-500 mb-3">Нет блоков</p>
              <button
                onClick={() => setShowAddMenu({ afterId: null })}
                className="text-xs text-[#6A55F8] font-medium"
              >
                + Создать первый блок
              </button>
            </div>
          ) : (
            blocks.map((b) => {
              const meta = BLOCK_TYPE_META[b.block_type]
              const isActive = b.id === activeBlockId
              const isDirty = dirty.has(b.id)
              const isDragging = draggedId === b.id
              const isDropTarget = dropTargetId === b.id && draggedId !== b.id
              return (
                <div
                  key={b.id}
                  draggable
                  onDragStart={() => setDraggedId(b.id)}
                  onDragEnd={() => { setDraggedId(null); setDropTargetId(null) }}
                  onDragOver={(e) => { e.preventDefault(); setDropTargetId(b.id) }}
                  onDrop={(e) => { e.preventDefault(); void handleDrop(b.id) }}
                  onClick={() => setActiveBlockId(b.id)}
                  className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                    isActive ? 'bg-[#F0EDFF] border border-[#6A55F8]/40' : 'hover:bg-gray-50 border border-transparent'
                  } ${isDragging ? 'opacity-40' : ''} ${isDropTarget ? 'border-t-2 border-t-[#6A55F8]' : ''}`}
                >
                  <span className="text-gray-400 text-xs cursor-grab" title="Перетащить">⋮⋮</span>
                  <span className="text-lg">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className={`text-sm font-medium truncate ${b.is_hidden ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                        {b.name || meta.label}
                      </span>
                      {isDirty && <span className="w-1.5 h-1.5 bg-amber-500 rounded-full flex-shrink-0" title="Не сохранено" />}
                    </div>
                    <p className="text-[10px] text-gray-400 truncate">{meta.label}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleHidden(b.id) }}
                      className="text-gray-400 hover:text-gray-700 text-xs p-1"
                      title={b.is_hidden ? 'Показать' : 'Скрыть'}
                    >
                      {b.is_hidden ? '👁' : '👁‍🗨'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleDeleteBlock(b.id) }}
                      className="text-gray-300 hover:text-red-500 text-xs p-1"
                      title="Удалить"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
        <div className="p-3 border-t border-gray-100">
          <button
            onClick={() => void handleSaveAll()}
            disabled={saving || dirty.size === 0}
            className={`w-full px-3 py-2 text-sm rounded-lg font-medium transition-colors disabled:opacity-60 ${
              dirty.size > 0
                ? 'bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100'
                : 'border border-gray-200 text-gray-500'
            }`}
          >
            {saving ? 'Сохранение...' : dirty.size > 0 ? `● Сохранить (${dirty.size})` : '✓ Сохранено'}
          </button>
        </div>
      </aside>

      {/* ── Центральная часть: тулбар + iframe превью ── */}
      <main className="flex-1 bg-white rounded-xl border border-gray-100 flex flex-col overflow-hidden">
        {/* Top toolbar: viewport + format */}
        <div className="border-b border-gray-100 px-3 py-2 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button onClick={() => setViewport('desktop')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium ${viewport === 'desktop' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              🖥 Desktop
            </button>
            <button onClick={() => setViewport('mobile')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium ${viewport === 'mobile' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              📱 Mobile
            </button>
          </div>
          <div className="w-px h-5 bg-gray-200" />
          <FormatButtons hasSelection={hasSelection} onFormat={applyFormat} onFontSize={applyFontSize} />
          <div className="ml-auto text-xs text-gray-400">
            {viewport === 'mobile' ? 'Правки стилей → только для мобильной' : 'Правки стилей → только для десктопа'}
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-gray-50 p-4 flex items-start justify-center">
          <div
            className={`bg-white shadow-xl transition-all ${
              viewport === 'mobile' ? 'w-[390px] rounded-[2rem] border-[8px] border-gray-800 overflow-hidden' : 'w-full max-w-[1280px] rounded-lg'
            }`}
            style={{ minHeight: '500px' }}
          >
            <iframe
              ref={iframeRef}
              srcDoc={previewDoc}
              className="w-full border-0"
              style={{ height: viewport === 'mobile' ? '720px' : 'calc(100vh - 280px)', minHeight: '500px' }}
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </div>
      </main>

      {/* ── Правая панель: настройки активного блока ── */}
      <aside className="w-80 bg-white rounded-xl border border-gray-100 flex flex-col overflow-hidden flex-shrink-0">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Настройки блока</h3>
          {activeBlock && <p className="text-xs text-gray-400 mt-0.5">{BLOCK_TYPE_META[activeBlock.block_type].label}</p>}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!activeBlock ? (
            <p className="text-xs text-gray-400 text-center py-8">Выбери блок слева или создай новый</p>
          ) : (
            <BlockSettingsPanel block={activeBlock} viewport={viewport} onChange={(patch) => updateBlockLocal(activeBlock.id, patch)} />
          )}
        </div>
      </aside>

      {/* ── Add block menu modal ── */}
      {showAddMenu && (
        <AddBlockMenu
          onClose={() => setShowAddMenu(null)}
          onPick={(type) => void handleAddBlock(type, showAddMenu.afterId)}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

function FormatButtons({
  hasSelection, onFormat, onFontSize,
}: {
  hasSelection: boolean
  onFormat: (cmd: string, val?: string) => void
  onFontSize: (px: number) => void
}) {
  const SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 64, 72]
  const COLORS = ['#111827', '#FFFFFF', '#6A55F8', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#EC4899']
  return (
    <div className={`flex items-center gap-0.5 ${hasSelection ? 'opacity-100' : 'opacity-50'}`}>
      <button onMouseDown={e => { e.preventDefault(); onFormat('bold') }} disabled={!hasSelection}
        className="w-8 h-8 rounded text-sm font-bold hover:bg-gray-100 disabled:opacity-40">B</button>
      <button onMouseDown={e => { e.preventDefault(); onFormat('italic') }} disabled={!hasSelection}
        className="w-8 h-8 rounded text-sm italic hover:bg-gray-100 disabled:opacity-40">I</button>
      <button onMouseDown={e => { e.preventDefault(); onFormat('underline') }} disabled={!hasSelection}
        className="w-8 h-8 rounded text-sm underline hover:bg-gray-100 disabled:opacity-40">U</button>
      <select
        onMouseDown={e => e.preventDefault()}
        onChange={e => { if (e.target.value) { onFontSize(Number(e.target.value)); e.target.value = '' } }}
        disabled={!hasSelection}
        className="ml-1 px-2 py-1 text-xs border border-gray-200 rounded disabled:opacity-40"
        defaultValue=""
      >
        <option value="">Размер</option>
        {SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
      </select>
      <div className="flex items-center gap-0.5 ml-1">
        {COLORS.map(c => (
          <button key={c} onMouseDown={e => { e.preventDefault(); onFormat('foreColor', c) }} disabled={!hasSelection}
            title={c} className="w-5 h-5 rounded border border-gray-300 disabled:opacity-40" style={{ background: c }} />
        ))}
      </div>
      <button onMouseDown={e => { e.preventDefault(); onFormat('justifyLeft') }} disabled={!hasSelection}
        className="ml-1 w-8 h-8 rounded text-xs hover:bg-gray-100 disabled:opacity-40" title="По левому краю">⬅</button>
      <button onMouseDown={e => { e.preventDefault(); onFormat('justifyCenter') }} disabled={!hasSelection}
        className="w-8 h-8 rounded text-xs hover:bg-gray-100 disabled:opacity-40" title="По центру">↔</button>
      <button onMouseDown={e => { e.preventDefault(); onFormat('justifyRight') }} disabled={!hasSelection}
        className="w-8 h-8 rounded text-xs hover:bg-gray-100 disabled:opacity-40" title="По правому краю">➡</button>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

function BlockSettingsPanel({
  block, viewport, onChange,
}: {
  block: LandingBlock
  viewport: Viewport
  onChange: (patch: Partial<LandingBlock>) => void
}) {
  const layout = block.layout || {}
  const mobileLayout = layout.mobile || {}
  const isMobile = viewport === 'mobile'

  function patchLayout(k: string, v: string | number | boolean | undefined) {
    if (isMobile) {
      onChange({ layout: { ...layout, mobile: { ...mobileLayout, [k]: v } } })
    } else {
      onChange({ layout: { ...layout, [k]: v } })
    }
  }

  // Стиль-override по селектору `&` (сам блок) — записывается в правильный набор
  function patchSelfStyle(prop: string, value: string) {
    const key = '&'
    const styles: StyleOverrides = isMobile ? (block.mobile_styles || {}) : (block.desktop_styles || {})
    const existing = styles[key] || {}
    const updated = { ...styles, [key]: { ...existing, [prop]: value } }
    onChange(isMobile ? { mobile_styles: updated } : { desktop_styles: updated })
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Имя блока</label>
        <input type="text" value={block.name ?? ''} onChange={e => onChange({ name: e.target.value })}
          className="w-full px-2.5 py-1.5 rounded border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
      </div>

      {/* Тип-специфичные поля */}
      {block.block_type === 'hero' && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Заголовок</label>
            <input type="text" value={block.content.headline ?? ''} onChange={e => onChange({ content: { ...block.content, headline: e.target.value } })}
              className="w-full px-2.5 py-1.5 rounded border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Подзаголовок</label>
            <textarea rows={2} value={block.content.subheadline ?? ''} onChange={e => onChange({ content: { ...block.content, subheadline: e.target.value } })}
              className="w-full px-2.5 py-1.5 rounded border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Текст кнопки</label>
            <input type="text" value={block.content.ctaText ?? ''} onChange={e => onChange({ content: { ...block.content, ctaText: e.target.value } })}
              className="w-full px-2.5 py-1.5 rounded border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Ссылка кнопки</label>
            <input type="url" value={block.content.ctaUrl ?? ''} onChange={e => onChange({ content: { ...block.content, ctaUrl: e.target.value } })}
              placeholder="https://..." className="w-full px-2.5 py-1.5 rounded border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
          </div>
        </>
      )}

      {block.block_type === 'image' && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">URL картинки</label>
            <input type="url" value={block.content.src ?? ''} onChange={e => onChange({ content: { ...block.content, src: e.target.value } })}
              placeholder="https://..." className="w-full px-2.5 py-1.5 rounded border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Alt-текст</label>
            <input type="text" value={block.content.alt ?? ''} onChange={e => onChange({ content: { ...block.content, alt: e.target.value } })}
              className="w-full px-2.5 py-1.5 rounded border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
          </div>
        </>
      )}

      {block.block_type === 'video' && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">ID видео (UUID)</label>
          <input type="text" value={block.content.videoId ?? ''} onChange={e => onChange({ content: { ...block.content, videoId: e.target.value } })}
            placeholder="uuid из видеохостинга" className="w-full px-2.5 py-1.5 rounded border border-gray-200 text-sm font-mono focus:outline-none focus:border-[#6A55F8]" />
          <p className="text-[10px] text-gray-400 mt-1">Найди видео во вкладке «Видеохостинг», скопируй ID</p>
        </div>
      )}

      {block.block_type === 'cta' && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Текст кнопки</label>
            <input type="text" value={block.content.buttonText ?? ''} onChange={e => onChange({ content: { ...block.content, buttonText: e.target.value } })}
              className="w-full px-2.5 py-1.5 rounded border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Ссылка</label>
            <input type="url" value={block.content.buttonUrl ?? ''} onChange={e => onChange({ content: { ...block.content, buttonUrl: e.target.value } })}
              placeholder="https://..." className="w-full px-2.5 py-1.5 rounded border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
          </div>
        </>
      )}

      {block.block_type === 'custom_html' && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">HTML-код</label>
          <textarea rows={10} value={block.html_content ?? ''} onChange={e => onChange({ html_content: e.target.value })}
            className="w-full px-2.5 py-1.5 rounded border border-gray-200 text-xs font-mono focus:outline-none focus:border-[#6A55F8] resize-y" />
          <p className="text-[10px] text-gray-400 mt-1">Сырой HTML. Можно редактировать визуально кликом по тексту в превью.</p>
        </div>
      )}

      {block.block_type === 'zero' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">Холст: элементы можно перетаскивать мышью прямо в превью.</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                const items = block.content.zeroItems || []
                const newItem = {
                  id: `zi_${Date.now().toString(36)}`,
                  type: 'text' as const,
                  x: 40 + (items.length * 20),
                  y: 40 + (items.length * 20),
                  width: 200,
                  height: 60,
                  content: '<p style="margin:0;padding:10px;font-size:18px">Новый текст</p>',
                }
                onChange({ content: { ...block.content, zeroItems: [...items, newItem] } })
              }}
              className="px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg hover:border-[#6A55F8] hover:bg-[#F8F7FF]"
            >
              + Текст
            </button>
            <button
              onClick={() => {
                const url = prompt('URL картинки:')
                if (!url) return
                const items = block.content.zeroItems || []
                const newItem = {
                  id: `zi_${Date.now().toString(36)}`,
                  type: 'image' as const,
                  x: 40 + (items.length * 20),
                  y: 40 + (items.length * 20),
                  width: 200,
                  height: 200,
                  content: `<img src="${url.replace(/"/g, '&quot;')}" style="width:100%;height:100%;object-fit:cover;border-radius:8px" />`,
                }
                onChange({ content: { ...block.content, zeroItems: [...items, newItem] } })
              }}
              className="px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg hover:border-[#6A55F8] hover:bg-[#F8F7FF]"
            >
              + Картинка
            </button>
          </div>
          {(block.content.zeroItems || []).length > 0 && (
            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
              <p className="text-[11px] text-gray-500 mb-1">Элементы ({(block.content.zeroItems || []).length}):</p>
              {(block.content.zeroItems || []).map((it) => (
                <div key={it.id} className="flex items-center gap-2 text-[11px] bg-gray-50 rounded px-2 py-1">
                  <span className="text-gray-400">{it.type === 'text' ? '¶' : '🖼'}</span>
                  <span className="flex-1 truncate">{it.x},{it.y} · {it.width}×{it.height}</span>
                  <button onClick={() => {
                    const items = (block.content.zeroItems || []).filter(x => x.id !== it.id)
                    onChange({ content: { ...block.content, zeroItems: items } })
                  }} className="text-gray-400 hover:text-red-500">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-gray-100 pt-4 space-y-3">
        <h4 className="text-xs font-semibold text-gray-700">
          Лейаут ({isMobile ? 'мобильная версия' : 'десктоп'})
        </h4>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Вертикальный отступ (px)</label>
          <input type="number" min={0} max={300}
            value={(isMobile ? mobileLayout.paddingY : layout.paddingY) ?? ''}
            onChange={e => patchLayout('paddingY', e.target.value ? Number(e.target.value) : undefined)}
            placeholder={isMobile ? 'как в десктопе' : '64'}
            className="w-full px-2 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:border-[#6A55F8]" />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Макс. ширина контейнера (px)</label>
          <input type="number" min={320} max={1600}
            value={(isMobile ? mobileLayout.maxWidth : layout.maxWidth) ?? ''}
            onChange={e => patchLayout('maxWidth', e.target.value ? Number(e.target.value) : undefined)}
            placeholder={isMobile ? 'как в десктопе' : '880'}
            className="w-full px-2 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:border-[#6A55F8]" />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Выравнивание</label>
          <select
            value={(isMobile ? mobileLayout.align : layout.align) ?? ''}
            onChange={e => patchLayout('align', e.target.value || undefined)}
            className="w-full px-2 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:border-[#6A55F8]"
          >
            <option value="">{isMobile ? 'как в десктопе' : 'по центру'}</option>
            <option value="left">По левому</option>
            <option value="center">По центру</option>
            <option value="right">По правому</option>
          </select>
        </div>
        {!isMobile && (
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Цвет фона</label>
            <input type="color" value={layout.bgColor ?? '#ffffff'}
              onChange={e => onChange({ layout: { ...layout, bgColor: e.target.value } })}
              className="w-full h-8 rounded border border-gray-200 cursor-pointer" />
          </div>
        )}
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input type="checkbox" checked={layout.hideOnMobile ?? false}
              onChange={e => onChange({ layout: { ...layout, hideOnMobile: e.target.checked } })} />
            Скрыть на мобильной
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input type="checkbox" checked={layout.hideOnDesktop ?? false}
              onChange={e => onChange({ layout: { ...layout, hideOnDesktop: e.target.checked } })} />
            Скрыть на десктопе
          </label>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Размер шрифта блока ({isMobile ? 'моб.' : 'десктоп'})
        </label>
        <input type="text" placeholder="например, 18px"
          value={(isMobile ? block.mobile_styles?.['&']?.['font-size'] : block.desktop_styles?.['&']?.['font-size']) ?? ''}
          onChange={e => patchSelfStyle('font-size', e.target.value)}
          className="w-full px-2.5 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:border-[#6A55F8]" />
        <p className="text-[10px] text-gray-400 mt-1">
          {isMobile ? 'Применится только на мобильных экранах (max-width: 640px)' : 'Применится на десктопе'}
        </p>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

function AddBlockMenu({ onClose, onPick }: { onClose: () => void; onPick: (t: BlockType) => void }) {
  const types: BlockType[] = ['hero', 'text', 'image', 'video', 'cta', 'custom_html', 'zero']
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Добавить блок</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="p-3 grid grid-cols-2 gap-2">
          {types.map(t => {
            const meta = BLOCK_TYPE_META[t]
            return (
              <button key={t} onClick={() => onPick(t)}
                className="p-3 rounded-lg border border-gray-200 hover:border-[#6A55F8] hover:bg-[#F8F7FF] text-left transition-colors">
                <div className="text-2xl mb-1">{meta.icon}</div>
                <p className="text-sm font-semibold text-gray-900">{meta.label}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{meta.description}</p>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
