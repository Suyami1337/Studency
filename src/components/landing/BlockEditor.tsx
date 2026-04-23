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
  const [iframeHeight, setIframeHeight] = useState(600)
  const [fullscreen, setFullscreen] = useState(false)
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
    collectLiveHtml()
    // Optimistic: сразу добавляем блок с temp-id, в фоне делаем POST
    const tempId = `temp-${Date.now()}`
    const tempBlock: LandingBlock = {
      id: tempId,
      landing_id: landingId,
      order_position: blocks.length,
      block_type: 'custom_html',
      name: `Блок ${blocks.length + 1}`,
      html_content: '<div style="padding:40px 20px;text-align:center;font-family:system-ui,sans-serif"><p style="color:#888;font-size:14px">Новый блок. Дважды кликни на текст чтобы редактировать, или нажми ✏ HTML в правом верхнем углу.</p></div>',
      content: {},
      desktop_styles: {},
      mobile_styles: {},
      layout: {},
      is_hidden: false,
    }
    setBlocks(prev => [...applyLiveToBlocks(prev), tempBlock])
    liveHtmlRef.current = {}
    markDirty(tempId)
    // Фоновый POST — заменяем temp-id на реальный после ответа
    fetch(`/api/landings/${landingId}/blocks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        block_type: tempBlock.block_type,
        name: tempBlock.name,
        html_content: tempBlock.html_content,
      }),
    }).then(r => r.json()).then(json => {
      if (json.ok) {
        setBlocks(prev => prev.map(b => b.id === tempId ? json.block : b))
        setDirty(prev => {
          const n = new Set(prev)
          n.delete(tempId)
          n.add(json.block.id)
          return n
        })
      }
    })
  }

  async function handleDeleteBlock(id: string) {
    if (!confirm('Удалить этот блок?')) return
    collectLiveHtml()
    // Optimistic: сразу убираем из UI, DELETE в фоне
    setBlocks(prev => applyLiveToBlocks(prev).filter(b => b.id !== id))
    liveHtmlRef.current = {}
    setDirty(prev => { const n = new Set(prev); n.delete(id); return n })
    // Если это temp-блок — нет смысла слать на сервер, там его и не было
    if (!id.startsWith('temp-')) {
      void fetch(`/api/landings/${landingId}/blocks/${id}`, { method: 'DELETE' })
    }
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
      if (data.type === 'stud-input' && typeof data.blockId === 'string') {
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
        // Cap защищает от патологических случаев когда шаблон растёт бесконечно
        const safeHeight = Math.min(Math.max(400, data.height), 30000)
        setIframeHeight(safeHeight)
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
  /* ВАЖНО: гасим min-height:100vh внутри iframe — иначе бесконечный самоусиливающийся рост
     (iframe растёт → body vh увеличивается → scrollHeight растёт → iframe растёт...) */
  html, body { min-height: 0 !important; height: auto !important; overflow: visible !important; }
  [data-block-id] { min-height: 0 !important; }
  .vsl-root, .hero { min-height: auto !important; }

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

  /* Overlay с ручками вокруг выделенного элемента — drag/resize */
  .stud-overlay {
    position: absolute; pointer-events: none; z-index: 10000;
    border: 2px solid #6A55F8; box-sizing: border-box;
  }
  .stud-overlay .stud-drag-zone {
    position: absolute; inset: 0; pointer-events: auto; cursor: move;
    background: rgba(106,85,248,0.03);
  }
  .stud-overlay .stud-handle {
    position: absolute; pointer-events: auto;
    width: 12px; height: 12px; background: #6A55F8;
    border: 2px solid #fff; border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  }
  .stud-overlay .stud-h-nw { top: -7px; left: -7px; cursor: nw-resize; }
  .stud-overlay .stud-h-n  { top: -7px; left: 50%; transform: translateX(-50%); cursor: n-resize; }
  .stud-overlay .stud-h-ne { top: -7px; right: -7px; cursor: ne-resize; }
  .stud-overlay .stud-h-e  { top: 50%; right: -7px; transform: translateY(-50%); cursor: e-resize; }
  .stud-overlay .stud-h-se { bottom: -7px; right: -7px; cursor: se-resize; }
  .stud-overlay .stud-h-s  { bottom: -7px; left: 50%; transform: translateX(-50%); cursor: s-resize; }
  .stud-overlay .stud-h-sw { bottom: -7px; left: -7px; cursor: sw-resize; }
  .stud-overlay .stud-h-w  { top: 50%; left: -7px; transform: translateY(-50%); cursor: w-resize; }
  body.stud-dragging { user-select: none !important; }
  body.stud-dragging * { cursor: inherit !important; }

  /* Floating toolbar форматирования — появляется рядом с выделенным текстом */
  .stud-float-toolbar {
    position: absolute; z-index: 10001;
    display: none; align-items: center; gap: 2px;
    background: rgba(17,24,39,0.96); color: #fff;
    padding: 4px; border-radius: 8px; font-family: system-ui, sans-serif;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    white-space: nowrap;
  }
  .stud-float-toolbar.stud-visible { display: inline-flex; }
  .stud-float-toolbar button {
    background: transparent; color: #fff; border: none;
    width: 28px; height: 28px; border-radius: 4px; cursor: pointer;
    font-size: 13px; font-family: inherit; padding: 0;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .stud-float-toolbar button:hover { background: rgba(255,255,255,0.15); }
  .stud-float-toolbar select {
    background: rgba(255,255,255,0.1); color: #fff; border: none;
    padding: 4px 6px; border-radius: 4px; font-size: 11px; font-family: inherit;
    height: 28px;
  }
  .stud-float-toolbar input[type="color"] {
    width: 24px; height: 24px; border: none; border-radius: 4px;
    padding: 0; cursor: pointer; background: transparent;
  }
  .stud-float-toolbar .stud-divider {
    width: 1px; height: 18px; background: rgba(255,255,255,0.2); margin: 0 2px;
  }
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

    // Авто-contenteditable на все текстовые элементы: клик → сразу редактируется,
    // выделение мышью работает нативно, floating toolbar всплывает при selection.
    // Drag/resize — на уровне ВСЕГО блока (не отдельного элемента), через overlay
    // который появляется при клике на блок в зоне вне текста (фон, padding).
    document.querySelectorAll('[data-block-id] .block-inner').forEach(function(inner) {
      var BLOCK_SEL = 'h1, h2, h3, h4, h5, h6, p, li, td, th, label, blockquote, figcaption';
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

    // Input → parent (с blockId — чтобы отметить именно его как dirty)
    document.addEventListener('input', function(e) {
      var target = e.target;
      var section = target && target.closest ? target.closest('[data-block-id]') : null;
      var blockId = section ? section.getAttribute('data-block-id') : null;
      parent.postMessage({ type: 'stud-input', blockId: blockId }, '*');
    });

    // Авто-высота iframe: отправляем scrollHeight родителю.
    // Защита от цикла: если новая высота почти совпадает с прошлой (±20px) — игнор.
    // Плюс жёсткий cap 50k px — если вёрстка шаблона всё равно растягивается, не утянем браузер.
    var lastReported = 0;
    function reportHeight() {
      var h = Math.min(
        Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
        50000
      );
      if (Math.abs(h - lastReported) < 20) return;
      lastReported = h;
      parent.postMessage({ type: 'stud-resize', height: h }, '*');
    }
    reportHeight();
    window.addEventListener('load', reportHeight);
    if (typeof ResizeObserver !== 'undefined') {
      try {
        var ro = new ResizeObserver(function() {
          // debounce через rAF — чтобы не репортить в каждой фазе layout
          if (window.__studRafId) cancelAnimationFrame(window.__studRafId);
          window.__studRafId = requestAnimationFrame(reportHeight);
        });
        ro.observe(document.body);
      } catch (e) { /* ignore */ }
    }
    setTimeout(reportHeight, 300);
    setTimeout(reportHeight, 1000);
    setTimeout(reportHeight, 3000);

    // ───────────────────────────────────────────────────────────────
    // Tilda-like selection БЛОКА (не отдельного элемента):
    //  - Клик на текст → редактируется напрямую (contenteditable)
    //  - Клик на блок в зоне вне текста (фон/padding) → overlay вокруг секции
    //  - Drag по центру overlay → перемещает весь блок (translate)
    //  - Drag за ручки → меняет padding блока (визуальные отступы)
    //  - Esc / клик вне → снять выделение
    // ───────────────────────────────────────────────────────────────
    var overlay = null;
    var selectedBlock = null;  // section[data-block-id]
    var editingEl = null;      // для совместимости с floating toolbar — элемент с текущим выделением

    // ─── Undo stack: хранит innerHTML блоков перед каждым значимым действием ───
    var undoStack = [];  // {blockId, html}
    var lastPushTime = 0, lastPushBlockId = null;
    function pushUndo(blockId, force) {
      if (!blockId) return;
      var now = Date.now();
      // Дебаунс для печати: если подряд пишем в одном блоке — не засоряем стек
      if (!force && lastPushBlockId === blockId && now - lastPushTime < 500) return;
      var section = document.querySelector('[data-block-id="' + blockId + '"]');
      if (!section) return;
      var inner = section.querySelector(':scope > .block-inner');
      if (!inner) return;
      undoStack.push({ blockId: blockId, html: inner.innerHTML });
      if (undoStack.length > 80) undoStack.shift();
      lastPushTime = now;
      lastPushBlockId = blockId;
    }
    function doUndo() {
      var item = undoStack.pop();
      if (!item) return;
      var section = document.querySelector('[data-block-id="' + item.blockId + '"]');
      if (!section) return;
      var inner = section.querySelector(':scope > .block-inner');
      if (!inner) return;
      inner.innerHTML = item.html;
      // Сбрасываем выделение/editing
      exitEditMode();
      removeOverlay();
      parent.postMessage({ type: 'stud-input', blockId: item.blockId }, '*');
      hideFloatToolbar();
    }

    function removeOverlay() {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
      selectedBlock = null;
    }

    function exitEditMode() {
      // Мы больше не оставляем отдельный edit-mode через двойной клик —
      // все текстовые элементы auto-contenteditable. Функция оставлена для совместимости
      // (используется в undo-stack / обработке Esc).
      editingEl = null;
    }

    function buildBlockOverlay(section) {
      removeOverlay();
      selectedBlock = section;

      overlay = document.createElement('div');
      overlay.className = 'stud-overlay';
      overlay.setAttribute('data-stud-editor-inject', 'true');
      overlay.innerHTML = [
        '<div class="stud-drag-zone" data-handle="move"></div>',
        '<div class="stud-handle stud-h-nw" data-handle="nw"></div>',
        '<div class="stud-handle stud-h-n"  data-handle="n"></div>',
        '<div class="stud-handle stud-h-ne" data-handle="ne"></div>',
        '<div class="stud-handle stud-h-e"  data-handle="e"></div>',
        '<div class="stud-handle stud-h-se" data-handle="se"></div>',
        '<div class="stud-handle stud-h-s"  data-handle="s"></div>',
        '<div class="stud-handle stud-h-sw" data-handle="sw"></div>',
        '<div class="stud-handle stud-h-w"  data-handle="w"></div>',
      ].join('');
      document.body.appendChild(overlay);
      positionOverlay();
      attachDragHandlers();
    }

    function positionOverlay() {
      if (!overlay || !selectedBlock) return;
      var r = selectedBlock.getBoundingClientRect();
      overlay.style.left = (window.scrollX + r.left) + 'px';
      overlay.style.top = (window.scrollY + r.top) + 'px';
      overlay.style.width = r.width + 'px';
      overlay.style.height = r.height + 'px';
    }

    function attachDragHandlers() {
      overlay.querySelectorAll('[data-handle]').forEach(function(h) {
        h.addEventListener('mousedown', function(e) {
          var mode = h.getAttribute('data-handle');
          startDrag(mode, e);
        });
      });
    }

    function startDrag(mode, e) {
      e.preventDefault();
      e.stopPropagation();
      if (!selectedBlock) return;
      var blockId = selectedBlock.getAttribute('data-block-id');
      pushUndo(blockId, true);

      var startX = e.clientX, startY = e.clientY;
      // Текущий translate блока (если был)
      var curTx = 0, curTy = 0;
      var m = /translate\\((-?\\d+(?:\\.\\d+)?)px,\\s*(-?\\d+(?:\\.\\d+)?)px\\)/.exec(selectedBlock.style.transform || '');
      if (m) { curTx = parseFloat(m[1]); curTy = parseFloat(m[2]); }
      // Текущие padding блока (парсим из inline или computed)
      var cs = window.getComputedStyle(selectedBlock);
      var origPt = parseFloat(selectedBlock.style.paddingTop) || parseFloat(cs.paddingTop) || 0;
      var origPb = parseFloat(selectedBlock.style.paddingBottom) || parseFloat(cs.paddingBottom) || 0;
      var origPl = parseFloat(selectedBlock.style.paddingLeft) || parseFloat(cs.paddingLeft) || 0;
      var origPr = parseFloat(selectedBlock.style.paddingRight) || parseFloat(cs.paddingRight) || 0;

      document.body.classList.add('stud-dragging');

      function onMove(ev) {
        var dx = ev.clientX - startX;
        var dy = ev.clientY - startY;
        if (mode === 'move') {
          // Сдвиг всей секции через transform — не ломает flow соседей
          selectedBlock.style.transform = 'translate(' + (curTx + dx) + 'px, ' + (curTy + dy) + 'px)';
        } else {
          // Resize = меняем padding блока. Это удобно для лендингов: добавляешь
          // вертикальное пространство (padding-top/bottom) или горизонтальные поля.
          var pt = origPt, pb = origPb, pl = origPl, pr = origPr;
          if (mode.indexOf('n') !== -1) pt = Math.max(0, origPt - dy);
          if (mode.indexOf('s') !== -1) pb = Math.max(0, origPb + dy);
          if (mode.indexOf('w') !== -1) pl = Math.max(0, origPl - dx);
          if (mode.indexOf('e') !== -1) pr = Math.max(0, origPr + dx);
          selectedBlock.style.paddingTop = pt + 'px';
          selectedBlock.style.paddingBottom = pb + 'px';
          selectedBlock.style.paddingLeft = pl + 'px';
          selectedBlock.style.paddingRight = pr + 'px';
        }
        positionOverlay();
      }
      function onUp() {
        document.body.classList.remove('stud-dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        parent.postMessage({ type: 'stud-input', blockId: blockId }, '*');
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    // Клик → выделить блок (если клик не по тексту)
    document.addEventListener('click', function(e) {
      // Клик на служебное UI — игнорируем
      if (e.target.closest && (e.target.closest('.stud-overlay') || e.target.closest('.stud-block-toolbar') || e.target.closest('.stud-add-block-btn') || e.target.closest('.stud-float-toolbar'))) return;
      // Клик на текст (любой contenteditable) — НЕ перехватываем. Пусть работает нативное редактирование.
      // При этом снимаем overlay блока если он висел.
      if (e.target.closest('[contenteditable="true"]')) {
        removeOverlay();
        return;
      }
      // Клик в блок, но вне текста (фон, padding, img) — выделяем сам блок
      var section = e.target.closest('[data-block-id]');
      if (section) {
        buildBlockOverlay(section);
      } else {
        removeOverlay();
      }
    });

    // Esc → выйти из edit / снять выделение. Ctrl-Z / Cmd-Z → undo
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        exitEditMode();
        removeOverlay();
        hideFloatToolbar();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        // Если сейчас в edit-mode и есть нативный undo для текста — пусть сработает.
        // Наш undo работает на уровне блока как fallback если нативный стек пуст.
        if (editingEl) {
          // Пробуем нативный
          try {
            if (document.queryCommandSupported && document.queryCommandSupported('undo')) {
              var hadEffect = document.execCommand('undo');
              if (hadEffect) return;
            }
          } catch (_) {}
        }
        e.preventDefault();
        doUndo();
      }
    });

    // При печати текста — фиксируем состояние блока (с дебаунсом)
    document.addEventListener('beforeinput', function(e) {
      var section = e.target && e.target.closest ? e.target.closest('[data-block-id]') : null;
      if (section) pushUndo(section.getAttribute('data-block-id'));
    });

    // При скролле / ресайзе окна — обновляем позицию overlay + toolbar
    window.addEventListener('scroll', function() {
      positionOverlay();
      positionFloatToolbar();
    }, true);
    window.addEventListener('resize', function() {
      positionOverlay();
      positionFloatToolbar();
    });

    // ───────────────────────────────────────────────────────────────
    // Floating toolbar форматирования — при выделении текста в edit-mode
    // ───────────────────────────────────────────────────────────────
    var floatToolbar = null;
    var lastSelRect = null;

    function buildFloatToolbar() {
      if (floatToolbar) return floatToolbar;
      floatToolbar = document.createElement('div');
      floatToolbar.className = 'stud-float-toolbar';
      floatToolbar.setAttribute('data-stud-editor-inject', 'true');
      floatToolbar.setAttribute('contenteditable', 'false');
      var sizes = [12,14,16,18,20,24,28,32,36,40,48,56,64,72,84,96];
      var sizeOpts = '<option value="">Размер</option>' + sizes.map(function(s){ return '<option value="'+s+'">'+s+'px</option>'; }).join('');
      floatToolbar.innerHTML = [
        '<button data-cmd="bold" title="Жирный"><b>B</b></button>',
        '<button data-cmd="italic" title="Курсив"><i>I</i></button>',
        '<button data-cmd="underline" title="Подчёркнутый"><u>U</u></button>',
        '<div class="stud-divider"></div>',
        '<select data-cmd="fontSize">' + sizeOpts + '</select>',
        '<input type="color" data-cmd="foreColor" value="#ffffff" title="Цвет текста">',
        '<div class="stud-divider"></div>',
        '<button data-cmd="justifyLeft" title="По левому">⬅</button>',
        '<button data-cmd="justifyCenter" title="По центру">↔</button>',
        '<button data-cmd="justifyRight" title="По правому">➡</button>',
      ].join('');
      document.body.appendChild(floatToolbar);

      // mousedown preventDefault — не теряем selection при клике по тулбару
      floatToolbar.addEventListener('mousedown', function(e) {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') e.preventDefault();
      });
      floatToolbar.addEventListener('click', function(e) {
        var btn = e.target.closest('button');
        if (!btn) return;
        var cmd = btn.getAttribute('data-cmd');
        if (!cmd) return;
        // Снимок до форматирования
        var section = editingEl ? editingEl.closest('[data-block-id]') : null;
        if (section) pushUndo(section.getAttribute('data-block-id'), true);
        document.execCommand(cmd, false, undefined);
        notifyBlockDirty(section);
      });
      // Font-size select
      floatToolbar.querySelector('select[data-cmd="fontSize"]').addEventListener('change', function(e) {
        if (!e.target.value) return;
        var section = editingEl ? editingEl.closest('[data-block-id]') : null;
        if (section) pushUndo(section.getAttribute('data-block-id'), true);
        // execCommand('fontSize') принимает 1..7, поэтому обёртка через span
        applyFontSizeToSelection(parseInt(e.target.value, 10));
        e.target.value = '';
        notifyBlockDirty(section);
      });
      // Color picker
      floatToolbar.querySelector('input[data-cmd="foreColor"]').addEventListener('input', function(e) {
        var section = editingEl ? editingEl.closest('[data-block-id]') : null;
        if (section) pushUndo(section.getAttribute('data-block-id'), true);
        document.execCommand('foreColor', false, e.target.value);
        notifyBlockDirty(section);
      });
      return floatToolbar;
    }

    function applyFontSizeToSelection(px) {
      var sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      var range = sel.getRangeAt(0);
      var span = document.createElement('span');
      span.style.fontSize = px + 'px';
      try { range.surroundContents(span); }
      catch (_) {
        document.execCommand('fontSize', false, '7');
        document.querySelectorAll('font[size="7"]').forEach(function(f) {
          var s = document.createElement('span');
          s.style.fontSize = px + 'px';
          while (f.firstChild) s.appendChild(f.firstChild);
          f.parentNode.replaceChild(s, f);
        });
      }
    }

    function notifyBlockDirty(section) {
      if (!section) return;
      parent.postMessage({ type: 'stud-input', blockId: section.getAttribute('data-block-id') }, '*');
    }

    function showFloatToolbar() {
      buildFloatToolbar();
      floatToolbar.classList.add('stud-visible');
      positionFloatToolbar();
    }
    function hideFloatToolbar() {
      if (floatToolbar) floatToolbar.classList.remove('stud-visible');
      lastSelRect = null;
    }
    function positionFloatToolbar() {
      if (!floatToolbar || !lastSelRect) return;
      var tbRect = floatToolbar.getBoundingClientRect();
      var top = window.scrollY + lastSelRect.top - tbRect.height - 8;
      if (top < window.scrollY + 4) {
        top = window.scrollY + lastSelRect.bottom + 8;  // если сверху нет места — снизу
      }
      var left = window.scrollX + lastSelRect.left;
      // Ограничим справа чтобы не вылезло за окно
      var maxLeft = window.innerWidth + window.scrollX - tbRect.width - 8;
      if (left > maxLeft) left = maxLeft;
      if (left < window.scrollX + 4) left = window.scrollX + 4;
      floatToolbar.style.left = left + 'px';
      floatToolbar.style.top = top + 'px';
    }

    document.addEventListener('selectionchange', function() {
      var sel = window.getSelection();
      var has = !!(sel && sel.rangeCount > 0 && !sel.isCollapsed);
      parent.postMessage({ type: 'stud-selection', has: has }, '*');
      // Показываем floating toolbar если выделение внутри любого contenteditable внутри блока
      if (!has) { hideFloatToolbar(); return; }
      var anchor = sel.anchorNode;
      var parentEl = anchor && anchor.nodeType === 1 ? anchor : (anchor && anchor.parentElement);
      if (!parentEl) { hideFloatToolbar(); return; }
      var editable = parentEl.closest && parentEl.closest('[contenteditable="true"]');
      var inBlock = parentEl.closest && parentEl.closest('[data-block-id]');
      if (!editable || !inBlock) { hideFloatToolbar(); return; }
      // Запомним редактируемый элемент — undo и формат-кнопки им пользуются для вычисления blockId
      editingEl = editable;
      var range = sel.getRangeAt(0);
      var rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) { hideFloatToolbar(); return; }
      lastSelRect = rect;
      showFloatToolbar();
    });
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
    <div className={fullscreen ? 'fixed inset-0 z-40 bg-gray-50 overflow-auto p-3 space-y-3' : 'space-y-3'}>
      {/* ── Toolbar ── */}
      <div className={`bg-white rounded-xl border border-gray-100 px-3 py-2 flex items-center gap-3 flex-wrap ${fullscreen ? 'sticky top-0 z-10 shadow-sm' : ''}`}>
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
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {blocks.length} {blocks.length === 1 ? 'блок' : blocks.length < 5 ? 'блока' : 'блоков'}
          </span>
          <button onClick={() => setFullscreen(v => !v)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
            title={fullscreen ? 'Свернуть' : 'На весь экран'}>
            {fullscreen ? '✕ Свернуть' : '⛶ На весь экран'}
          </button>
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
