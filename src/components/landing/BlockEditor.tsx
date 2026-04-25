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

import { useState, useEffect, useRef, useCallback, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { assembleLandingHtml, type LandingBlock } from '@/lib/landing-blocks'

type Viewport = 'mobile' | 'phone-large' | 'tablet' | 'desktop'
const VIEWPORT_WIDTH: Record<Viewport, number | null> = {
  mobile: 375,
  'phone-large': 430,
  tablet: 768,
  desktop: null,  // full width
}

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
  const [fullscreen, setFullscreen] = useState(() => {
    if (typeof window === 'undefined') return true
    const v = window.localStorage.getItem('stud-editor-fullscreen')
    return v === null ? true : v === '1'
  })
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('stud-editor-fullscreen', fullscreen ? '1' : '0')
  }, [fullscreen])
  const [textEditActive, setTextEditActive] = useState(false)
  const [leftPanelOpen, setLeftPanelOpen] = useState(true)
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [selectedInfo, setSelectedInfo] = useState<SelectedInfo | null>(null)
  const [selectionCount, setSelectionCount] = useState(0)
  const [layers, setLayers] = useState<LayerNode[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [activeLayerBlock, setActiveLayerBlock] = useState<string | null>(null)
  const [leftTab, setLeftTab] = useState<'blocks' | 'layers'>('blocks')
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [scale, setScale] = useState(1)
  const canvasSpaceRef = useRef<HTMLDivElement>(null)
  // Состояние iframe-box-select (drag пришёл от iframe). Хранит стартовые
  // координаты в iframe-viewport (для финального box) и canvas-space (для рамки).
  const iframeBoxRef = useRef<{
    iframeStart: { x: number; y: number }
    canvasStart: { x: number; y: number }
  } | null>(null)
  // RAF-батчинг pan дельт от iframe (stud-pan-delta может прилетать чаще 60fps)
  const panAccumRef = useRef<{ dx: number; dy: number; raf: number }>({ dx: 0, dy: 0, raf: 0 })
  // Refs current state — нужны для zoom-к-курсору (внутри callback применяем
  // setPanX/setPanY с учётом старого scale/pan)
  const scaleRef = useRef(scale)
  const panXRef = useRef(panX)
  const panYRef = useRef(panY)
  useEffect(() => { scaleRef.current = scale }, [scale])
  useEffect(() => { panXRef.current = panX }, [panX])
  useEffect(() => { panYRef.current = panY }, [panY])
  const [boxRect, setBoxRect] = useState<null | { x: number; y: number; w: number; h: number }>(null)
  const [addMenu, setAddMenu] = useState<null | { blockId: string; x: number; y: number }>(null)
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

  function sendFormat(cmd: string, value?: string) {
    iframeRef.current?.contentWindow?.postMessage({ type: 'stud-format', cmd, value }, '*')
  }

  function sendElementUpdate(msg: Record<string, unknown>) {
    iframeRef.current?.contentWindow?.postMessage(msg, '*')
  }

  /** Начать box-select. clientX/Y — координаты в document coords (global). */
  function startBoxSelect(startClientX: number, startClientY: number) {
    const canvas = canvasSpaceRef.current
    if (!canvas) return
    const canvasRect = canvas.getBoundingClientRect()
    // Превращаем в координаты canvas-space (для отрисовки)
    const toCanvas = (cx: number, cy: number) => ({ x: cx - canvasRect.left, y: cy - canvasRect.top })
    const start = toCanvas(startClientX, startClientY)
    // stud-panning отключает pointer-events iframe → mousemove доходит до parent
    document.body.classList.add('stud-panning')
    let lastEnd = start
    let dragStarted = false
    function onMove(ev: MouseEvent) {
      const end = toCanvas(ev.clientX, ev.clientY)
      lastEnd = end
      // Рисуем рамку только после реального движения > 4px — простой клик не должен мигать рамкой
      if (!dragStarted) {
        if (Math.abs(end.x - start.x) < 4 && Math.abs(end.y - start.y) < 4) return
        dragStarted = true
      }
      setBoxRect({
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        w: Math.abs(end.x - start.x),
        h: Math.abs(end.y - start.y),
      })
    }
    function onUp() {
      document.body.classList.remove('stud-panning')
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('mouseup', onUp, true)
      setBoxRect(null)
      // Если не двигали — просто click в фон → снимаем выделение в iframe (симметрия с iframe-click)
      if (!dragStarted) {
        iframeRef.current?.contentWindow?.postMessage({ type: 'stud-clear-selection' }, '*')
        return
      }
      // Финальный box в client-coords (global)
      const boxGlobal = {
        left: Math.min(startClientX, startClientX + (lastEnd.x - start.x)),
        top: Math.min(startClientY, startClientY + (lastEnd.y - start.y)),
        right: Math.max(startClientX, startClientX + (lastEnd.x - start.x)),
        bottom: Math.max(startClientY, startClientY + (lastEnd.y - start.y)),
      }
      // Конвертируем в iframe viewport coords
      const iframeRect = iframeRef.current?.getBoundingClientRect()
      if (!iframeRect) return
      const boxInIframe = {
        left: boxGlobal.left - iframeRect.left,
        top: boxGlobal.top - iframeRect.top,
        right: boxGlobal.right - iframeRect.left,
        bottom: boxGlobal.bottom - iframeRect.top,
      }
      iframeRef.current?.contentWindow?.postMessage({ type: 'stud-box-complete', box: boxInIframe }, '*')
    }
    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('mouseup', onUp, true)
  }

  // Delete в parent — работает когда выделен элемент даже если фокус в нашей панели/списке слоёв
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (!selectedInfo) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      e.preventDefault()
      sendElementUpdate({ type: 'stud-element-delete' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedInfo])

  // Применить wheel из любого источника (canvas-space или iframe-postMessage)
  // zoomKey = Cmd (Mac) / Ctrl (Win/Linux) / pinch-zoom трекпада на Mac
  // (последний эмулируется браузером как wheel + ctrlKey=true)
  // mouseCanvasX/Y — точка под курсором в canvas-space coords (для zoom-к-курсору)
  const applyWheel = useCallback((
    deltaX: number, deltaY: number, zoomKey: boolean, shiftKey: boolean,
    mouseCanvasX?: number, mouseCanvasY?: number,
  ) => {
    if (zoomKey) {
      const oldScale = scaleRef.current
      const newScale = Math.max(0.25, Math.min(2, oldScale * (deltaY > 0 ? 0.9 : 1.1)))
      if (newScale === oldScale) return
      // Zoom-к-курсору: подгоняем pan чтобы точка под курсором осталась на месте.
      // Формула: newPan = mouse - (mouse - oldPan) * (newScale / oldScale)
      if (mouseCanvasX !== undefined && mouseCanvasY !== undefined) {
        const ratio = newScale / oldScale
        const oldPanX = panXRef.current
        const oldPanY = panYRef.current
        setPanX(mouseCanvasX - (mouseCanvasX - oldPanX) * ratio)
        setPanY(mouseCanvasY - (mouseCanvasY - oldPanY) * ratio)
      }
      setScale(newScale)
    } else if (shiftKey) {
      setPanX(x => x - (deltaY + deltaX) * 1.6)
    } else {
      setPanY(y => y - deltaY * 1.6)
      setPanX(x => x - deltaX * 1.6)
    }
  }, [])

  // Единый фильтр «событие должно обработаться parent'ом» для ВСЕХ parent
  // window-listeners (wheel, mousedown). Симметрия: одинаковый набор
  // исключений и для wheel, и для mousedown.
  //
  // Архитектура: wheel/mousedown над iframe → parent видит target=iframe,
  // НО iframe-документ имеет свои handlers и сам шлёт postMessage parent'у.
  // Если parent тоже обработает → ДВОЙНАЯ обработка (отсюда тряска wheel
  // и двойной box/pan-старт). Поэтому target=iframe — пропускаем.
  function isParentArea(target: HTMLElement | null): boolean {
    if (!target) return false
    if (!target.closest('[data-stud-fullscreen-root]')) return false  // не наш редактор
    if (target.closest('[data-stud-panel]')) return false              // панели — свой scroll
    if (target.closest('[data-stud-site-wrap]')) return false          // сайт — iframe сам обрабатывает
    return true
  }

  // Wheel-listener на window с capture-phase + passive: false + preventDefault.
  useEffect(() => {
    if (!fullscreen) return
    function onWheel(e: WheelEvent) {
      if (!isParentArea(e.target as HTMLElement | null)) return
      e.preventDefault()
      const canvasRect = canvasSpaceRef.current?.getBoundingClientRect()
      const mx = canvasRect ? e.clientX - canvasRect.left : undefined
      const my = canvasRect ? e.clientY - canvasRect.top : undefined
      applyWheel(e.deltaX, e.deltaY, e.ctrlKey || e.metaKey, e.shiftKey, mx, my)
    }
    window.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => window.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions)
  }, [fullscreen, applyWheel])

  // Native mousedown на window с capture — ловит и в bg, и в любом месте
  // редактора, не зависит от того что canvasSpaceRef успел смонтироваться.
  // Аналогично wheel-listener'у. iframe имеет свой mousedown handler внутри,
  // на window сюда приходят только события из parent-документа.
  useEffect(() => {
    if (!fullscreen) return

    function onMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null
      if (!isParentArea(target)) return
      // Middle-click (зажатие колёсика) → pan. Без stud-panning класса —
      // его cursor:grabbing + pointer-events:none на iframe тормозят repaint
      // тяжелой страницы при каждом mousemove. В iframe этого эффекта нет
      // (parent body cursor не пробрасывается). Дельты накапливаем и
      // flush'им через requestAnimationFrame (60fps cap, как iframe через
      // postMessage micro-task batching).
      if (e.button === 1) {
        e.preventDefault()
        let lastX = e.clientX, lastY = e.clientY
        let pdx = 0, pdy = 0, raf = 0
        function flush() {
          raf = 0
          if (pdx === 0 && pdy === 0) return
          const dx = pdx, dy = pdy
          pdx = 0; pdy = 0
          setPanX(p => p + dx)
          setPanY(p => p + dy)
        }
        function onMove(ev: MouseEvent) {
          pdx += ev.clientX - lastX
          pdy += ev.clientY - lastY
          lastX = ev.clientX
          lastY = ev.clientY
          if (!raf) raf = requestAnimationFrame(flush)
        }
        function onUp(ev: MouseEvent) {
          if (ev.button !== 1) return
          if (raf) cancelAnimationFrame(raf)
          flush()
          document.removeEventListener('mousemove', onMove, true)
          document.removeEventListener('mouseup', onUp, true)
        }
        document.addEventListener('mousemove', onMove, true)
        document.addEventListener('mouseup', onUp, true)
        return
      }
      // LMB → box-select (кроме UI-кнопок)
      if (e.button === 0) {
        if (target && target.closest('button, a, input, textarea, select')) return
        e.preventDefault()
        startBoxSelect(e.clientX, e.clientY)
      }
    }

    window.addEventListener('mousedown', onMouseDown, { capture: true })
    return () => window.removeEventListener('mousedown', onMouseDown, { capture: true } as EventListenerOptions)
  }, [fullscreen])

  // Ctrl/Cmd + Z → undo через iframe (в parent keydown, чтобы ловить когда фокус не в iframe)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const target = e.target as HTMLElement | null
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
        e.preventDefault()
        iframeRef.current?.contentWindow?.postMessage({ type: 'stud-undo' }, '*')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Escape — снимает выделение (включая multi-select). В parent чтобы ловить
  // когда фокус не в iframe (например на панели слоёв).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      iframeRef.current?.contentWindow?.postMessage({ type: 'stud-clear-selection' }, '*')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
      } else if (data.type === 'stud-wheel') {
        // Колесо над iframe → применяем к canvas-space (pan или zoom).
        // Координаты курсора: iframe-DOM clientX/Y * scaleRatio + iframeRect offset.
        // scaleRatio = displayed iframe width / iframe content width (учёт scale).
        const iframeEl = iframeRef.current
        const canvasEl = canvasSpaceRef.current
        let mx: number | undefined, my: number | undefined
        if (iframeEl && canvasEl) {
          const iframeRect = iframeEl.getBoundingClientRect()
          const innerW = iframeEl.contentWindow?.innerWidth ?? iframeRect.width
          const ratio = innerW > 0 ? iframeRect.width / innerW : 1
          const canvasRect = canvasEl.getBoundingClientRect()
          mx = iframeRect.left + (data.clientX || 0) * ratio - canvasRect.left
          my = iframeRect.top + (data.clientY || 0) * ratio - canvasRect.top
        }
        applyWheel(data.deltaX || 0, data.deltaY || 0, !!data.ctrlKey || !!data.metaKey, !!data.shiftKey, mx, my)
      } else if (data.type === 'stud-box-start') {
        // iframe начал box-drag. Сохраняем стартовые координаты в обоих
        // системах: iframe-viewport (для финального box) и canvas-space
        // (для отрисовки рамки). НЕ регистрируем window listeners — mouse
        // capture у iframe-document, события не дойдут до parent.window.
        const iframeRect = iframeRef.current?.getBoundingClientRect()
        const canvasRect = canvasSpaceRef.current?.getBoundingClientRect()
        if (!iframeRect || !canvasRect) return
        const sxCanvas = (iframeRect.left + data.clientX) - canvasRect.left
        const syCanvas = (iframeRect.top + data.clientY) - canvasRect.top
        iframeBoxRef.current = {
          iframeStart: { x: data.clientX, y: data.clientY },
          canvasStart: { x: sxCanvas, y: syCanvas },
        }
        setBoxRect({ x: sxCanvas, y: syCanvas, w: 0, h: 0 })
        document.body.classList.add('stud-panning')
      } else if (data.type === 'stud-box-move' && iframeBoxRef.current) {
        const iframeRect = iframeRef.current?.getBoundingClientRect()
        const canvasRect = canvasSpaceRef.current?.getBoundingClientRect()
        if (!iframeRect || !canvasRect) return
        const cx = (iframeRect.left + data.clientX) - canvasRect.left
        const cy = (iframeRect.top + data.clientY) - canvasRect.top
        const s = iframeBoxRef.current.canvasStart
        setBoxRect({
          x: Math.min(s.x, cx),
          y: Math.min(s.y, cy),
          w: Math.abs(cx - s.x),
          h: Math.abs(cy - s.y),
        })
      } else if (data.type === 'stud-box-end' && iframeBoxRef.current) {
        const s = iframeBoxRef.current.iframeStart
        const boxInIframe = {
          left: Math.min(s.x, data.clientX),
          top: Math.min(s.y, data.clientY),
          right: Math.max(s.x, data.clientX),
          bottom: Math.max(s.y, data.clientY),
        }
        iframeRef.current?.contentWindow?.postMessage({ type: 'stud-box-complete', box: boxInIframe }, '*')
        iframeBoxRef.current = null
        setBoxRect(null)
        document.body.classList.remove('stud-panning')
      } else if (data.type === 'stud-pan-start') {
        // Middle-click из iframe — pan обрабатывается полностью в iframe.
        // stud-panning класс не нужен (cursor над iframe не виден parent body).
      } else if (data.type === 'stud-pan-delta') {
        // Накапливаем дельты, flush'им в RAF — батчинг в один render-кадр.
        panAccumRef.current.dx += data.dx || 0
        panAccumRef.current.dy += data.dy || 0
        if (!panAccumRef.current.raf) {
          panAccumRef.current.raf = requestAnimationFrame(() => {
            const a = panAccumRef.current
            const dx = a.dx, dy = a.dy
            a.dx = 0; a.dy = 0; a.raf = 0
            setPanX(p => p + dx)
            setPanY(p => p + dy)
          })
        }
      } else if (data.type === 'stud-pan-end') {
        // ничего — RAF-flush сам всё применит
      } else if (data.type === 'stud-resize' && typeof data.height === 'number') {
        // Cap защищает от патологических случаев когда шаблон растёт бесконечно
        const safeHeight = Math.min(Math.max(400, data.height), 30000)
        setIframeHeight(safeHeight)
      } else if (data.type === 'stud-edit-on') {
        setTextEditActive(true)
      } else if (data.type === 'stud-edit-off') {
        setTextEditActive(false)
      } else if (data.type === 'stud-element-selected') {
        setSelectedInfo({
          tagName: data.tagName,
          blockId: data.blockId,
          text: data.text || '',
          href: data.href || '',
          zIndex: data.zIndex || 'auto',
          fontSize: data.fontSize,
          color: data.color,
          background: data.background,
          width: data.width,
          height: data.height,
          padding: data.padding,
          margin: data.margin,
          borderRadius: data.borderRadius,
          opacity: data.opacity,
          isGroup: Boolean(data.isGroup),
        })
        if (typeof data.path === 'string') setSelectedPath(data.path)
        // Автопереключаем слои на блок, в котором выделенный элемент
        if (typeof data.blockId === 'string') {
          setActiveLayerBlock(data.blockId)
          setLeftTab('layers')
        }
      } else if (data.type === 'stud-element-deselected') {
        setSelectedInfo(null)
        setSelectedPath(null)
        setSelectionCount(0)
      } else if (data.type === 'stud-selection-count' && typeof data.count === 'number') {
        setSelectionCount(data.count)
      } else if (data.type === 'stud-layers' && Array.isArray(data.layers)) {
        setLayers(data.layers)
      } else if (data.type === 'stud-add-element-menu' && typeof data.blockId === 'string') {
        // Координаты приходят относительно окна iframe — переведём в координаты окна parent'а
        const iframeRect = iframeRef.current?.getBoundingClientRect()
        setAddMenu({
          blockId: data.blockId,
          x: (iframeRect?.left ?? 0) + data.x,
          y: (iframeRect?.top ?? 0) + data.y,
        })
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

  [data-block-id] { position: relative; }
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
  /* 4 drag-полосы по сторонам overlay. pointer-events: auto только у них и у ручек,
     центр overlay прозрачен для кликов чтобы клик по тексту проходил сквозь. */
  .stud-overlay .stud-edge {
    position: absolute; pointer-events: auto; cursor: move;
  }
  .stud-overlay .stud-e-top    { top: -6px; left: 0; right: 0; height: 12px; }
  .stud-overlay .stud-e-bottom { bottom: -6px; left: 0; right: 0; height: 12px; }
  .stud-overlay .stud-e-left   { top: 0; bottom: 0; left: -6px; width: 12px; }
  .stud-overlay .stud-e-right  { top: 0; bottom: 0; right: -6px; width: 12px; }
  .stud-overlay .stud-handle {
    position: absolute; pointer-events: auto;
    width: 12px; height: 12px; background: #6A55F8;
    border: 2px solid #fff; border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    z-index: 2;
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

  /* Отключаем нативное выделение браузера везде внутри редактора,
     кроме элементов сейчас в режиме редактирования текста (contenteditable=true).
     Это убирает раздражающее «синее» выделение которое срабатывало при drag. */
  html, body, [data-block-id] { user-select: none; -webkit-user-select: none; }
  [contenteditable="true"] { user-select: text; -webkit-user-select: text; }

  /* Box-select rectangle */
  .stud-box-select {
    position: absolute; z-index: 9999;
    background: rgba(106,85,248,0.1);
    border: 1.5px dashed #6A55F8;
    pointer-events: none;
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
        '<button data-act="add-element" title="Добавить элемент" style="color:#c4b5fd">+ Элемент</button>',
        '<button data-act="align-left" title="Выровнять по левому">⬅</button>',
        '<button data-act="align-center" title="Выровнять по центру">↔</button>',
        '<button data-act="align-right" title="Выровнять по правому">➡</button>',
        '<div style="width:1px;height:16px;background:rgba(255,255,255,0.2);margin:0 2px"></div>',
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
        else if (act === 'align-left')   { var inner = section.querySelector(':scope > .block-inner'); if (inner) { pushUndo(blockId, true); inner.style.textAlign = 'left';   parent.postMessage({ type: 'stud-input', blockId: blockId }, '*'); } }
        else if (act === 'align-center') { var inner = section.querySelector(':scope > .block-inner'); if (inner) { pushUndo(blockId, true); inner.style.textAlign = 'center'; parent.postMessage({ type: 'stud-input', blockId: blockId }, '*'); } }
        else if (act === 'align-right')  { var inner = section.querySelector(':scope > .block-inner'); if (inner) { pushUndo(blockId, true); inner.style.textAlign = 'right';  parent.postMessage({ type: 'stud-input', blockId: blockId }, '*'); } }
        else if (act === 'add-element')  {
          // Позиция кнопки — передаём в parent, он откроет popup-меню там
          var r = btn.getBoundingClientRect();
          var iframeRect = { left: 0, top: 0 };  // iframe.getBoundingClientRect через parent
          parent.postMessage({
            type: 'stud-add-element-menu',
            blockId: blockId,
            x: r.left + r.width / 2,
            y: r.bottom + 4,
          }, '*');
        }
      });
      section.appendChild(toolbar);
    });

    // Сбросить старые translate у блоков (если пользователь успел таскать блоки ранее)
    document.querySelectorAll('[data-block-id]').forEach(function(section) {
      var t = section.style.transform || '';
      if (/translate\\(/.test(t)) {
        section.style.transform = t.replace(/translate\\([^)]*\\)\\s*/g, '').trim();
      }
    });
    // Авто-contenteditable НЕ ставим. Элементы становятся редактируемыми только
    // после ВТОРОГО клика на уже выделенный элемент. Первый клик — выделение
    // (рамка + drag/resize), второй — вход в редактирование текста.

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
    // Tilda-like element-level selection:
    //  - Первый клик на любой элемент → overlay с рамкой + 8 resize-ручек + drag-кнопкой
    //  - Drag за ✥ — перемещает элемент (transform: translate)
    //  - Drag за уголок — resize (width/height; inline → inline-block автоматом)
    //  - Второй клик на уже выделенный текстовый элемент → режим редактирования,
    //    каретка ставится в точку клика
    //  - Esc / клик вне → снять
    // ───────────────────────────────────────────────────────────────
    var overlay = null;
    var selectedEl = null;        // primary (последний кликнутый) — для drag/resize
    var selectedEls = [];         // массив всех выделенных для Multi-select
    var secondaryOutlines = [];   // отдельные рамки-подсветки у не-primary selected
    var editingEl = null;
    // Строит DOM-путь элемента от блока для обратной адресации ('block:{id}/children/2/0')
    function buildDomPath(el) {
      var section = el.closest('[data-block-id]');
      if (!section) return '';
      var parts = [];
      var cur = el;
      while (cur && cur !== section) {
        var p = cur.parentElement;
        if (!p) break;
        var idx = Array.prototype.indexOf.call(p.children, cur);
        parts.unshift(String(idx));
        cur = p;
      }
      return section.getAttribute('data-block-id') + ':' + parts.join('/');
    }

    function elementByPath(path) {
      if (!path) return null;
      var parts = path.split(':');
      var blockId = parts[0];
      var idxPath = parts[1] || '';
      var section = document.querySelector('[data-block-id="' + blockId + '"]');
      if (!section) return null;
      var el = section;
      if (idxPath === '') return null;
      var indices = idxPath.split('/').map(Number);
      for (var i = 0; i < indices.length; i++) {
        el = el && el.children[indices[i]];
      }
      return el || null;
    }

    function rgbToHex(rgb) {
      if (!rgb) return '';
      if (/^#/.test(rgb)) return rgb.toLowerCase();
      var m = /^rgba?\\((\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)/.exec(rgb);
      if (!m) return rgb;
      function h(n) { var s = parseInt(n,10).toString(16); return s.length === 1 ? '0'+s : s; }
      return '#' + h(m[1]) + h(m[2]) + h(m[3]);
    }

    function isTextual(el) {
      if (!el || !el.tagName) return false;
      // Редактировать можно текстовые блоки, кнопки и листовые div с текстом
      if (TEXT_BLOCK_TAGS.indexOf(el.tagName) !== -1) return true;
      if (el.tagName === 'BUTTON') return true;
      if (el.tagName === 'DIV' && el.children.length === 0 && el.textContent.trim()) return true;
      return false;
    }

    var TEXT_BLOCK_TAGS = ['H1','H2','H3','H4','H5','H6','P','LI','BLOCKQUOTE','FIGCAPTION','DT','DD'];
    var INLINE_TAGS = ['SPAN','B','I','EM','STRONG','A','MARK','CODE','SMALL','SUB','SUP'];

    /** Найти подходящий для выделения элемент.
     *  - inline внутри текст-блока (span в h1, b в p) → вернуть текст-блок целиком
     *  - клик по wrapper-у всего блока (первый ребёнок .block-inner, занимающий >90% ширины) → null
     *  - .block-inner и сама секция data-block-id → null
     *  - всё остальное (тексты, фигуры, картинки, вложенные div) → селектим */
    function findSelectable(target) {
      var el = target;
      if (el && el.nodeType !== 1) el = el.parentElement;
      if (!el) return null;
      if (el.closest && el.closest('[data-stud-editor-inject]')) return null;
      var blockSection = el.closest && el.closest('[data-block-id]');
      if (!blockSection) return null;

      // inline внутри текст-блока → текст-блок
      if (el.tagName && INLINE_TAGS.indexOf(el.tagName) !== -1) {
        var p = el.parentElement;
        while (p && p !== blockSection && !(p.classList && p.classList.contains('block-inner'))) {
          if (TEXT_BLOCK_TAGS.indexOf(p.tagName) !== -1) return p;
          p = p.parentElement;
        }
      }

      // Запрещаем выделять сам block-inner и секцию
      if (el.classList && el.classList.contains('block-inner')) return null;
      if (el === blockSection) return null;

      // Запрещаем выделять wrapper всего блока (первый ребёнок .block-inner, занимающий всю ширину)
      var parent = el.parentElement;
      if (parent && parent.classList && parent.classList.contains('block-inner') && el.children.length > 0) {
        var r = el.getBoundingClientRect();
        var pr = parent.getBoundingClientRect();
        if (pr.width > 0 && r.width >= pr.width * 0.9) return null;
      }

      return el;
    }

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
    }

    function clearSecondaryOutlines() {
      secondaryOutlines.forEach(function(o) { if (o.parentNode) o.parentNode.removeChild(o); });
      secondaryOutlines = [];
    }
    function removeOverlay() {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
      selectedEl = null;
      selectedEls = [];
      clearSecondaryOutlines();
      parent.postMessage({ type: 'stud-element-deselected' }, '*');
    }

    function redrawSecondaryOutlines() {
      clearSecondaryOutlines();
      selectedEls.forEach(function(el) {
        if (el === selectedEl) return;  // primary уже обведён overlay'ем
        var r = el.getBoundingClientRect();
        var o = document.createElement('div');
        o.className = 'stud-overlay';
        o.setAttribute('data-stud-editor-inject', 'true');
        o.style.left = (window.scrollX + r.left) + 'px';
        o.style.top = (window.scrollY + r.top) + 'px';
        o.style.width = r.width + 'px';
        o.style.height = r.height + 'px';
        // Только рамка, без ручек и drag-зон
        document.body.appendChild(o);
        secondaryOutlines.push(o);
      });
    }

    function exitEditMode() {
      if (editingEl) {
        editingEl.removeAttribute('contenteditable');
        editingEl = null;
      }
      // Уведомить parent — fixed format-toolbar должен скрыться
      parent.postMessage({ type: 'stud-edit-off' }, '*');
    }

    function setSelection(els) {
      // els может быть массивом или одним элементом
      var arr = Array.isArray(els) ? els.filter(Boolean) : (els ? [els] : []);
      if (arr.length === 0) { removeOverlay(); return; }
      selectedEls = arr;
      buildElementOverlay(arr[arr.length - 1]);
      redrawSecondaryOutlines();
      parent.postMessage({ type: 'stud-selection-count', count: arr.length }, '*');
    }

    function toggleInSelection(el) {
      var idx = selectedEls.indexOf(el);
      if (idx !== -1) {
        var next = selectedEls.slice();
        next.splice(idx, 1);
        setSelection(next);
      } else {
        setSelection(selectedEls.concat([el]));
      }
    }

    function buildElementOverlay(el) {
      // primary-overlay с ручками
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
      selectedEl = el;
      if (selectedEls.indexOf(el) === -1) selectedEls = [el];

      // Уведомляем parent — откроется правая панель настроек
      var section = el.closest('[data-block-id]');
      var href = '';
      if (el.tagName === 'A') href = el.getAttribute('href') || '';
      else if (el.tagName === 'BUTTON') href = el.getAttribute('data-href') || '';
      var textPreview = (el.textContent || '').trim().slice(0, 40);
      var cs = window.getComputedStyle(el);
      parent.postMessage({
        type: 'stud-element-selected',
        tagName: el.tagName,
        blockId: section ? section.getAttribute('data-block-id') : null,
        text: textPreview,
        href: href,
        zIndex: el.style.zIndex || cs.zIndex || 'auto',
        path: buildDomPath(el),
        fontSize: el.style.fontSize || cs.fontSize,
        color: rgbToHex(el.style.color || cs.color),
        background: rgbToHex(el.style.backgroundColor || cs.backgroundColor),
        width: el.style.width || '',
        height: el.style.height || '',
        padding: el.style.padding || '',
        margin: el.style.margin || '',
        borderRadius: el.style.borderRadius || cs.borderRadius,
        opacity: el.style.opacity || cs.opacity || '1',
        isGroup: el.hasAttribute && el.hasAttribute('data-stud-group'),
      }, '*');

      overlay = document.createElement('div');
      overlay.className = 'stud-overlay';
      overlay.setAttribute('data-stud-editor-inject', 'true');
      // Overlay прозрачен для кликов (pointer-events: none) — клик в текст проходит
      // сквозь него. Интерактивны только drag-button сверху и 8 ручек по углам.
      overlay.innerHTML = [
        // Drag: тяни за любую грань
        '<div class="stud-edge stud-e-top"    data-handle="move"></div>',
        '<div class="stud-edge stud-e-bottom" data-handle="move"></div>',
        '<div class="stud-edge stud-e-left"   data-handle="move"></div>',
        '<div class="stud-edge stud-e-right"  data-handle="move"></div>',
        // Resize: 8 ручек поверх граней
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
      if (!overlay || !selectedEl) return;
      var r = selectedEl.getBoundingClientRect();
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
      if (!selectedEl) return;
      var section = selectedEl.closest('[data-block-id]');
      var blockId = section ? section.getAttribute('data-block-id') : null;
      if (blockId) pushUndo(blockId, true);

      var startX = e.clientX, startY = e.clientY;
      var r = selectedEl.getBoundingClientRect();
      var origW = r.width, origH = r.height;
      // Текущий translate если уже был
      var curTx = 0, curTy = 0;
      var m = /translate\\((-?\\d+(?:\\.\\d+)?)px,\\s*(-?\\d+(?:\\.\\d+)?)px\\)/.exec(selectedEl.style.transform || '');
      if (m) { curTx = parseFloat(m[1]); curTy = parseFloat(m[2]); }

      // Для resize inline-элементов (span, a, b, i) принудительно inline-block,
      // иначе width/height не применяется
      if (mode !== 'move') {
        var disp = window.getComputedStyle(selectedEl).display;
        if (disp === 'inline') selectedEl.style.display = 'inline-block';
      }

      document.body.classList.add('stud-dragging');

      function onMove(ev) {
        var dx = ev.clientX - startX;
        var dy = ev.clientY - startY;
        if (mode === 'move') {
          // Перемещение через transform: элемент не выдёргивается из flow, соседей не ломает
          selectedEl.style.transform = 'translate(' + (curTx + dx) + 'px, ' + (curTy + dy) + 'px)';
        } else {
          // Resize элемента. С запада/севера дополнительно смещаем translate,
          // чтобы элемент «тянулся» от противоположной стороны — визуально естественно.
          var w = origW, h = origH, tx = curTx, ty = curTy;
          if (mode.indexOf('e') !== -1) w = origW + dx;
          if (mode.indexOf('w') !== -1) { w = origW - dx; tx = curTx + dx; }
          if (mode.indexOf('s') !== -1) h = origH + dy;
          if (mode.indexOf('n') !== -1) { h = origH - dy; ty = curTy + dy; }
          if (w < 20) w = 20;
          if (h < 20) h = 20;
          selectedEl.style.width = w + 'px';
          selectedEl.style.height = h + 'px';
          if (mode.indexOf('w') !== -1 || mode.indexOf('n') !== -1) {
            selectedEl.style.transform = 'translate(' + tx + 'px, ' + ty + 'px)';
          }
        }
        positionOverlay();
      }
      function onUp() {
        document.body.classList.remove('stud-dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (blockId) parent.postMessage({ type: 'stud-input', blockId: blockId }, '*');
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    // Группировка: оборачиваем все selectedEls в <div data-stud-group>,
    // сохраняя порядок в DOM. Возможна только если у всех один родитель.
    function groupSelected() {
      if (selectedEls.length < 2) return;
      var parent0 = selectedEls[0].parentElement;
      if (!parent0) return;
      for (var i = 0; i < selectedEls.length; i++) {
        if (selectedEls[i].parentElement !== parent0) {
          // Разные родители — пока не поддерживаем
          return;
        }
      }
      var section = parent0.closest('[data-block-id]');
      var bid = section ? section.getAttribute('data-block-id') : null;
      if (bid) pushUndo(bid, true);
      // Сортируем по позиции в DOM
      var sorted = selectedEls.slice().sort(function(a, b) {
        // eslint-disable-next-line no-bitwise
        return (a.compareDocumentPosition(b) & 4) ? -1 : 1;
      });
      var group = document.createElement('div');
      group.setAttribute('data-stud-group', '1');
      group.style.display = 'inline-block';
      parent0.insertBefore(group, sorted[0]);
      sorted.forEach(function(el) { group.appendChild(el); });
      setSelection([group]);
      if (bid) parent.postMessage({ type: 'stud-input', blockId: bid }, '*');
    }

    function ungroupSelected() {
      var el = selectedEls[0];
      if (!el || !el.hasAttribute('data-stud-group')) return;
      var p = el.parentElement;
      if (!p) return;
      var section = p.closest('[data-block-id]');
      var bid = section ? section.getAttribute('data-block-id') : null;
      if (bid) pushUndo(bid, true);
      var childrenArr = Array.prototype.slice.call(el.children);
      childrenArr.forEach(function(c) { p.insertBefore(c, el); });
      if (el.parentNode) el.parentNode.removeChild(el);
      setSelection(childrenArr);
      if (bid) parent.postMessage({ type: 'stud-input', blockId: bid }, '*');
    }

    // Box-select полностью обрабатывается ВНУТРИ iframe.
    // Браузер привязывает mouse-capture к iframe-document при mousedown →
    // mousemove/mouseup идут в iframe независимо от pointer-events:none.
    // Поэтому слушать window в parent бесполезно. iframe сам ловит move/up
    // и шлёт parent'у updates через postMessage — рамка рисуется в реальном
    // времени, на mouseup применяется selection.
    document.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;
      if (e.target.closest('.stud-overlay, .stud-block-toolbar, .stud-add-block-btn, .stud-box-select, .stud-float-toolbar')) return;
      if (editingEl && editingEl.contains(e.target)) return;
      if (findSelectable(e.target)) return;
      var sx = e.clientX, sy = e.clientY;
      var started = false;
      function onMove(ev) {
        if (!started) {
          if (Math.abs(ev.clientX - sx) < 6 && Math.abs(ev.clientY - sy) < 6) return;
          started = true;
          parent.postMessage({ type: 'stud-box-start', clientX: sx, clientY: sy }, '*');
        }
        parent.postMessage({ type: 'stud-box-move', clientX: ev.clientX, clientY: ev.clientY }, '*');
      }
      function onUp(ev) {
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('mouseup', onUp, true);
        if (started) {
          parent.postMessage({ type: 'stud-box-end', clientX: ev.clientX, clientY: ev.clientY }, '*');
        }
      }
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('mouseup', onUp, true);
    });

    // Iframe-side функция которую parent вызывает после mouseup с финальным rect в
    // iframe-viewport coords — ищет все selectable-элементы внутри и выделяет.
    window.__studBoxComplete = function(box) {
      var found = [];
      document.querySelectorAll('[data-block-id]').forEach(function(sec) {
        var all = sec.querySelectorAll('*');
        all.forEach(function(el) {
          if (el.getAttribute && el.getAttribute('data-stud-editor-inject')) return;
          if (findSelectable(el) !== el) return;
          var r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) return;
          if (r.right < box.left || r.left > box.right) return;
          if (r.bottom < box.top || r.top > box.bottom) return;
          found.push(el);
        });
      });
      if (found.length > 0) setSelection(found);
    };

    // Клики:
    //  - Обычный клик на элемент → одиночный select
    //  - Shift+клик → toggle в multi-selection
    //  - 2-й клик на уже одиночно выделенном текстовом → edit mode
    document.addEventListener('click', function(e) {
      if (e.target.closest && (e.target.closest('.stud-overlay') || e.target.closest('.stud-block-toolbar') || e.target.closest('.stud-add-block-btn') || e.target.closest('.stud-box-select'))) return;
      if (editingEl && editingEl.contains(e.target)) return;

      var el = findSelectable(e.target);
      if (!el) {
        exitEditMode();
        removeOverlay();
        return;
      }
      exitEditMode();

      if (e.shiftKey) {
        toggleInSelection(el);
        return;
      }

      // Второй клик на уже ОДИНОЧНО выделенном текстовом → редактирование
      if (selectedEls.length === 1 && selectedEls[0] === el && isTextual(el)) {
        removeOverlay();
        editingEl = el;
        el.setAttribute('contenteditable', 'true');
        el.focus();
        parent.postMessage({ type: 'stud-edit-on' }, '*');
        try {
          var range = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
          if (range) {
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }
        } catch (_) {}
        return;
      }

      setSelection([el]);
    });

    // Esc → выйти из edit / снять выделение. Ctrl-Z / Cmd-Z → undo
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        exitEditMode();
        removeOverlay();
        return;
      }
      // Delete / Backspace — удаляет все выделенные (если не в edit-mode)
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEls.length > 0 && !editingEl) {
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
        e.preventDefault();
        var bidsToNotify = {};
        selectedEls.forEach(function(sel) {
          var section = sel.closest('[data-block-id]');
          if (section) {
            var bid = section.getAttribute('data-block-id');
            if (bid && !bidsToNotify[bid]) { pushUndo(bid, true); bidsToNotify[bid] = true; }
          }
          if (sel.parentNode) sel.parentNode.removeChild(sel);
        });
        removeOverlay();
        Object.keys(bidsToNotify).forEach(function(bid) {
          parent.postMessage({ type: 'stud-input', blockId: bid }, '*');
        });
        return;
      }
      // Cmd+G / Ctrl+G — группировка выделенных
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g' && !e.shiftKey) {
        if (selectedEls.length < 2) return;
        e.preventDefault();
        groupSelected();
        return;
      }
      // Cmd+Shift+G / Ctrl+Shift+G — разгруппировка
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'g') {
        if (selectedEls.length !== 1) return;
        e.preventDefault();
        ungroupSelected();
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

    // При скролле / ресайзе окна — обновляем позицию overlay
    window.addEventListener('scroll', positionOverlay, true);
    window.addEventListener('resize', positionOverlay);

    // ───────────────────────────────────────────────────────────────
    // Форматирование применяется через команды от parent'а (fixed toolbar).
    // iframe слушает сообщения {type:'stud-format', cmd, value} и применяет
    // их к текущему выделению через execCommand.
    // ───────────────────────────────────────────────────────────────
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

    // Периодически отправляем parent'у дерево слоёв.
    // В слои попадают ТОЛЬКО визуально взаимодействуемые элементы — те, которые
    // при клике реально выделятся через findSelectable. Скрипты, style, link,
    // скрытые элементы, wrapper'ы — пропускаем.
    var INVISIBLE_TAGS = ['SCRIPT','STYLE','LINK','META','TITLE','HEAD','NOSCRIPT','BR','TEMPLATE'];
    function collectLayers() {
      var out = [];
      document.querySelectorAll('[data-block-id]').forEach(function(section) {
        var bid = section.getAttribute('data-block-id');
        var inner = section.querySelector(':scope > .block-inner');
        if (!inner) return;

        function walk(el, depth) {
          for (var i = 0; i < el.children.length; i++) {
            var c = el.children[i];
            if (!c || !c.tagName) continue;
            // Служебные инжекты — пропускаем
            if (c.getAttribute && c.getAttribute('data-stud-editor-inject')) continue;
            // Невидимые/техтеги
            var tag = c.tagName;
            if (INVISIBLE_TAGS.indexOf(tag) !== -1) {
              // Но внутрь всё равно спускаться не нужно
              continue;
            }
            // Невидимые по стилям / с нулевым размером
            var cs = window.getComputedStyle(c);
            if (cs.display === 'none' || cs.visibility === 'hidden') {
              // Всё равно пропускаем — пользователь их не увидит
              continue;
            }
            var rect = c.getBoundingClientRect();
            var hasSize = (rect.width > 1 && rect.height > 1);

            // Селектится ли этот элемент кликом?
            var selectable = (findSelectable(c) === c);

            if (selectable && hasSize) {
              var path = buildDomPath(c);
              var label;
              if (TEXT_BLOCK_TAGS.indexOf(tag) !== -1 || tag === 'BUTTON' || tag === 'A') {
                var txt = (c.textContent || '').trim().slice(0, 30);
                label = txt || tag;
              } else if (tag === 'IMG') {
                label = (c.getAttribute('alt') || c.getAttribute('src') || 'картинка').slice(0, 30);
              } else if (tag === 'VIDEO' || tag === 'IFRAME') {
                label = tag.toLowerCase();
              } else {
                label = tag.toLowerCase();
                if (c.className && typeof c.className === 'string') {
                  var firstClass = c.className.split(' ').filter(function(x){ return x && x.indexOf('stud-') !== 0 })[0];
                  if (firstClass) label = firstClass;
                }
              }
              out.push({
                path: path,
                tag: tag,
                label: label,
                blockId: bid,
                depth: depth,
              });
            }

            // Рекурсия внутрь — чтобы не пропустить вложенные фигуры
            if (depth < 6 && c.children.length > 0 && c.children.length < 80 && INLINE_TAGS.indexOf(tag) === -1) {
              walk(c, selectable && hasSize ? depth + 1 : depth);
            }
          }
        }
        walk(inner, 0);
      });
      parent.postMessage({ type: 'stud-layers', layers: out }, '*');
    }

    // Debounced collect — чтобы не спамить при каждой правке
    var collectTimer = null;
    function scheduleCollect() {
      if (collectTimer) clearTimeout(collectTimer);
      collectTimer = setTimeout(collectLayers, 300);
    }
    collectLayers();
    // MutationObserver на весь document.body — любое изменение DOM → обновить слои
    try {
      var mo = new MutationObserver(scheduleCollect);
      mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style','class'] });
    } catch (_) {}

    // Пересылаем wheel в parent — чтобы pan/zoom работали когда курсор над сайтом.
    // clientX/Y в iframe-DOM-coords → parent конвертирует в canvas-coords для zoom-к-курсору.
    window.addEventListener('wheel', function(e) {
      if (editingEl && editingEl.contains(e.target)) return;
      e.preventDefault();
      parent.postMessage({
        type: 'stud-wheel',
        deltaX: e.deltaX, deltaY: e.deltaY,
        clientX: e.clientX, clientY: e.clientY,
        altKey: e.altKey, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey,
      }, '*');
    }, { passive: false });

    // Middle-click pan — полностью обрабатывается в iframe (mouse capture
    // принадлежит iframe-document после mousedown).
    // ВАЖНО: используем screenX/screenY вместо clientX/clientY. clientX
    // относительно iframe-window, а iframe сдвигается на экране при каждом
    // pan-применении → клиентские координаты курсора меняются "сами собой"
    // → накапливающаяся ошибка дельты → ТРЯСКА. screenX относительно
    // физического экрана, не зависит от transform iframe.
    document.addEventListener('mousedown', function(e) {
      if (e.button !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      parent.postMessage({ type: 'stud-pan-start' }, '*');
      var lastX = e.screenX, lastY = e.screenY;
      function onMove(ev) {
        parent.postMessage({ type: 'stud-pan-delta', dx: ev.screenX - lastX, dy: ev.screenY - lastY }, '*');
        lastX = ev.screenX;
        lastY = ev.screenY;
      }
      function onUp(ev) {
        if (ev.button !== 1) return;
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('mouseup', onUp, true);
        parent.postMessage({ type: 'stud-pan-end' }, '*');
      }
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('mouseup', onUp, true);
    }, true);
    document.addEventListener('auxclick', function(e) {
      if (e.button === 1) { e.preventDefault(); e.stopPropagation(); }
    }, true);

    window.addEventListener('message', function(e) {
      var data = e.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'stud-undo') { doUndo(); return; }
      if (data.type === 'stud-clear-selection') {
        exitEditMode();
        removeOverlay();
        return;
      }
      if (data.type === 'stud-box-complete' && data.box && window.__studBoxComplete) {
        window.__studBoxComplete(data.box);
        return;
      }
      if (data.type === 'stud-select-path') {
        var el = elementByPath(data.path);
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (el) setSelection([el]);
        return;
      }
      if (data.type === 'stud-style-update' && selectedEl && data.prop) {
        var sec = selectedEl.closest('[data-block-id]');
        var bid = sec ? sec.getAttribute('data-block-id') : null;
        if (bid) pushUndo(bid, true);
        // CSS property name: может прийти в camelCase (fontSize) → применяем как style.fontSize
        selectedEl.style[data.prop] = data.value;
        positionOverlay();
        if (bid) parent.postMessage({ type: 'stud-input', blockId: bid }, '*');
        return;
      }
      if (data.type === 'stud-format') {
        if (!editingEl) return;
        var section = editingEl.closest('[data-block-id]');
        if (section) pushUndo(section.getAttribute('data-block-id'), true);
        // Возвращаем фокус и восстанавливаем выделение если оно слетело
        editingEl.focus();
        if (data.cmd === 'fontSize' && data.value) {
          applyFontSizeToSelection(parseInt(data.value, 10));
        } else {
          document.execCommand(data.cmd, false, data.value);
        }
        if (section) parent.postMessage({ type: 'stud-input', blockId: section.getAttribute('data-block-id') }, '*');
      } else if (data.type === 'stud-align-block' && data.blockId) {
        // Выравнивание содержимого блока (text-align на .block-inner)
        var section = document.querySelector('[data-block-id="' + data.blockId + '"]');
        if (!section) return;
        var inner = section.querySelector(':scope > .block-inner');
        if (!inner) return;
        pushUndo(data.blockId, true);
        inner.style.textAlign = data.align;
        parent.postMessage({ type: 'stud-input', blockId: data.blockId }, '*');
      } else if (data.type === 'stud-element-update-link' && selectedEl) {
        var sec = selectedEl.closest('[data-block-id]');
        var bid = sec ? sec.getAttribute('data-block-id') : null;
        if (bid) pushUndo(bid, true);
        if (selectedEl.tagName === 'A') selectedEl.setAttribute('href', data.href || '#');
        else selectedEl.setAttribute('data-href', data.href || '');
        if (bid) parent.postMessage({ type: 'stud-input', blockId: bid }, '*');
      } else if (data.type === 'stud-element-layer' && selectedEl) {
        var sec2 = selectedEl.closest('[data-block-id]');
        var bid2 = sec2 ? sec2.getAttribute('data-block-id') : null;
        if (bid2) pushUndo(bid2, true);
        var cur = parseInt(selectedEl.style.zIndex || '0', 10) || 0;
        if (data.direction === 'front')       selectedEl.style.zIndex = String(cur + 1);
        else if (data.direction === 'back')   selectedEl.style.zIndex = String(cur - 1);
        else if (data.direction === 'top')    selectedEl.style.zIndex = '999';
        else if (data.direction === 'bottom') selectedEl.style.zIndex = '-1';
        // Position: relative нужен чтобы z-index работал
        if (window.getComputedStyle(selectedEl).position === 'static') {
          selectedEl.style.position = 'relative';
        }
        positionOverlay();
        if (bid2) parent.postMessage({ type: 'stud-input', blockId: bid2 }, '*');
      } else if (data.type === 'stud-element-delete' && selectedEls.length > 0) {
        var bidsDel = {};
        selectedEls.forEach(function(sel) {
          var s3 = sel.closest('[data-block-id]');
          if (s3) {
            var b3 = s3.getAttribute('data-block-id');
            if (b3 && !bidsDel[b3]) { pushUndo(b3, true); bidsDel[b3] = true; }
          }
          if (sel.parentNode) sel.parentNode.removeChild(sel);
        });
        removeOverlay();
        Object.keys(bidsDel).forEach(function(b) { parent.postMessage({ type: 'stud-input', blockId: b }, '*'); });
      } else if (data.type === 'stud-group-selection') {
        groupSelected();
      } else if (data.type === 'stud-ungroup-selection') {
        ungroupSelected();
      } else if (data.type === 'stud-add-element' && data.blockId) {
        var sec4 = document.querySelector('[data-block-id="' + data.blockId + '"]');
        if (!sec4) return;
        var inner = sec4.querySelector(':scope > .block-inner');
        if (!inner) return;
        pushUndo(data.blockId, true);
        var newEl = null;
        if (data.kind === 'text') {
          newEl = document.createElement('p');
          newEl.style.cssText = 'margin:20px 0;font-size:18px;color:inherit';
          newEl.textContent = 'Новый текст';
        } else if (data.kind === 'heading') {
          newEl = document.createElement('h2');
          newEl.style.cssText = 'margin:20px 0;font-size:32px;font-weight:700;color:inherit';
          newEl.textContent = 'Новый заголовок';
        } else if (data.kind === 'button') {
          newEl = document.createElement('a');
          newEl.setAttribute('href', '#');
          newEl.style.cssText = 'display:inline-block;padding:14px 32px;background:#6A55F8;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin:20px 0';
          newEl.textContent = 'Кнопка';
        } else if (data.kind === 'shape') {
          newEl = document.createElement('div');
          newEl.style.cssText = 'width:200px;height:150px;background:' + (data.color || '#6A55F8') + ';border-radius:12px;margin:20px auto;display:block';
        } else if (data.kind === 'image' && data.src) {
          newEl = document.createElement('img');
          newEl.setAttribute('src', data.src);
          newEl.setAttribute('alt', '');
          newEl.style.cssText = 'max-width:100%;height:auto;display:block;margin:20px auto;border-radius:8px';
        } else if (data.kind === 'divider') {
          newEl = document.createElement('hr');
          newEl.style.cssText = 'border:none;border-top:1px solid rgba(255,255,255,0.2);margin:30px 0';
        }
        if (newEl) {
          inner.appendChild(newEl);
          parent.postMessage({ type: 'stud-input', blockId: data.blockId }, '*');
          // Сразу селектим только что добавленный
          setTimeout(function() { buildElementOverlay(newEl); }, 0);
        }
      }
    });

    document.addEventListener('selectionchange', function() {
      var sel = window.getSelection();
      var has = !!(sel && sel.rangeCount > 0 && !sel.isCollapsed);
      parent.postMessage({ type: 'stud-selection', has: has }, '*');
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

  const viewportWidth = VIEWPORT_WIDTH[viewport]
  const isMobileLike = viewport === 'mobile' || viewport === 'phone-large'

  if (!fullscreen) {
    // Компактный режим — как раньше, простая кнопка «На весь экран» для перехода в Tilda-UI
    return (
      <div className="space-y-3">
        <div className="bg-white rounded-xl border border-gray-100 px-3 py-2 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {blocks.length} {blocks.length === 1 ? 'блок' : blocks.length < 5 ? 'блока' : 'блоков'}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setFullscreen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#6A55F8] text-white hover:bg-[#5845e0]">
              ⛶ Открыть редактор
            </button>
            <button onClick={() => void handleSaveAll()} disabled={saving || dirty.size === 0}
              className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 ${
                dirty.size > 0 ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-gray-100 text-gray-500'
              }`}>
              {saving ? 'Сохранение...' : dirty.size > 0 ? `● Сохранить (${dirty.size})` : '✓ Сохранено'}
            </button>
          </div>
        </div>
        <iframe
          ref={iframeRef}
          srcDoc={previewDoc}
          className="w-full border-0 rounded-lg bg-white shadow-sm"
          style={{ height: Math.min(iframeHeight, 800) }}
          sandbox="allow-scripts allow-same-origin"
        />
        {activeHtmlBlock && (
          <HtmlBlockModal key={activeHtmlBlock.id} block={activeHtmlBlock}
            onClose={() => setEditingHtmlBlockId(null)}
            onSave={(newHtml) => { updateBlockLocal(activeHtmlBlock.id, { html_content: newHtml }); setEditingHtmlBlockId(null) }}
          />
        )}
      </div>
    )
  }

  // ══ Tilda-подобный fullscreen редактор ════════════════════════════════
  return (
    <div data-stud-fullscreen-root className="fixed inset-0 z-40 bg-gray-200 flex flex-col">
      {/* ── Top bar — grid 3 зоны, центр точно по центру окна ── */}
      <div className="h-14 bg-white border-b border-gray-200 relative flex-shrink-0">
        {/* Left: + Add */}
        <div className="absolute left-3 top-0 h-full flex items-center">
          <button
            onClick={() => {
              const firstBlockId = blocks[0]?.id
              if (!firstBlockId) { void handleAddBlock(); return }
              setAddMenu({ blockId: firstBlockId, x: 80, y: 64 })
            }}
            className="w-10 h-10 rounded-full bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center text-xl"
            title="Добавить элемент"
          >+</button>
        </div>

        {/* Center: viewport switcher — строго по центру окна */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-1 pointer-events-auto">
            <ViewportBtn label="Мобильный" active={viewport === 'mobile'} onClick={() => setViewport('mobile')}>
              <svg width="14" height="18" viewBox="0 0 14 18" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="12" height="16" rx="2"/><circle cx="7" cy="14" r="0.5" fill="currentColor"/></svg>
            </ViewportBtn>
            <ViewportBtn label="Большой телефон" active={viewport === 'phone-large'} onClick={() => setViewport('phone-large')}>
              <svg width="16" height="20" viewBox="0 0 16 20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="14" height="18" rx="2"/></svg>
            </ViewportBtn>
            <ViewportBtn label="Планшет" active={viewport === 'tablet'} onClick={() => setViewport('tablet')}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="2" width="16" height="14" rx="2"/></svg>
            </ViewportBtn>
            <ViewportBtn label="Десктоп" active={viewport === 'desktop'} onClick={() => setViewport('desktop')}>
              <svg width="20" height="16" viewBox="0 0 20 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="18" height="12" rx="1.5"/><path d="M7 15h6"/></svg>
            </ViewportBtn>
          </div>
        </div>

        {/* Right: save / close / help */}
        <div className="absolute right-3 top-0 h-full flex items-center gap-2">
          <button onClick={() => void handleSaveAll()} disabled={saving || dirty.size === 0}
            className={`px-6 py-2 rounded-lg text-sm font-bold uppercase tracking-wide transition-colors disabled:opacity-60 ${
              dirty.size > 0 ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-gray-200 text-gray-500'
            }`}>
            {saving ? '...' : 'Сохранить'}
          </button>
          <button onClick={() => setFullscreen(false)}
            className="px-6 py-2 rounded-lg text-sm font-bold uppercase tracking-wide border border-gray-300 text-gray-700 hover:bg-gray-50">
            Закрыть
          </button>
          <button className="w-10 h-10 rounded-full border border-gray-300 text-gray-500 flex items-center justify-center hover:bg-gray-50" title="Справка">?</button>
          <button className="w-10 h-10 rounded-full border border-gray-300 text-gray-500 flex items-center justify-center hover:bg-gray-50" title="Ещё">⋯</button>
        </div>
      </div>

      {/* ── Main area: canvas-space + overlay-панели ── */}
      <div className="flex-1 relative min-h-0">
        {/* Canvas-space — вокруг сайта есть пустое пространство серого цвета.
            Middle-click drag панорамирует, Alt+wheel зумирует. */}
        <div
          ref={canvasSpaceRef}
          className="absolute inset-0 overflow-hidden select-none"
          style={{
            background: 'repeating-conic-gradient(#dedede 0 25%, #e8e8e8 0 50%) 0 0 / 20px 20px',
          }}
        >
          <div
            className="absolute top-0 left-0"
            style={{
              transform: `translate3d(${panX}px, ${panY}px, 0) scale(${scale})`,
              transformOrigin: '0 0',
              willChange: 'transform',
              padding: 40,
              display: 'flex',
              justifyContent: 'center',
              minWidth: '100%',
            }}
          >
            <div
              data-stud-site-wrap
              className={`bg-white transition-shadow ${isMobileLike ? 'rounded-[2rem] border-[8px] border-gray-800 overflow-hidden shadow-2xl' : 'rounded-lg shadow-2xl'}`}
              style={isMobileLike ? { width: viewportWidth ?? '100%' } : { width: viewportWidth ?? 1280 }}
            >
              <iframe
                ref={iframeRef}
                srcDoc={previewDoc}
                className="w-full border-0 block"
                style={{ height: isMobileLike ? Math.min(iframeHeight, 800) : iframeHeight }}
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          </div>

          {/* Box-select рамка (при drag) */}
          {boxRect && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: boxRect.x,
                top: boxRect.y,
                width: boxRect.w,
                height: boxRect.h,
                background: 'rgba(106,85,248,0.1)',
                border: '1.5px dashed #6A55F8',
              }}
            />
          )}

          {/* Мини-индикатор зума внизу по центру (рядом с quick-add) */}
          <div className="absolute bottom-6 right-[calc(50%+160px)] bg-white/90 rounded-full shadow border border-gray-200 px-3 py-1.5 text-[11px] text-gray-600 pointer-events-none">
            {Math.round(scale * 100)}%
          </div>
          <button
            onClick={() => { setScale(1); setPanX(0); setPanY(0) }}
            className="absolute bottom-6 left-[calc(50%+160px)] bg-white/90 rounded-full shadow border border-gray-200 px-3 py-1.5 text-[11px] text-gray-600 hover:bg-white"
            title="Сбросить зум и смещение"
          >
            ⟳ 100%
          </button>
        </div>

        {/* Left panel — оторванный прямоугольник с отступами */}
        {leftPanelOpen && (
          <div data-stud-panel className="absolute left-3 top-3 bottom-3 z-20">
            <LayersPanel
              blocks={blocks}
              layers={layers}
              activeBlockId={activeLayerBlock}
              selectedPath={selectedPath}
              tab={leftTab}
              onTabChange={setLeftTab}
              onPickBlock={(bid) => { setActiveLayerBlock(bid); setLeftTab('layers') }}
              onPickLayer={(path) => iframeRef.current?.contentWindow?.postMessage({ type: 'stud-select-path', path }, '*')}
              onClose={() => setLeftPanelOpen(false)}
            />
          </div>
        )}

        {/* Right panel — оторванный прямоугольник */}
        {rightPanelOpen && (
          <div data-stud-panel className="absolute right-3 top-3 bottom-3 z-20">
            <PropertiesPanel
              info={selectedInfo}
              selectionCount={selectionCount}
              onChangeLink={(href) => { setSelectedInfo(i => i ? { ...i, href } : i); sendElementUpdate({ type: 'stud-element-update-link', href }) }}
              onLayer={(direction) => sendElementUpdate({ type: 'stud-element-layer', direction })}
              onDelete={() => sendElementUpdate({ type: 'stud-element-delete' })}
              onGroup={() => sendElementUpdate({ type: 'stud-group-selection' })}
              onUngroup={() => sendElementUpdate({ type: 'stud-ungroup-selection' })}
              onClose={() => setRightPanelOpen(false)}
              onStyle={(prop, value) => {
                setSelectedInfo(i => i ? { ...i, [prop]: value } : i)
                sendElementUpdate({ type: 'stud-style-update', prop, value })
              }}
            />
          </div>
        )}

        {/* Collapsed left panel → iconка внизу слева */}
        {!leftPanelOpen && (
          <button onClick={() => setLeftPanelOpen(true)}
            className="absolute bottom-6 left-4 w-10 h-10 bg-white rounded-lg shadow-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50"
            title="Показать слои">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 1.5L1.5 5.5 9 9.5l7.5-4L9 1.5Z"/><path d="M1.5 9l7.5 4 7.5-4"/><path d="M1.5 12.5l7.5 4 7.5-4"/></svg>
          </button>
        )}
        {/* Collapsed right panel → иконка внизу справа */}
        {!rightPanelOpen && (
          <button onClick={() => setRightPanelOpen(true)}
            className="absolute bottom-6 right-4 w-28 h-10 bg-white rounded-lg shadow-lg border border-gray-200 flex items-center justify-center gap-1.5 hover:bg-gray-50 text-xs font-medium text-gray-600"
            title="Настройки">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7" cy="7" r="2"/><path d="M7 1v2M7 11v2M13 7h-2M3 7H1M11.24 2.76l-1.42 1.42M4.18 9.82l-1.42 1.42M11.24 11.24l-1.42-1.42M4.18 4.18 2.76 2.76"/></svg>
            Настройки
          </button>
        )}

        {/* Bottom quick-add toolbar (центр) */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white rounded-full shadow-lg border border-gray-200 flex items-center gap-0.5 p-1">
          <QuickAddBtn title="Курсор" active><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2l10 5-4 1-1 4L2 2Z"/></svg></QuickAddBtn>
          <button onClick={() => blocks[0] && iframeRef.current?.contentWindow?.postMessage({ type: 'stud-add-element', blockId: blocks[0].id, kind: 'text' }, '*')}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-700 font-bold" title="Текст">T</button>
          <button onClick={() => {
              const url = prompt('URL картинки:'); if (!url || !blocks[0]) return
              iframeRef.current?.contentWindow?.postMessage({ type: 'stud-add-element', blockId: blocks[0].id, kind: 'image', src: url }, '*')
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-700" title="Картинка">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="2" width="14" height="12" rx="1.5"/><circle cx="5" cy="6" r="1.5"/><path d="M1 11l4-4 4 4 3-3 3 3"/></svg>
          </button>
          <button onClick={() => blocks[0] && iframeRef.current?.contentWindow?.postMessage({ type: 'stud-add-element', blockId: blocks[0].id, kind: 'shape' }, '*')}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-700" title="Фигура">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="12" height="12" rx="1.5"/></svg>
          </button>
          <button onClick={() => blocks[0] && iframeRef.current?.contentWindow?.postMessage({ type: 'stud-add-element', blockId: blocks[0].id, kind: 'button' }, '*')}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-700" title="Кнопка">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="5" width="14" height="6" rx="3"/></svg>
          </button>
        </div>
      </div>

      {/* ── Floating text-format toolbar (sticky top) при edit-mode ── */}
      {textEditActive && <TextFormatToolbar onFormat={sendFormat} />}

      {/* ── Legacy «+ Элемент» popup (из block-toolbar) ── */}
      {addMenu && (
        <AddElementMenu
          x={addMenu.x}
          y={addMenu.y}
          onClose={() => setAddMenu(null)}
          onPick={(kind, extra) => {
            iframeRef.current?.contentWindow?.postMessage({ type: 'stud-add-element', blockId: addMenu.blockId, kind, ...extra }, '*')
            setAddMenu(null)
          }}
        />
      )}

      {/* ── HTML-редактор блока ── */}
      {activeHtmlBlock && (
        <HtmlBlockModal key={activeHtmlBlock.id} block={activeHtmlBlock}
          onClose={() => setEditingHtmlBlockId(null)}
          onSave={(newHtml) => { updateBlockLocal(activeHtmlBlock.id, { html_content: newHtml }); setEditingHtmlBlockId(null) }}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

function ViewportBtn({ label, active, onClick, children }: {
  label: string; active: boolean; onClick: () => void; children: ReactNode
}) {
  return (
    <button onClick={onClick} title={label}
      className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors ${active ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
      {children}
    </button>
  )
}

function QuickAddBtn({ title, active, children }: { title: string; active?: boolean; children: ReactNode }) {
  return (
    <button title={title}
      className={`w-10 h-10 rounded-full flex items-center justify-center ${active ? 'bg-orange-500 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
      {children}
    </button>
  )
}

type LayerNode = { path: string; tag: string; label: string; blockId: string; depth: number }

function LayersPanel({
  blocks, layers, activeBlockId, selectedPath, tab, onTabChange, onPickBlock, onPickLayer, onClose,
}: {
  blocks: LandingBlock[]
  layers: LayerNode[]
  activeBlockId: string | null
  selectedPath: string | null
  tab: 'blocks' | 'layers'
  onTabChange: (t: 'blocks' | 'layers') => void
  onPickBlock: (blockId: string) => void
  onPickLayer: (path: string) => void
  onClose: () => void
}) {
  const blockLayers = activeBlockId ? layers.filter(l => l.blockId === activeBlockId) : []
  const activeBlockIdx = activeBlockId ? blocks.findIndex(b => b.id === activeBlockId) : -1
  return (
    <aside className="w-60 h-full bg-white/70 rounded-xl border border-gray-200/70 shadow-lg flex flex-col overflow-hidden">
      <div className="h-11 flex items-center px-3 gap-3 flex-shrink-0 bg-white/90 border-b border-gray-200/70">
        <button onClick={() => onTabChange('layers')}
          className={`text-xs font-semibold uppercase tracking-wide ${tab === 'layers' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
          Слои
        </button>
        <button onClick={() => onTabChange('blocks')}
          className={`text-xs font-semibold uppercase tracking-wide ${tab === 'blocks' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
          Блоки
        </button>
        <button onClick={onClose} className="ml-auto w-7 h-7 rounded hover:bg-gray-100 text-gray-500 flex items-center justify-center" title="Закрыть">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {tab === 'blocks' ? (
          blocks.length === 0 ? (
            <p className="p-3 text-xs text-gray-400 text-center">Нет блоков</p>
          ) : (
            blocks.map((b, i) => {
              const active = b.id === activeBlockId
              return (
                <button key={b.id} onClick={() => onPickBlock(b.id)}
                  className={`w-full text-left px-3 py-2 rounded transition-colors flex items-center gap-2 ${active ? 'bg-[#F0EDFF] text-[#6A55F8]' : 'hover:bg-gray-50 text-gray-700'}`}>
                  <span className="text-[10px] font-mono opacity-70 w-5">{i + 1}</span>
                  <span className="text-sm truncate flex-1">{b.name || `Блок ${i + 1}`}</span>
                  <span className="text-[9px] opacity-50">›</span>
                </button>
              )
            })
          )
        ) : !activeBlockId ? (
          <p className="p-3 text-xs text-gray-400 text-center">
            Выбери блок во вкладке «Блоки» — появятся его слои.
            <br/>Или кликни на элемент в превью.
          </p>
        ) : (
          <>
            <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-2">
              <button onClick={() => onTabChange('blocks')} className="hover:text-[#6A55F8]" title="К списку блоков">‹ Блоки</button>
              <span>/</span>
              <span className="truncate">{blocks[activeBlockIdx]?.name || `Блок ${activeBlockIdx + 1}`}</span>
            </div>
            {blockLayers.length === 0 ? (
              <p className="p-3 text-xs text-gray-400 text-center">В этом блоке пока нет элементов</p>
            ) : (
              blockLayers.map(l => {
                const active = l.path === selectedPath
                return (
                  <button key={l.path} onClick={() => onPickLayer(l.path)}
                    className={`w-full text-left px-2 py-1.5 rounded transition-colors flex items-center gap-2 text-xs ${active ? 'bg-[#F0EDFF] text-[#6A55F8]' : 'hover:bg-gray-50 text-gray-700'}`}
                    style={{ paddingLeft: 8 + l.depth * 12 }}
                  >
                    <span className="text-gray-400 text-[10px] w-5 flex-shrink-0">{layerIconFor(l.tag)}</span>
                    <span className="truncate flex-1">{l.label}</span>
                  </button>
                )
              })
            )}
          </>
        )}
      </div>
    </aside>
  )
}

function layerIconFor(tag: string): string {
  if (/^H[1-6]$/.test(tag)) return 'H'
  if (tag === 'P' || tag === 'LI') return '¶'
  if (tag === 'IMG') return '🖼'
  if (tag === 'VIDEO' || tag === 'IFRAME') return '▶'
  if (tag === 'A' || tag === 'BUTTON') return '⬢'
  if (tag === 'HR') return '―'
  return '▭'
}

type SelectedInfo = {
  tagName: string
  blockId: string | null
  text: string
  href: string
  zIndex: string
  fontSize?: string
  color?: string
  background?: string
  width?: string
  height?: string
  padding?: string
  margin?: string
  borderRadius?: string
  opacity?: string
  isGroup?: boolean
}

function PropertiesPanel({
  info, selectionCount, onChangeLink, onLayer, onDelete, onClose, onStyle, onGroup, onUngroup,
}: {
  info: SelectedInfo | null
  selectionCount: number
  onChangeLink: (href: string) => void
  onLayer: (direction: 'front' | 'back' | 'top' | 'bottom') => void
  onDelete: () => void
  onClose: () => void
  onStyle: (prop: string, value: string) => void
  onGroup: () => void
  onUngroup: () => void
}) {
  const isGroup = Boolean(info?.isGroup)
  // Multi-selection (2+) — показываем только группировку и удалить
  if (selectionCount >= 2) {
    return (
      <aside className="w-72 h-full bg-white/70 rounded-xl border border-gray-200/70 shadow-lg flex flex-col overflow-hidden">
        <div className="h-11 flex items-center px-3 flex-shrink-0 bg-white/90 border-b border-gray-200/70">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-700">Выделено: {selectionCount}</span>
          <button onClick={onClose} className="ml-auto w-7 h-7 rounded hover:bg-gray-100 text-gray-500 flex items-center justify-center" title="Закрыть">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <button onClick={onGroup}
            className="w-full px-3 py-2 text-xs font-medium text-white bg-[#6A55F8] rounded-lg hover:bg-[#5845e0]">
            ◻ Сгруппировать ({selectionCount})
          </button>
          <p className="text-[10px] text-gray-400 text-center">или Cmd/Ctrl + G</p>
          <div className="pt-2 border-t border-gray-100">
            <button onClick={onDelete}
              className="w-full px-3 py-1.5 text-xs text-red-600 rounded-lg border border-red-200 hover:bg-red-50">
              🗑 Удалить все ({selectionCount})
            </button>
            <p className="text-[10px] text-gray-400 mt-1 text-center">или Delete</p>
          </div>
        </div>
      </aside>
    )
  }
  return (
    <aside className="w-72 h-full bg-white/70 rounded-xl border border-gray-200/70 shadow-lg flex flex-col overflow-hidden">
      <div className="h-11 flex items-center px-3 flex-shrink-0 bg-white/90 border-b border-gray-200/70">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-700">Выделенные элементы</span>
        <button onClick={onClose} className="ml-auto w-7 h-7 rounded hover:bg-gray-100 text-gray-500 flex items-center justify-center" title="Закрыть">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {!info ? (
          <p className="text-xs text-gray-400 text-center py-6">Выбери элемент в превью — настройки появятся здесь</p>
        ) : (
          <>
            <div className="text-[11px] text-gray-500">
              {info.tagName}{info.text ? ` — «${info.text}»` : ''}
            </div>

            {(info.tagName === 'A' || info.tagName === 'BUTTON') && (
              <Field label="Ссылка">
                <input type="text" value={info.href} onChange={e => onChangeLink(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-2.5 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:border-[#6A55F8]" />
              </Field>
            )}

            {/* Размер и положение */}
            <Section title="Размер">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Ширина">
                  <CssInput value={info.width || ''} placeholder="авто"
                    onChange={v => onStyle('width', v)} />
                </Field>
                <Field label="Высота">
                  <CssInput value={info.height || ''} placeholder="авто"
                    onChange={v => onStyle('height', v)} />
                </Field>
              </div>
            </Section>

            {/* Текст */}
            <Section title="Текст">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Размер">
                  <CssInput value={info.fontSize || ''} placeholder={info.fontSize || ''}
                    onChange={v => onStyle('fontSize', v)} />
                </Field>
                <Field label="Цвет">
                  <ColorInput value={info.color || '#000000'}
                    onChange={v => onStyle('color', v)} />
                </Field>
              </div>
            </Section>

            {/* Фон */}
            <Section title="Фон">
              <Field label="Цвет фона">
                <ColorInput value={info.background || '#ffffff'}
                  onChange={v => onStyle('background', v)} />
              </Field>
            </Section>

            {/* Отступы */}
            <Section title="Отступы">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Внутри (padding)">
                  <CssInput value={info.padding || ''} placeholder="0"
                    onChange={v => onStyle('padding', v)} />
                </Field>
                <Field label="Снаружи (margin)">
                  <CssInput value={info.margin || ''} placeholder="0"
                    onChange={v => onStyle('margin', v)} />
                </Field>
              </div>
            </Section>

            {/* Форма */}
            <Section title="Форма">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Скругление">
                  <CssInput value={info.borderRadius || ''} placeholder="0"
                    onChange={v => onStyle('borderRadius', v)} />
                </Field>
                <Field label="Прозрачность">
                  <input type="range" min={0} max={100}
                    value={Math.round(parseFloat(info.opacity || '1') * 100)}
                    onChange={e => onStyle('opacity', String(Number(e.target.value) / 100))}
                    className="w-full" />
                </Field>
              </div>
            </Section>

            <Section title="Слой">
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={() => onLayer('top')}    className="px-2 py-1.5 text-[11px] rounded border border-gray-200 hover:bg-gray-50">⇱ Поверх всех</button>
                <button onClick={() => onLayer('front')}  className="px-2 py-1.5 text-[11px] rounded border border-gray-200 hover:bg-gray-50">↑ Вперёд</button>
                <button onClick={() => onLayer('back')}   className="px-2 py-1.5 text-[11px] rounded border border-gray-200 hover:bg-gray-50">↓ Назад</button>
                <button onClick={() => onLayer('bottom')} className="px-2 py-1.5 text-[11px] rounded border border-gray-200 hover:bg-gray-50">⇲ За всеми</button>
              </div>
            </Section>

            {isGroup && (
              <div className="pt-3 border-t border-gray-100">
                <button onClick={onUngroup}
                  className="w-full px-3 py-1.5 text-xs text-[#6A55F8] rounded-lg border border-[#6A55F8]/30 hover:bg-[#F0EDFF]">
                  ⊞ Разгруппировать
                </button>
                <p className="text-[10px] text-gray-400 mt-1 text-center">или Cmd/Ctrl + Shift + G</p>
              </div>
            )}

            <div className="pt-3 border-t border-gray-100">
              <button onClick={onDelete}
                className="w-full px-3 py-1.5 text-xs text-red-600 rounded-lg border border-red-200 hover:bg-red-50">
                🗑 Удалить элемент
              </button>
              <p className="text-[10px] text-gray-400 mt-1 text-center">или клавиша Delete</p>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">{title}</div>
      {children}
    </div>
  )
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}
function CssInput({ value, placeholder, onChange }: { value: string; placeholder?: string; onChange: (v: string) => void }) {
  return (
    <input type="text" value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      onBlur={e => onChange(e.target.value)}
      className="w-full px-2 py-1.5 rounded border border-gray-200 text-xs font-mono focus:outline-none focus:border-[#6A55F8]" />
  )
}
function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <input type="color" value={cssColorToHex(value)} onChange={e => onChange(e.target.value)}
        className="w-8 h-7 rounded border border-gray-200 cursor-pointer bg-transparent" />
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        className="flex-1 px-2 py-1.5 rounded border border-gray-200 text-xs font-mono focus:outline-none focus:border-[#6A55F8]" />
    </div>
  )
}

function cssColorToHex(v: string): string {
  // Возвращаем hex если уже hex, иначе временно '#000000' (color-picker требует #rrggbb)
  if (/^#[0-9a-f]{6}$/i.test(v)) return v
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    const r = v[1], g = v[2], b = v[3]
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return '#000000'
}

// ────────────────────────────────────────────────────────────────────────────

function AddElementMenu({
  x, y, onClose, onPick,
}: {
  x: number
  y: number
  onClose: () => void
  onPick: (kind: string, extra?: Record<string, string>) => void
}) {
  const items: Array<{ kind: string; icon: string; label: string; handler?: () => void }> = [
    { kind: 'heading', icon: 'H', label: 'Заголовок' },
    { kind: 'text', icon: '¶', label: 'Текст' },
    { kind: 'button', icon: '⬢', label: 'Кнопка' },
    { kind: 'shape', icon: '▭', label: 'Фигура' },
    { kind: 'image', icon: '🖼', label: 'Картинка', handler: () => {
      const url = prompt('URL картинки:')
      if (!url) return
      onPick('image', { src: url })
    } },
    { kind: 'divider', icon: '―', label: 'Разделитель' },
  ]
  return (
    <>
      {/* Backdrop для закрытия по клику */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 bg-white rounded-xl border border-gray-200 shadow-lg p-2 grid grid-cols-3 gap-1"
        style={{
          left: Math.max(8, Math.min(x - 120, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 248)),
          top: Math.max(8, y),
          width: 240,
        }}
      >
        {items.map(it => (
          <button
            key={it.kind}
            onClick={() => { if (it.handler) it.handler(); else onPick(it.kind) }}
            className="flex flex-col items-center gap-1 p-3 rounded-lg hover:bg-[#F0EDFF] transition-colors"
          >
            <span className="text-xl">{it.icon}</span>
            <span className="text-[11px] text-gray-700">{it.label}</span>
          </button>
        ))}
      </div>
    </>
  )
}

function TextFormatToolbar({ onFormat }: { onFormat: (cmd: string, value?: string) => void }) {
  const SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 84, 96]
  // mousedown preventDefault — не теряем выделение в iframe при клике по кнопке
  const mdPrevent = (e: ReactMouseEvent) => e.preventDefault()
  return (
    <div className="sticky top-2 z-30 mx-auto w-fit flex items-center gap-1 bg-gray-900 text-white px-2 py-1.5 rounded-xl shadow-lg"
         onMouseDown={mdPrevent}>
      <button onMouseDown={mdPrevent} onClick={() => onFormat('bold')}
        className="w-8 h-8 rounded hover:bg-white/10 font-bold">B</button>
      <button onMouseDown={mdPrevent} onClick={() => onFormat('italic')}
        className="w-8 h-8 rounded hover:bg-white/10 italic">I</button>
      <button onMouseDown={mdPrevent} onClick={() => onFormat('underline')}
        className="w-8 h-8 rounded hover:bg-white/10 underline">U</button>
      <span className="w-px h-5 bg-white/20 mx-0.5" />
      <select
        onMouseDown={mdPrevent}
        onChange={(e) => { if (e.target.value) { onFormat('fontSize', e.target.value); e.target.value = '' } }}
        defaultValue=""
        className="bg-white/10 text-white text-xs rounded px-2 py-1 border-none focus:outline-none h-8"
      >
        <option value="" className="text-gray-900">Размер</option>
        {SIZES.map(s => <option key={s} value={s} className="text-gray-900">{s}px</option>)}
      </select>
      <input
        type="color"
        onMouseDown={mdPrevent}
        onChange={(e) => onFormat('foreColor', e.target.value)}
        className="w-8 h-7 rounded cursor-pointer bg-transparent border border-white/20"
        title="Цвет текста"
      />
      <span className="w-px h-5 bg-white/20 mx-0.5" />
      <button onMouseDown={mdPrevent} onClick={() => onFormat('justifyLeft')}
        className="w-8 h-8 rounded hover:bg-white/10" title="По левому">⬅</button>
      <button onMouseDown={mdPrevent} onClick={() => onFormat('justifyCenter')}
        className="w-8 h-8 rounded hover:bg-white/10" title="По центру">↔</button>
      <button onMouseDown={mdPrevent} onClick={() => onFormat('justifyRight')}
        className="w-8 h-8 rounded hover:bg-white/10" title="По правому">➡</button>
    </div>
  )
}

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
      <div className="bg-white rounded-xl max-w-5xl w-full h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">HTML-код блока</h3>
            <p className="text-xs text-gray-400 mt-0.5">Можно вставить любой HTML. Для видео используй шорткод <code className="bg-gray-100 px-1 rounded">{'{{video:UUID}}'}</code></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="flex-1 min-h-0 p-4">
          <textarea
            value={html}
            onChange={e => setHtml(e.target.value)}
            className="w-full h-full px-3 py-2 text-sm font-mono text-gray-800 border border-gray-200 rounded-lg focus:outline-none focus:border-[#6A55F8] resize-none leading-relaxed"
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
