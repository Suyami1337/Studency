'use client'

/**
 * BlockEditor — простой блочный редактор лендинга.
 *
 * Устройство: один большой iframe-превью всего лендинга (как раньше).
 * Лендинг = несколько HTML-блоков, идут друг под другом как один длинный
 * сайт. У каждого блока СВОЙ HTML, но визуально всё склеено в одну страницу.
 *
 * Что видит пользователь:
 *  - Сверху тулбар: viewport + inline-форматирование + Сохранить
 *  - Полноценный превью сайта в iframe (блоки стакаются друг под другом)
 *  - На hover по блоку появляется маленькая панель с кнопками:
 *    ✏ HTML | ⬆ | ⬇ | 🗑
 *  - В самом низу — кнопка «+ Добавить блок»
 *  - Клик по тексту — редактируется inline (contenteditable + inline toolbar)
 *  - Клик по «✏ HTML» — модалка с textarea для прямого редактирования HTML
 *
 * AI-помощник остаётся снаружи (в sites/page.tsx через AiAssistantOverlay) —
 * он умеет работать по блокам, правки одного блока не трогают соседние.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { assembleLandingHtml, type LandingBlock } from '@/lib/landing-blocks'

type Viewport = 'desktop' | 'mobile'

type Props = {
  landingId: string
  landingName: string
  onSave: () => void
}

export function BlockEditor({ landingId, landingName, onSave }: Props) {
  const [blocks, setBlocks] = useState<LandingBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [editingHtmlBlockId, setEditingHtmlBlockId] = useState<string | null>(null)
  const [hasSelection, setHasSelection] = useState(false)
  const [iframeHeight, setIframeHeight] = useState(600)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  // Живой HTML каждого блока из iframe (обновляется постоянно по мере печати).
  // НЕ state — чтобы не триггерить ре-рендер iframe. Снимаем отсюда при save.
  const liveHtmlRef = useRef<Record<string, string>>({})

  // ─── Загрузка блоков + lazy-миграция ──────────────────────────────────
  const loadBlocks = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/landings/${landingId}/blocks`)
      const json = await res.json()
      if (!json.ok) {
        setLoadError(String(json.error || 'Не удалось загрузить блоки'))
        setLoading(false)
        return
      }
      // Legacy lending с html_content — миграция в один блок
      if (!json.isBlocksBased && json.hasLegacyHtml) {
        await fetch(`/api/landings/${landingId}/blocks?migrate=1`, { method: 'POST' })
        const res2 = await fetch(`/api/landings/${landingId}/blocks`)
        const json2 = await res2.json()
        setBlocks(json2.blocks ?? [])
      } else {
        setBlocks(json.blocks ?? [])
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Ошибка сети')
    }
    setLoading(false)
  }, [landingId])

  useEffect(() => { void loadBlocks() }, [loadBlocks])

  function markDirty(id: string) {
    setDirty(prev => { const n = new Set(prev); n.add(id); return n })
  }

  function updateBlockLocal(id: string, patch: Partial<LandingBlock>) {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b))
    markDirty(id)
  }

  async function handleSaveAll() {
    // Сначала собираем живой DOM из iframe в ref (без setState — чтобы iframe не ремонтился)
    collectLiveHtml()
    if (dirty.size === 0) return
    setSaving(true)
    const updatedBlocks: LandingBlock[] = []
    for (const id of dirty) {
      const b = blocks.find(x => x.id === id)
      if (!b) continue
      // Берём живой HTML из ref если есть — это последняя версия после всех inline-правок
      const liveHtml = liveHtmlRef.current[id]
      const htmlToSave = liveHtml !== undefined ? liveHtml : b.html_content
      const next = { ...b, html_content: htmlToSave }
      updatedBlocks.push(next)
      await fetch(`/api/landings/${landingId}/blocks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html_content: next.html_content,
          content: next.content,
          desktop_styles: next.desktop_styles,
          mobile_styles: next.mobile_styles,
          layout: next.layout,
          is_hidden: next.is_hidden,
        }),
      })
    }
    // После успешного сохранения подтягиваем обновлённые html в state (iframe перерендерится,
    // но это ок — юзер увидит «Сохранено»)
    setBlocks(prev => prev.map(b => {
      const updated = updatedBlocks.find(u => u.id === b.id)
      return updated ? { ...b, html_content: updated.html_content } : b
    }))
    setDirty(new Set())
    liveHtmlRef.current = {}
    setSaving(false)
    onSave()
  }

  /** Применить live HTML из iframe ко всем blocks (вызывать перед операциями, которые вызовут setBlocks → пересборку iframe) */
  function applyLiveToBlocks(arr: LandingBlock[]): LandingBlock[] {
    return arr.map(b => {
      const live = liveHtmlRef.current[b.id]
      return live !== undefined ? { ...b, html_content: live } : b
    })
  }

  async function handleAddBlock() {
    // Сначала собираем живой DOM чтобы не потерять несохранённые правки
    collectLiveHtml()
    const res = await fetch(`/api/landings/${landingId}/blocks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        block_type: 'custom_html',
        name: `Блок ${blocks.length + 1}`,
        html_content: '<div style="padding:40px 20px;text-align:center;font-family:system-ui,sans-serif"><p style="color:#888;font-size:14px">Новый блок. Кликни на текст чтобы редактировать, или нажми ✏ HTML справа сверху.</p></div>',
      }),
    })
    const json = await res.json()
    if (json.ok) {
      // Применяем live к текущим + добавляем новый в конец (без loadBlocks, чтобы не терять live правки)
      setBlocks(prev => [...applyLiveToBlocks(prev), json.block])
      liveHtmlRef.current = {}
      markDirty(json.block.id)
      setEditingHtmlBlockId(json.block.id)
    }
  }

  async function handleDeleteBlock(id: string) {
    if (!confirm('Удалить этот блок?')) return
    collectLiveHtml()
    await fetch(`/api/landings/${landingId}/blocks/${id}`, { method: 'DELETE' })
    setBlocks(prev => applyLiveToBlocks(prev.filter(b => b.id !== id)))
    liveHtmlRef.current = {}
    setDirty(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  async function handleMove(id: string, direction: -1 | 1) {
    const idx = blocks.findIndex(b => b.id === id)
    if (idx < 0) return
    const newIdx = idx + direction
    if (newIdx < 0 || newIdx >= blocks.length) return
    collectLiveHtml()
    const withLive = applyLiveToBlocks(blocks)
    const next = [...withLive]
    const [moved] = next.splice(idx, 1)
    next.splice(newIdx, 0, moved)
    const reordered = next.map((b, i) => ({ ...b, order_position: i }))
    setBlocks(reordered)
    liveHtmlRef.current = {}
    await fetch(`/api/landings/${landingId}/blocks?reorder=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: reordered.map(b => b.id) }),
    })
  }

  // ─── Inline-форматирование в iframe ────────────────────────────────────
  // ВАЖНО: НЕ вызываем setBlocks после execCommand — иначе React перемонтирует
  // iframe и слетит выделение. Изменения остаются в живом DOM iframe, мы только
  // отмечаем блок как dirty. Реальная синхронизация — при save или open HTML-модалки.
  function applyFormat(command: string, value?: string) {
    const doc = iframeRef.current?.contentDocument
    const win = iframeRef.current?.contentWindow
    if (!doc || !win) return
    win.focus()
    try { doc.execCommand(command, false, value) } catch { /* ignore */ }
    markActiveBlockDirty()
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
      win.focus()
      range.surroundContents(span)
      markActiveBlockDirty()
    } catch { /* ignore */ }
  }

  /** Отмечает блок где сейчас каретка как dirty (без чтения DOM — чтоб не ремонтить iframe) */
  function markActiveBlockDirty() {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    const sel = doc.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const anchor = sel.anchorNode
    if (!anchor) return
    const parent = anchor.nodeType === 1 ? (anchor as Element) : anchor.parentElement
    const section = parent?.closest('[data-block-id]')
    const bId = section?.getAttribute('data-block-id')
    if (bId) markDirty(bId)
  }

  /** Читает живой DOM iframe в liveHtmlRef (без setState, не ремонтит iframe). */
  function collectLiveHtml() {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    doc.querySelectorAll('[data-block-id]').forEach(sectionEl => {
      const bId = sectionEl.getAttribute('data-block-id')
      if (!bId) return
      const inner = sectionEl.querySelector(':scope > .block-inner') as HTMLElement | null
      if (!inner) return
      const clone = inner.cloneNode(true) as HTMLElement
      clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'))
      clone.querySelectorAll('[data-stud-editor-inject]').forEach(el => el.remove())
      liveHtmlRef.current[bId] = clone.innerHTML
    })
  }

  // ─── postMessage listeners ────────────────────────────────────────────
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const src = iframeRef.current?.contentWindow
      if (!src || e.source !== src) return
      const data = e.data
      if (!data || typeof data !== 'object') return
      if (data.type === 'stud-selection') {
        setHasSelection(Boolean(data.has))
      } else if (data.type === 'stud-input' && typeof data.blockId === 'string') {
        // Пометить блок как dirty без чтения DOM (иначе ремонт iframe → теряется выделение)
        markDirty(data.blockId)
      } else if (data.type === 'stud-edit-html' && typeof data.blockId === 'string') {
        // Перед открытием модалки собираем живой HTML, чтобы textarea показала актуальное
        collectLiveHtml()
        // Подмешаем live html в blocks чтобы HtmlBlockModal получил свежее содержимое
        const live = liveHtmlRef.current[data.blockId]
        if (live !== undefined) {
          setBlocks(prev => prev.map(b => b.id === data.blockId ? { ...b, html_content: live } : b))
        }
        setEditingHtmlBlockId(data.blockId)
      } else if (data.type === 'stud-move-block' && typeof data.blockId === 'string') {
        collectLiveHtml()  // сохранить живые правки перед перестановкой
        void handleMove(data.blockId, data.direction)
      } else if (data.type === 'stud-delete-block' && typeof data.blockId === 'string') {
        void handleDeleteBlock(data.blockId)
      } else if (data.type === 'stud-add-block') {
        collectLiveHtml()
        void handleAddBlock()
      } else if (data.type === 'stud-resize' && typeof data.height === 'number') {
        setIframeHeight(Math.max(400, data.height))
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks])

  // ─── Сборка preview HTML ──────────────────────────────────────────────
  const previewBody = assembleLandingHtml(blocks, { title: landingName })

  // Инжектируем: CSS для hover-рамок, скрипт для contenteditable + кнопок блока
  const editorInject = `
<style data-stud-editor-inject>
  [data-block-id] { position: relative; transition: outline 0.1s; }
  [data-block-id]:hover { outline: 2px dashed rgba(106,85,248,0.4); outline-offset: -2px; }
  [data-block-id] .stud-block-toolbar {
    position: absolute; top: 8px; right: 8px; z-index: 9999;
    display: flex; gap: 4px;
    background: rgba(17,24,39,0.92); padding: 4px; border-radius: 8px;
    opacity: 0; transition: opacity 0.15s; pointer-events: none;
    font-family: system-ui, sans-serif;
  }
  [data-block-id]:hover .stud-block-toolbar { opacity: 1; pointer-events: auto; }
  [data-block-id] .stud-block-toolbar button {
    background: transparent; color: #fff; border: none; padding: 4px 8px;
    border-radius: 4px; font-size: 12px; cursor: pointer; font-family: inherit;
  }
  [data-block-id] .stud-block-toolbar button:hover { background: rgba(106,85,248,0.6); }
  [contenteditable="true"]:focus { outline: 2px solid #F59E0B; outline-offset: 2px; }
  .stud-add-block-btn {
    display: block; margin: 32px auto; padding: 16px 40px;
    background: #F0EDFF; color: #6A55F8; border: 2px dashed #6A55F8;
    border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer;
    font-family: system-ui, sans-serif;
  }
  .stud-add-block-btn:hover { background: #6A55F8; color: #fff; border-style: solid; }
</style>
<script data-stud-editor-inject>
  (function() {
    // Добавляем toolbar над каждым блоком
    document.querySelectorAll('[data-block-id]').forEach(function(section) {
      var blockId = section.getAttribute('data-block-id');
      var toolbar = document.createElement('div');
      toolbar.className = 'stud-block-toolbar';
      toolbar.setAttribute('data-stud-editor-inject', 'true');
      toolbar.innerHTML = [
        '<button data-act="html" title="Редактировать HTML">✏ HTML</button>',
        '<button data-act="up" title="Поднять">⬆</button>',
        '<button data-act="down" title="Опустить">⬇</button>',
        '<button data-act="del" title="Удалить" style="color:#fca5a5">🗑</button>',
      ].join('');
      toolbar.addEventListener('click', function(e) {
        var btn = e.target.closest('button');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        var act = btn.getAttribute('data-act');
        if (act === 'html') parent.postMessage({ type: 'stud-edit-html', blockId: blockId }, '*');
        else if (act === 'up') parent.postMessage({ type: 'stud-move-block', blockId: blockId, direction: -1 }, '*');
        else if (act === 'down') parent.postMessage({ type: 'stud-move-block', blockId: blockId, direction: 1 }, '*');
        else if (act === 'del') parent.postMessage({ type: 'stud-delete-block', blockId: blockId }, '*');
      });
      section.appendChild(toolbar);
    });

    // Делаем текст контентом редактируемым (как раньше)
    document.querySelectorAll('[data-block-id] .block-inner').forEach(function(inner) {
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

    // Кнопка «+ Добавить блок» в конце body
    var addBtn = document.createElement('button');
    addBtn.className = 'stud-add-block-btn';
    addBtn.setAttribute('data-stud-editor-inject', 'true');
    addBtn.textContent = '+ Добавить блок';
    addBtn.addEventListener('click', function(e) {
      e.preventDefault();
      parent.postMessage({ type: 'stud-add-block' }, '*');
    });
    document.body.appendChild(addBtn);

    // Selection → parent
    document.addEventListener('selectionchange', function() {
      var sel = document.getSelection();
      var has = !!(sel && sel.rangeCount > 0 && !sel.isCollapsed);
      parent.postMessage({ type: 'stud-selection', has: has }, '*');
    });
    // Input → parent (с blockId — чтобы отметить именно его как dirty)
    document.addEventListener('input', function(e) {
      var target = e.target;
      var section = target && target.closest ? target.closest('[data-block-id]') : null;
      var blockId = section ? section.getAttribute('data-block-id') : null;
      parent.postMessage({ type: 'stud-input', blockId: blockId }, '*');
    });

    // Авто-высота iframe: отправляем scrollHeight родителю при загрузке и
    // каждом изменении размера контента. Родитель растягивает iframe под него —
    // не будет внутреннего скролла, страница листается целиком.
    function reportHeight() {
      var h = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      );
      parent.postMessage({ type: 'stud-resize', height: h }, '*');
    }
    reportHeight();
    window.addEventListener('load', reportHeight);
    if (typeof ResizeObserver !== 'undefined') {
      try {
        var ro = new ResizeObserver(reportHeight);
        ro.observe(document.body);
      } catch (e) { /* ignore */ }
    }
    // Периодически — на случай если ResizeObserver не ловит (например images.onload)
    setTimeout(reportHeight, 300);
    setTimeout(reportHeight, 1000);
    setTimeout(reportHeight, 3000);
  })();
</script>`

  const previewDoc = previewBody.replace('</body>', editorInject + '</body>')

  const activeHtmlBlock = blocks.find(b => b.id === editingHtmlBlockId) ?? null

  // ─── Render ───────────────────────────────────────────────────────────
  if (loading) {
    return <div className="bg-white rounded-xl border border-gray-100 p-20 text-center text-sm text-gray-400">Загрузка блоков...</div>
  }
  if (loadError) {
    return (
      <div className="bg-amber-50 rounded-xl border border-amber-200 p-8 text-center">
        <div className="text-3xl mb-2">⚠️</div>
        <p className="text-sm text-amber-800 font-medium mb-1">Не удалось загрузить блоки</p>
        <p className="text-xs text-amber-700 whitespace-pre-wrap">{loadError}</p>
        <button onClick={() => void loadBlocks()}
          className="mt-4 px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700">
          Попробовать снова
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* ── Toolbar ── */}
      <div className="bg-white rounded-xl border border-gray-100 px-3 py-2 flex items-center gap-3 flex-wrap">
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
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {blocks.length} {blocks.length === 1 ? 'блок' : blocks.length < 5 ? 'блока' : 'блоков'}
          </span>
          <button onClick={() => void handleSaveAll()} disabled={saving || dirty.size === 0}
            className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 ${
              dirty.size > 0
                ? 'bg-[#6A55F8] text-white hover:bg-[#5845e0]'
                : 'bg-gray-100 text-gray-500'
            }`}>
            {saving ? 'Сохранение...' : dirty.size > 0 ? `● Сохранить (${dirty.size})` : '✓ Сохранено'}
          </button>
        </div>
      </div>

      {/* ── Превью ── */}
      {viewport === 'mobile' ? (
        /* В mobile-режиме эмулируем телефон — рамка + фиксированная ширина */
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 flex justify-center">
          <div className="bg-white rounded-[2rem] border-[8px] border-gray-800 overflow-hidden">
            <iframe
              ref={iframeRef}
              srcDoc={previewDoc}
              className="border-0 w-[390px]"
              style={{ height: Math.min(iframeHeight, 720) }}
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </div>
      ) : (
        /* Desktop — iframe растягивается под высоту контента, скроллится сама страница */
        <iframe
          ref={iframeRef}
          srcDoc={previewDoc}
          className="w-full border-0 rounded-lg bg-white shadow-sm"
          style={{ height: iframeHeight }}
          sandbox="allow-scripts allow-same-origin"
        />
      )}

      {/* ── HTML-редактор блока (modal) ── */}
      {activeHtmlBlock && (
        <HtmlBlockModal
          key={activeHtmlBlock.id}
          block={activeHtmlBlock}
          onClose={() => setEditingHtmlBlockId(null)}
          onSave={(newHtml) => {
            updateBlockLocal(activeHtmlBlock.id, { html_content: newHtml })
            setEditingHtmlBlockId(null)
          }}
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

function HtmlBlockModal({
  block, onClose, onSave,
}: {
  block: LandingBlock
  onClose: () => void
  onSave: (html: string) => void
}) {
  // Ключ компонента на block.id → при смене блока компонент пересоздаётся с новым initial state,
  // не нужен useEffect с setState (который ESLint считает антипаттерном).
  const [html, setHtml] = useState(block.html_content ?? '')

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">HTML-код блока</h3>
            <p className="text-xs text-gray-400 mt-0.5">Можно вставить любой HTML. Для видео используй шорткод <code className="bg-gray-100 px-1 rounded">{'{{video:UUID}}'}</code></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="flex-1 overflow-hidden p-4">
          <textarea
            value={html}
            onChange={e => setHtml(e.target.value)}
            className="w-full h-full px-3 py-2 text-xs font-mono text-gray-800 border border-gray-200 rounded-lg focus:outline-none focus:border-[#6A55F8] resize-none"
            placeholder="<section>...</section>"
            spellCheck={false}
          />
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100">Отмена</button>
          <button onClick={() => onSave(html)} className="px-4 py-2 text-sm font-semibold bg-[#6A55F8] text-white rounded-lg hover:bg-[#5845e0]">
            Применить
          </button>
        </div>
      </div>
    </div>
  )
}
