'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { AiAssistantButton, AiAssistantOverlay } from '@/components/ui/AiAssistant'
import { SkeletonList } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { landingTemplates } from '@/lib/landing-templates'

type Landing = {
  id: string
  name: string
  slug: string
  status: 'draft' | 'published'
  html_content: string | null
  meta_title: string | null
  meta_description: string | null
  funnel_id: string | null
  funnel_stage_id: string | null
  custom_domain: string | null
  visits: number
  conversions: number
  project_id: string
  created_at: string
  is_mini_app?: boolean
}

type LandingButton = {
  id: string
  landing_id: string
  name: string
  clicks: number
  conversions: number
}

type LandingVisit = {
  id: string
  landing_id: string
  visitor_ip: string | null
  visitor_ua: string | null
  created_at: string
  customers?: { name: string; email: string | null } | null
}

type Funnel = {
  id: string
  name: string
}

type FunnelStage = {
  id: string
  name: string
  funnel_id: string
}

// ─── Status badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: 'draft' | 'published' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        status === 'published'
          ? 'bg-green-100 text-green-700'
          : 'bg-gray-100 text-gray-500'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status === 'published' ? 'bg-green-500' : 'bg-gray-400'
        }`}
      />
      {status === 'published' ? 'Опубликован' : 'Черновик'}
    </span>
  )
}

// ─── Conversion bar ─────────────────────────────────────────────────────────
function ConversionBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#6A55F8] rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
    </div>
  )
}

// ─── Stat card ───────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────
type Tab = 'editor' | 'analytics' | 'users' | 'settings'
function TabBar({
  active,
  onChange,
}: {
  active: Tab
  onChange: (t: Tab) => void
}) {
  const tabs: { key: Tab; label: string }[] = [
    { key: 'editor', label: 'Редактор' },
    { key: 'analytics', label: 'Аналитика' },
    { key: 'users', label: 'Пользователи' },
    { key: 'settings', label: 'Настройки' },
  ]
  return (
    <div className="flex gap-1 border-b border-gray-100 mb-6">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
            active === t.key
              ? 'border-[#6A55F8] text-[#6A55F8]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// DETAIL VIEW
// ═══════════════════════════════════════════════════════════════════════════
function LandingDetail({
  landing: initialLanding,
  onBack,
  projectId,
}: {
  landing: Landing
  onBack: (updated: Landing) => void
  projectId: string
}) {
  const supabase = createClient()
  const [landing, setLanding] = useState<Landing>(initialLanding)
  const [activeTab, setActiveTab] = useState<Tab>('editor')
  const [aiOpen, setAiOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Перечитать лендинг из БД и подтянуть в state (после того как агент что-то изменил)
  async function refreshLanding() {
    const { data } = await supabase.from('landings').select('*').eq('id', landing.id).maybeSingle()
    if (data) {
      setLanding(data as Landing)
      setHtml(data.html_content ?? '')
      setDirty(false)
    }
  }

  // Editor state
  // html — срез HTML который УЖЕ синхронизирован из iframe (обновляется при save / tab switch / mode switch).
  // Пока пользователь печатает в iframe, html НЕ меняется — это важно чтобы React не пересобирал iframe
  // (иначе при каждом клике/нажатии перезагружался бы srcDoc и терялось выделение).
  const [html, setHtml] = useState(landing.html_content ?? '')
  const [editorMode, setEditorMode] = useState<'visual' | 'code'>('visual')
  const [fullscreen, setFullscreen] = useState(false)
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const htmlTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [showVideoPicker, setShowVideoPicker] = useState(false)
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [replacingImgIdx, setReplacingImgIdx] = useState<number | null>(null)
  const [replacingVideoIdx, setReplacingVideoIdx] = useState<number | null>(null)
  const [projectVideos, setProjectVideos] = useState<Array<{ id: string; kinescope_id: string | null; embed_url: string | null; title: string | null }>>([])
  const [hasSelection, setHasSelection] = useState(false)
  // Отдельный флаг dirty — взводится любой правкой в iframe (stud-input), сбрасывается при сохранении
  const [dirty, setDirty] = useState(false)

  // Грузим видео проекта один раз — для replaceVideoShortcodesInPreview
  useEffect(() => {
    supabase.from('videos')
      .select('id, kinescope_id, embed_url, title')
      .eq('project_id', projectId)
      .then(({ data }) => setProjectVideos(data ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // Синхронизация живого iframe DOM → html state при уходе с вкладки «Редактор»
  // или переключении из визуального режима в код — чтобы в html попали свежие правки,
  // не слитые через syncFromIframe при печати.
  useEffect(() => {
    if (activeTab !== 'editor' && editorMode === 'visual') {
      syncFromIframe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // beforeunload: предупреждаем о потере несохранённых правок при закрытии/перезагрузке
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  // Слушаем сообщения от iframe-редактора (клик по img/video, selection, input)
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const src = iframeRef.current?.contentWindow
      if (!src || e.source !== src) return
      const data = e.data
      if (!data || typeof data !== 'object') return
      if (data.type === 'stud-img-click' && typeof data.idx === 'number') {
        setReplacingImgIdx(data.idx)
        setShowImagePicker(true)
      } else if (data.type === 'stud-video-click' && typeof data.idx === 'number') {
        setReplacingVideoIdx(data.idx)
        setShowVideoPicker(true)
      } else if (data.type === 'stud-selection') {
        setHasSelection(Boolean(data.has))
      } else if (data.type === 'stud-input') {
        // Не синхронизируем html-state — иначе iframe перемонтируется и слетит выделение.
        // Просто помечаем как изменённое. Реальный extract DOM → html будет при save/смене таба.
        setDirty(true)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  /**
   * Вставляет строку (shortcode/HTML) в текущий режим редактора:
   * - Visual: в позицию курсора iframe (если есть селекшн), иначе в конец body
   * - Code: в позицию курсора textarea
   * В обоих случаях обновляет html state.
   */
  function insertAtCursor(snippet: string, asHtml = false) {
    if (editorMode === 'visual') {
      const doc = iframeRef.current?.contentDocument
      if (!doc) return
      const sel = doc.getSelection()
      if (sel && sel.rangeCount > 0 && doc.body.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0)
        range.deleteContents()
        if (asHtml) {
          const tmp = doc.createElement('div')
          tmp.innerHTML = snippet
          const frag = doc.createDocumentFragment()
          while (tmp.firstChild) frag.appendChild(tmp.firstChild)
          range.insertNode(frag)
        } else {
          range.insertNode(doc.createTextNode(snippet))
        }
      } else {
        if (asHtml) doc.body.insertAdjacentHTML('beforeend', '\n' + snippet)
        else doc.body.insertAdjacentText('beforeend', '\n' + snippet)
      }
      syncFromIframe()
      return
    }
    // Code mode — вставка в textarea
    const textarea = htmlTextareaRef.current
    if (textarea) {
      const start = textarea.selectionStart ?? html.length
      const end = textarea.selectionEnd ?? html.length
      const next = html.slice(0, start) + snippet + html.slice(end)
      setHtml(next)
      setTimeout(() => {
        textarea.focus()
        textarea.selectionStart = textarea.selectionEnd = start + snippet.length
      }, 0)
    } else {
      setHtml(html + '\n' + snippet + '\n')
    }
  }

  // Sync visual edits from iframe into html state (called on save/tab switch)
  function syncFromIframe() {
    try {
      const doc = iframeRef.current?.contentDocument
      if (doc) {
        // Клон для сохранения — удаляем только наши инжекты, не трогая живой DOM
        const cloneRoot = doc.documentElement.cloneNode(true) as HTMLElement
        cloneRoot.querySelectorAll('[data-stud-editor-inject]').forEach(el => el.remove())
        cloneRoot.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'))
        cloneRoot.querySelectorAll('[data-stud-img-idx]').forEach(el => el.removeAttribute('data-stud-img-idx'))
        // Вернуть iframe-рендер видео обратно в шорткоды (чтобы в БД лежали {{video:UUID}}, а не iframe)
        cloneRoot.querySelectorAll('.stud-video-wrap[data-stud-video-shortcode]').forEach(el => {
          const sc = el.getAttribute('data-stud-video-shortcode')
          if (sc) {
            const text = doc.createTextNode(sc)
            el.parentNode?.replaceChild(text, el)
          }
        })
        const nextHtml = cloneRoot.outerHTML
        setHtml(nextHtml)
        return nextHtml
      }
    } catch { /* cross-origin */ }
    return html
  }

  /** Клиентская замена {{video:UUID}} → iframe для визуального preview (аналогично серверной в /s/[slug]/route.ts) */
  function replaceVideoShortcodesInPreview(source: string): string {
    if (!source) return source
    const map = new Map(projectVideos.map(v => [v.id, v]))
    return source.replace(/\{\{\s*video\s*:\s*([a-f0-9-]{36})\s*\}\}/gi, (match, uuid) => {
      const v = map.get(uuid)
      if (!v || !v.kinescope_id) return match  // нет видео — оставляем шорткод как есть
      const src = v.embed_url || `https://kinescope.io/embed/${v.kinescope_id}`
      const title = (v.title || '').replace(/"/g, '&quot;')
      // data-stud-video-shortcode позволит при сохранении вернуть текстовый шорткод обратно
      return `<div class="stud-video-wrap" data-stud-video-shortcode="${match.replace(/"/g, '&quot;')}" style="position:relative;width:100%;max-width:960px;margin:20px auto;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000;">
<iframe src="${src}" style="width:100%;height:100%;border:0;pointer-events:none" allow="autoplay; fullscreen; picture-in-picture; encrypted-media;" title="${title}"></iframe>
<div class="stud-video-overlay" data-stud-editor-inject="true" style="position:absolute;inset:0;cursor:pointer;display:flex;align-items:flex-start;justify-content:flex-end;padding:10px;background:linear-gradient(180deg,rgba(0,0,0,0.35) 0%,transparent 35%);">
<div style="background:rgba(106,85,248,0.95);color:#fff;font-size:12px;font-weight:600;padding:6px 12px;border-radius:8px;font-family:system-ui,sans-serif">✏ Заменить видео</div>
</div>
</div>`
    })
  }

  /**
   * Выполнить document.execCommand над текущим выделением в iframe.
   * ВАЖНО: НЕ вызываем setHtml после — React перемонтирует iframe и слетит выделение.
   * Просто помечаем dirty. Реальная синхронизация в state — только при сохранении / смене таба.
   */
  function applyInlineFormat(command: string, value?: string) {
    const doc = iframeRef.current?.contentDocument
    const win = iframeRef.current?.contentWindow
    if (!doc || !win) return
    try {
      win.focus()
      doc.execCommand(command, false, value)
      setDirty(true)
    } catch { /* ignore */ }
  }

  /** Изменить font-size выделения через обёртку в <span style="font-size:..."> */
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
      setDirty(true)
    } catch {
      doc.execCommand('fontSize', false, '7')
      doc.querySelectorAll('font[size="7"]').forEach(f => {
        const s = doc.createElement('span')
        s.style.fontSize = `${px}px`
        while (f.firstChild) s.appendChild(f.firstChild)
        f.parentNode?.replaceChild(s, f)
      })
      setDirty(true)
    }
  }

  // Analytics state
  const [buttons, setButtons] = useState<LandingButton[]>([])
  const [addingButton, setAddingButton] = useState(false)
  const [newButtonName, setNewButtonName] = useState('')
  const [savingButton, setSavingButton] = useState(false)

  // Users state
  const [visits, setVisits] = useState<LandingVisit[]>([])
  const [loadingVisits, setLoadingVisits] = useState(false)

  // Settings state
  const [settingName, setSettingName] = useState(landing.name)
  const [settingSlug, setSettingSlug] = useState(landing.slug)
  const [settingMetaTitle, setSettingMetaTitle] = useState(landing.meta_title ?? '')
  const [settingMetaDesc, setSettingMetaDesc] = useState(landing.meta_description ?? '')
  const [settingFunnelId, setSettingFunnelId] = useState(landing.funnel_id ?? '')
  const [settingFunnelStageId, setSettingFunnelStageId] = useState(landing.funnel_stage_id ?? '')
  const [settingCustomDomain, setSettingCustomDomain] = useState(landing.custom_domain ?? '')
  const [settingIsMiniApp, setSettingIsMiniApp] = useState(landing.is_mini_app ?? false)
  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([])
  const [copiedBtnId, setCopiedBtnId] = useState<string | null>(null)
  const [deletingLanding, setDeletingLanding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Load buttons when analytics tab opened
  useEffect(() => {
    if (activeTab === 'analytics') loadButtons()
    if (activeTab === 'users') loadVisits()
    if (activeTab === 'settings') loadFunnels()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  async function loadButtons() {
    const { data } = await supabase
      .from('landing_buttons')
      .select('*')
      .eq('landing_id', landing.id)
      .order('created_at')
    setButtons(data ?? [])
  }

  async function loadVisits() {
    setLoadingVisits(true)
    const { data } = await supabase
      .from('landing_visits')
      .select('*, customers(name, email)')
      .eq('landing_id', landing.id)
      .order('created_at', { ascending: false })
      .limit(100)
    setVisits((data ?? []) as LandingVisit[])
    setLoadingVisits(false)
  }

  async function loadFunnels() {
    const { data } = await supabase
      .from('funnels')
      .select('id, name')
      .eq('project_id', projectId)
    setFunnels(data ?? [])
    // Загружаем стадии если воронка уже выбрана
    if (landing.funnel_id) {
      const { data: stages } = await supabase
        .from('funnel_stages')
        .select('id, name, funnel_id')
        .eq('funnel_id', landing.funnel_id)
        .order('order_position', { ascending: true })
      setFunnelStages(stages ?? [])
    }
  }

  async function loadFunnelStages(funnelId: string) {
    if (!funnelId) { setFunnelStages([]); return }
    const { data } = await supabase
      .from('funnel_stages')
      .select('id, name, funnel_id')
      .eq('funnel_id', funnelId)
      .order('order_position', { ascending: true })
    setFunnelStages(data ?? [])
  }

  function copyButtonSnippet(btnId: string) {
    const snippet = `data-stud-btn="${btnId}"`
    navigator.clipboard.writeText(snippet).then(() => {
      setCopiedBtnId(btnId)
      setTimeout(() => setCopiedBtnId(null), 2000)
    })
  }

  async function handlePublish() {
    const currentHtml = editorMode === 'visual' ? (syncFromIframe() || html) : html
    setSaving(true)
    const newStatus = landing.status === 'published' ? 'draft' : 'published'
    const { data } = await supabase
      .from('landings')
      .update({ status: newStatus, html_content: currentHtml })
      .eq('id', landing.id)
      .select()
      .single()
    if (data) { setLanding(data as Landing); setHtml(currentHtml); setDirty(false) }
    setSaving(false)
  }

  async function handleSaveHtml() {
    const currentHtml = editorMode === 'visual' ? (syncFromIframe() || html) : html
    setSaving(true)
    const { data } = await supabase
      .from('landings')
      .update({ html_content: currentHtml })
      .eq('id', landing.id)
      .select()
      .single()
    if (data) { setLanding(data as Landing); setHtml(currentHtml); setDirty(false) }
    setSaving(false)
  }

  async function handleAddButton() {
    if (!newButtonName.trim()) return
    setSavingButton(true)
    const { data } = await supabase
      .from('landing_buttons')
      .insert({ landing_id: landing.id, name: newButtonName.trim(), clicks: 0, conversions: 0 })
      .select()
      .single()
    if (data) setButtons((prev) => [...prev, data as LandingButton])
    setNewButtonName('')
    setAddingButton(false)
    setSavingButton(false)
  }

  async function handleSaveSettings() {
    setSaving(true)
    const { data } = await supabase
      .from('landings')
      .update({
        name: settingName,
        slug: settingSlug,
        meta_title: settingMetaTitle || null,
        meta_description: settingMetaDesc || null,
        funnel_id: settingFunnelId || null,
        funnel_stage_id: settingFunnelStageId || null,
        custom_domain: settingCustomDomain.trim() || null,
        is_mini_app: settingIsMiniApp,
      })
      .eq('id', landing.id)
      .select()
      .single()
    if (data) setLanding(data as Landing)
    setSaving(false)
  }

  async function handleDeleteLanding() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeletingLanding(true)
    await supabase.from('landings').delete().eq('id', landing.id)
    onBack({ ...landing, id: '__deleted__' })
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => onBack(landing)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Назад
        </button>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">{landing.name}</h1>
        <StatusBadge status={landing.status} />
        <div className="ml-auto flex items-center gap-2">
          <a
            href="https://claude.ai/design"
            target="_blank"
            rel="noopener noreferrer"
            title="Сделай дизайн в Claude Design → экспортируй HTML → вставь во вкладку «HTML код»"
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Claude Design
          </a>
          <AiAssistantButton isOpen={aiOpen} onClick={() => setAiOpen(!aiOpen)} />
        </div>
      </div>

      <TabBar active={activeTab} onChange={setActiveTab} />

      {/* ── Tab: Редактор ───────────────────────────────────────────── */}
      {activeTab === 'editor' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                <button onClick={() => setEditorMode('visual')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${editorMode === 'visual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                  Визуальный
                </button>
                <button onClick={() => { if (editorMode === 'visual') syncFromIframe(); setEditorMode('code') }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${editorMode === 'code' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                  HTML код
                </button>
              </div>
              {editorMode === 'visual' && (
                <>
                  <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                    <button onClick={() => setViewport('desktop')}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${viewport === 'desktop' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                      🖥 Desktop
                    </button>
                    <button onClick={() => setViewport('mobile')}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${viewport === 'mobile' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                      📱 Mobile
                    </button>
                  </div>
                  <button onClick={() => setShowVideoPicker(true)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                    🎬 Видео
                  </button>
                  <button onClick={() => setShowImagePicker(true)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                    🖼 Картинка
                  </button>
                  <button onClick={() => setFullscreen(!fullscreen)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${fullscreen ? 'bg-[#6A55F8] text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {fullscreen ? '✕ Свернуть' : '⛶ На весь экран'}
                  </button>
                </>
              )}
            </div>
            <div className="flex gap-2 items-center">
              <button onClick={handleSaveHtml} disabled={saving || !dirty}
                className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors disabled:opacity-60 ${
                  dirty
                    ? 'bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100'
                    : 'border border-gray-200 text-gray-500'
                }`}>
                {saving ? 'Сохранение...' : dirty ? '● Сохранить' : '✓ Сохранено'}
              </button>
              <button onClick={handlePublish} disabled={saving}
                className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors disabled:opacity-50 ${
                  landing.status === 'published' ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-[#6A55F8] text-white hover:bg-[#5040D6]'
                }`}>
                {landing.status === 'published' ? 'Снять с публикации' : 'Опубликовать'}
              </button>
              {landing.status === 'published' && (
                <a href={`/s/${landing.slug}`} target="_blank" rel="noopener noreferrer"
                  className="px-4 py-2 text-sm rounded-lg font-medium border border-[#6A55F8]/30 text-[#6A55F8] hover:bg-[#F0EDFF] flex items-center gap-1.5">
                  Открыть сайт ↗
                </a>
              )}
            </div>
          </div>

          {/* Visual editor — editable iframe */}
          {editorMode === 'visual' && (
            <div className={fullscreen ? 'fixed inset-0 z-50 bg-gray-100 flex flex-col' : ''}>
              {fullscreen && (
                <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                      <button onClick={() => setViewport('desktop')}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium ${viewport === 'desktop' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>🖥 Desktop</button>
                      <button onClick={() => setViewport('mobile')}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium ${viewport === 'mobile' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>📱 Mobile</button>
                    </div>
                    <button onClick={() => setShowVideoPicker(true)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">🎬 Видео</button>
                    <button onClick={() => setShowImagePicker(true)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">🖼 Картинка</button>
                    <span className="text-xs text-gray-400">studency.app/{landing.slug}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { syncFromIframe(); handleSaveHtml() }} className="px-3 py-1.5 text-xs bg-[#6A55F8] text-white rounded-lg font-medium">Сохранить</button>
                    <button onClick={() => setFullscreen(false)} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600">✕ Закрыть</button>
                  </div>
                </div>
              )}
              <div className={`${fullscreen ? 'flex-1 flex items-start justify-center p-4 overflow-auto' : viewport === 'mobile' ? 'flex justify-center py-4' : ''}`}>
                <div className={`bg-white ${fullscreen ? 'shadow-2xl' : viewport === 'mobile' ? 'shadow-xl rounded-[2rem] border-[8px] border-gray-800' : 'rounded-xl border border-gray-100'} overflow-hidden transition-all ${
                  viewport === 'mobile'
                    ? fullscreen ? 'w-[375px] h-[812px]' : 'w-[375px] h-[700px]'
                    : fullscreen ? 'w-full max-w-[1280px] h-[calc(100vh-80px)]' : 'w-full'
                }`}>
                  {!fullscreen && (
                    <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 bg-gray-50">
                      <div className="flex gap-1">
                        <span className="w-3 h-3 rounded-full bg-red-400" />
                        <span className="w-3 h-3 rounded-full bg-yellow-400" />
                        <span className="w-3 h-3 rounded-full bg-green-400" />
                      </div>
                      <span className="text-xs text-gray-400 flex-1 text-center">studency.app/{landing.slug}</span>
                    </div>
                  )}
                  {/* Inline-format toolbar — активен когда есть selection */}
                  <InlineFormatToolbar
                    active={hasSelection}
                    onBold={() => applyInlineFormat('bold')}
                    onItalic={() => applyInlineFormat('italic')}
                    onUnderline={() => applyInlineFormat('underline')}
                    onAlign={(dir) => applyInlineFormat('justify' + dir)}
                    onColor={(c) => applyInlineFormat('foreColor', c)}
                    onFontSize={(px) => applyFontSize(px)}
                  />
                  <iframe
                    ref={iframeRef}
                    srcDoc={`${replaceVideoShortcodesInPreview(html) || '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9CA3AF;font-family:sans-serif;font-size:14px">Создайте контент в HTML коде</div>'}
                      <style data-stud-editor-inject="true">
                        [contenteditable="true"]:hover { outline: 2px dashed #6A55F8; outline-offset: 2px; cursor: text; }
                        [contenteditable="true"]:focus { outline: 2px solid #6A55F8; outline-offset: 2px; }
                        a[contenteditable="true"]:hover { outline-color: #F59E0B; }
                        img[data-stud-img-idx]:hover { outline: 3px solid #6A55F8; outline-offset: 2px; cursor: pointer; }
                        .stud-video-wrap:hover .stud-video-overlay { background: linear-gradient(180deg,rgba(0,0,0,0.55) 0%,rgba(0,0,0,0.2) 50%,transparent 100%) !important; }
                      </style>
                      <script data-stud-editor-inject="true">
                        (function(){
                          var BLOCK_SEL = 'h1, h2, h3, h4, h5, h6, p, li, td, th, label, blockquote, figcaption, dt, dd';
                          document.querySelectorAll(BLOCK_SEL).forEach(function(el) {
                            if (el.textContent.trim()) el.setAttribute('contenteditable', 'true');
                          });
                          var INLINE_SEL = 'a, button, span, b, i, em, strong';
                          document.querySelectorAll(INLINE_SEL).forEach(function(el) {
                            if (!el.textContent.trim()) return;
                            if (el.closest('[contenteditable="true"]')) return;
                            el.setAttribute('contenteditable', 'true');
                          });
                          document.querySelectorAll('div').forEach(function(el) {
                            if (el.children.length > 0) return;
                            if (!el.textContent.trim()) return;
                            if (el.closest('[contenteditable="true"]')) return;
                            el.setAttribute('contenteditable', 'true');
                          });
                          // Пометить все img уникальными индексами + клик на img → сообщить parent'у
                          var imgs = document.querySelectorAll('img');
                          imgs.forEach(function(img, idx) {
                            img.setAttribute('data-stud-img-idx', String(idx));
                            img.addEventListener('click', function(e) {
                              e.preventDefault();
                              e.stopPropagation();
                              parent.postMessage({ type: 'stud-img-click', idx: idx }, '*');
                            });
                          });
                          // Клик по видео-оверлею → сообщить parent'у
                          var overlays = document.querySelectorAll('.stud-video-overlay');
                          overlays.forEach(function(ov, idx) {
                            ov.addEventListener('click', function(e) {
                              e.preventDefault();
                              e.stopPropagation();
                              parent.postMessage({ type: 'stud-video-click', idx: idx }, '*');
                            });
                          });
                          // Selection в iframe → сообщить parent'у чтобы обновить toolbar
                          document.addEventListener('selectionchange', function() {
                            var sel = document.getSelection();
                            var has = !!(sel && sel.rangeCount > 0 && !sel.isCollapsed);
                            parent.postMessage({ type: 'stud-selection', has: has }, '*');
                          });
                          // Любая правка в editable → dirty
                          document.addEventListener('input', function() {
                            parent.postMessage({ type: 'stud-input' }, '*');
                          });
                        })();
                      </script>`}
                    className={`w-full border-0 ${fullscreen ? 'h-full' : 'h-[85vh]'}`}
                    sandbox="allow-scripts allow-same-origin"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Code editor */}
          {editorMode === 'code' && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">HTML</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowVideoPicker(true)}
                    className="text-xs text-[#6A55F8] font-medium hover:underline flex items-center gap-1"
                  >
                    🎬 Вставить видео
                  </button>
                  <span className="text-xs text-gray-400">index.html</span>
                </div>
              </div>
              <textarea
                ref={htmlTextareaRef}
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                className="w-full h-[600px] p-4 text-sm font-mono text-gray-800 resize-none focus:outline-none leading-relaxed"
                placeholder="<!DOCTYPE html>..."
                spellCheck={false}
              />
            </div>
          )}

        </div>
      )}

      {/* ── Tab: Аналитика ─────────────────────────────────────────── */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Посещения" value={landing.visits} />
            <StatCard label="Конверсии" value={landing.conversions} />
            <StatCard
              label="Конверсия %"
              value={
                landing.visits > 0
                  ? `${Math.round((landing.conversions / landing.visits) * 100)}%`
                  : '—'
              }
            />
            <StatCard label="Отказы" value="34%" sub="приблизительно" />
          </div>

          {/* Buttons */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Кнопки отслеживания</h3>
              <button
                onClick={() => setAddingButton(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#6A55F8] border border-[#6A55F8] rounded-lg hover:bg-[#F0EDFF] transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Добавить кнопку
              </button>
            </div>

            {addingButton && (
              <div className="px-5 py-3 border-b border-gray-100 bg-[#F8F7FF] flex gap-3 items-center">
                <input
                  type="text"
                  value={newButtonName}
                  onChange={(e) => setNewButtonName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddButton()}
                  placeholder="Название кнопки (напр. CTA главная)"
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:border-[#6A55F8]"
                  autoFocus
                />
                <button
                  onClick={handleAddButton}
                  disabled={savingButton || !newButtonName.trim()}
                  className="px-4 py-2 text-sm bg-[#6A55F8] text-white rounded-lg hover:bg-[#5040D6] disabled:opacity-50 transition-colors"
                >
                  {savingButton ? 'Добавление...' : 'Добавить'}
                </button>
                <button
                  onClick={() => { setAddingButton(false); setNewButtonName('') }}
                  className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Отмена
                </button>
              </div>
            )}

            {buttons.length === 0 ? (
              <div className="py-12 text-center">
                <div className="text-3xl mb-2">🖱️</div>
                <p className="text-sm text-gray-400">Нет отслеживаемых кнопок</p>
                <p className="text-xs text-gray-300 mt-1">
                  Добавьте кнопки, чтобы видеть статистику кликов
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {buttons.map((btn) => (
                  <div key={btn.id} className="px-5 py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{btn.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded font-mono truncate max-w-[220px]">
                          data-stud-btn=&quot;{btn.id}&quot;
                        </code>
                        <button
                          onClick={() => copyButtonSnippet(btn.id)}
                          className="text-xs text-[#6A55F8] hover:text-[#5040D6] flex-shrink-0 transition-colors"
                          title="Скопировать атрибут"
                        >
                          {copiedBtnId === btn.id ? '✓ Скопировано' : 'Копировать'}
                        </button>
                      </div>
                    </div>
                    <div className="w-40">
                      <ConversionBar value={btn.conversions} max={btn.clicks} />
                    </div>
                    <div className="text-right w-20">
                      <span className="text-lg font-bold text-gray-900">{btn.clicks}</span>
                      <p className="text-xs text-gray-400">кликов</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Пользователи ──────────────────────────────────────── */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Посетители</h3>
          </div>

          {loadingVisits ? (
            <SkeletonList count={3} />
          ) : visits.length === 0 ? (
            <div className="py-14 text-center">
              <div className="text-4xl mb-3">👤</div>
              <p className="text-sm text-gray-500 font-medium">Посетителей пока нет</p>
              <p className="text-xs text-gray-400 mt-1">
                Здесь появятся данные о посетителях лендинга
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Посетитель</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">IP</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Браузер</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Дата</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visits.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      {v.customers ? (
                        <div>
                          <p className="font-medium text-gray-800">{v.customers.name}</p>
                          {v.customers.email && (
                            <p className="text-xs text-gray-400">{v.customers.email}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Анонимный</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-500 font-mono text-xs">
                      {v.visitor_ip ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs max-w-[200px] truncate">
                      {v.visitor_ua ? v.visitor_ua.split(' ')[0] : '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {new Date(v.created_at).toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Tab: Настройки ─────────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <div className="max-w-2xl space-y-5">
          {/* Basic info */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <h3 className="font-semibold text-gray-900">Основное</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Название</label>
              <input
                type="text"
                value={settingName}
                onChange={(e) => setSettingName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Slug</label>
              <div className="flex items-center gap-0">
                <span className="px-3 py-2.5 bg-gray-50 border border-r-0 border-gray-200 rounded-l-lg text-sm text-gray-500">
                  studency.app/
                </span>
                <input
                  type="text"
                  value={settingSlug}
                  onChange={(e) => setSettingSlug(e.target.value)}
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-r-lg text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10"
                />
              </div>
            </div>
          </div>

          {/* SEO */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <h3 className="font-semibold text-gray-900">SEO</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Meta Title</label>
              <input
                type="text"
                value={settingMetaTitle}
                onChange={(e) => setSettingMetaTitle(e.target.value)}
                placeholder="Заголовок страницы для поисковиков"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Meta Description</label>
              <textarea
                value={settingMetaDesc}
                onChange={(e) => setSettingMetaDesc(e.target.value)}
                placeholder="Описание страницы для поисковиков (до 160 символов)"
                rows={3}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm resize-none focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10"
              />
            </div>
          </div>

          {/* Telegram Mini App */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Telegram Mini App</h3>
                <p className="text-xs text-gray-400 mt-0.5">Открывать лендинг прямо внутри Telegram — 100% точный трекинг без cookie</p>
              </div>
              <span className="text-xs bg-[#F0EDFF] text-[#6A55F8] border border-[#6A55F8]/20 px-2 py-0.5 rounded-full font-medium">Identity-bridge</span>
            </div>
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:border-[#6A55F8]/30 transition-colors">
              <input type="checkbox" checked={settingIsMiniApp} onChange={e => setSettingIsMiniApp(e.target.checked)} className="mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">Открывать как Telegram Mini App</div>
                <div className="text-xs text-gray-500 mt-0.5">Когда человек переходит на этот лендинг из бота или канала внутри Telegram, он откроется как встроенное приложение. Мы автоматически узнаём его telegram_id и привязываем визит к его карточке — идеальная связка браузер ↔ Telegram.</div>
              </div>
            </label>
            {settingIsMiniApp && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-700">Как подключить кнопкой в боте (рекомендуется):</p>
                <ol className="text-xs text-gray-500 space-y-1.5 list-decimal list-inside">
                  <li>В чат-боте или сценарии добавь кнопку типа <b>url</b></li>
                  <li>Ссылку ставь с префиксом <code className="bg-white px-1.5 py-0.5 rounded border border-gray-200 font-mono">https://t.me/your_bot/app?startapp=</code> или обычную <code className="bg-white px-1.5 py-0.5 rounded border border-gray-200 font-mono">https://studency.ru/s/{landing.slug}</code></li>
                  <li>Telegram откроет страницу как Mini App — SDK сам передаст нам telegram_id клиента</li>
                </ol>
                <p className="text-[11px] text-gray-400 mt-1">Если лендинг открывают из обычного браузера — сайт работает как раньше, Mini App режим молчит.</p>
              </div>
            )}
          </div>

          {/* Custom domain */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Кастомный домен</h3>
                <p className="text-xs text-gray-400 mt-0.5">Подключите свой домен вместо studency.vercel.app</p>
              </div>
              <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full font-medium">DNS настройка</span>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Домен</label>
              <input
                type="text"
                value={settingCustomDomain}
                onChange={(e) => setSettingCustomDomain(e.target.value)}
                placeholder="example.com"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10"
              />
            </div>
            {settingCustomDomain && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-700">Инструкция по настройке DNS:</p>
                <ol className="text-xs text-gray-500 space-y-1.5 list-decimal list-inside">
                  <li>Зайдите в панель управления вашим доменом</li>
                  <li>Создайте CNAME запись: <code className="bg-white px-1.5 py-0.5 rounded border border-gray-200 font-mono">{settingCustomDomain}</code> → <code className="bg-white px-1.5 py-0.5 rounded border border-gray-200 font-mono">cname.vercel-dns.com</code></li>
                  <li>Добавьте домен в Vercel Dashboard → Settings → Domains</li>
                  <li>Сохраните настройки — домен заработает через 5–30 минут</li>
                </ol>
              </div>
            )}
          </div>

          {/* Funnel */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <h3 className="font-semibold text-gray-900">Связь с воронкой</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Воронка</label>
              <select
                value={settingFunnelId}
                onChange={(e) => {
                  setSettingFunnelId(e.target.value)
                  setSettingFunnelStageId('')
                  loadFunnelStages(e.target.value)
                }}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10"
              >
                <option value="">Не выбрана</option>
                {funnels.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            {settingFunnelId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Стадия при заявке
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">куда попадёт лид из формы</span>
                </label>
                <select
                  value={settingFunnelStageId}
                  onChange={(e) => setSettingFunnelStageId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10"
                >
                  <option value="">Первая стадия (авто)</option>
                  {funnelStages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Tracking toggles (placeholders) */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <h3 className="font-semibold text-gray-900">Трекинг</h3>
            {[
              { label: 'Google Analytics', sub: 'Подключите GA4' },
              { label: 'Facebook Pixel', sub: 'Конверсионные события' },
              { label: 'Яндекс.Метрика', sub: 'Вебвизор и цели' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">{item.label}</p>
                  <p className="text-xs text-gray-400">{item.sub}</p>
                </div>
                <div className="w-10 h-5.5 bg-gray-200 rounded-full relative cursor-not-allowed opacity-50" title="В разработке">
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow" />
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="px-6 py-2.5 bg-[#6A55F8] text-white text-sm font-medium rounded-lg hover:bg-[#5040D6] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Сохранение...' : 'Сохранить настройки'}
            </button>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600 font-medium">Точно удалить?</span>
                <button
                  onClick={handleDeleteLanding}
                  disabled={deletingLanding}
                  className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {deletingLanding ? 'Удаляю...' : 'Да, удалить'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 rounded-lg transition-colors"
                >
                  Отмена
                </button>
              </div>
            ) : (
              <button
                onClick={handleDeleteLanding}
                disabled={deletingLanding}
                className="px-4 py-2.5 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              >
                Удалить лендинг
              </button>
            )}
          </div>
        </div>
      )}

      <AiAssistantOverlay
        isOpen={aiOpen}
        onClose={() => setAiOpen(false)}
        title={`AI-редактор · ${landing.name}`}
        placeholder="Что добавить или изменить на лендинге..."
        persistKey={`landing-${landing.id}`}
        agent={{
          endpoint: '/api/ai/agent/landing',
          payload: { landingId: landing.id, projectId: landing.project_id },
          onChangesApplied: () => { void refreshLanding() },
        }}
        initialMessages={[{ kind: 'ai' as const, text: `Привет! Я AI-редактор лендинга «${landing.name}». Могу **сам применять изменения** в код страницы: добавить блок, переписать заголовок, сменить CTA, обновить мета-теги, связать с воронкой.\n\nНичего не применяю без твоего явного «да» — сначала обсудим, потом сделаю.\n\nЧто нужно?` }]}
      />

      {showVideoPicker && (
        <VideoPickerModal
          projectId={landing.project_id}
          onClose={() => { setShowVideoPicker(false); setReplacingVideoIdx(null) }}
          onPick={(videoId) => {
            if (replacingVideoIdx !== null) {
              // Заменяем существующий stud-video-wrap: меняем data-stud-video-shortcode на новый
              const doc = iframeRef.current?.contentDocument
              if (doc) {
                const wraps = doc.querySelectorAll('.stud-video-wrap')
                const wrap = wraps[replacingVideoIdx]
                if (wrap) {
                  wrap.setAttribute('data-stud-video-shortcode', `{{video:${videoId}}}`)
                  const v = projectVideos.find(x => x.id === videoId)
                  if (v && v.kinescope_id) {
                    const src = v.embed_url || `https://kinescope.io/embed/${v.kinescope_id}`
                    const iframe = wrap.querySelector('iframe')
                    if (iframe) iframe.setAttribute('src', src)
                  }
                  syncFromIframe()
                }
              }
            } else {
              insertAtCursor(`{{video:${videoId}}}`, false)
            }
            setShowVideoPicker(false)
            setReplacingVideoIdx(null)
          }}
        />
      )}

      {showImagePicker && (
        <ImagePickerModal
          mode={replacingImgIdx !== null ? 'replace' : 'insert'}
          onClose={() => { setShowImagePicker(false); setReplacingImgIdx(null) }}
          onPick={(imgUrl, alt) => {
            if (replacingImgIdx !== null) {
              // Заменяем src существующей картинки
              const doc = iframeRef.current?.contentDocument
              if (doc) {
                const img = doc.querySelector(`img[data-stud-img-idx="${replacingImgIdx}"]`) as HTMLImageElement | null
                if (img) {
                  img.src = imgUrl
                  if (alt) img.alt = alt
                  syncFromIframe()
                }
              }
            } else {
              const safeAlt = (alt || '').replace(/"/g, '&quot;')
              const snippet = `<img src="${imgUrl}" alt="${safeAlt}" style="max-width:100%;height:auto;display:block;margin:16px auto;border-radius:8px" />`
              insertAtCursor(snippet, true)
            }
            setShowImagePicker(false)
            setReplacingImgIdx(null)
          }}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// INLINE FORMAT TOOLBAR — плавающая панель форматирования для визуального редактора
// Активна когда в iframe есть выделение текста.
// ═══════════════════════════════════════════════════════════════════════════
function InlineFormatToolbar({
  active,
  onBold,
  onItalic,
  onUnderline,
  onAlign,
  onColor,
  onFontSize,
}: {
  active: boolean
  onBold: () => void
  onItalic: () => void
  onUnderline: () => void
  onAlign: (dir: 'Left' | 'Center' | 'Right') => void
  onColor: (hex: string) => void
  onFontSize: (px: number) => void
}) {
  const SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 64, 72]
  const COLORS = ['#111827', '#FFFFFF', '#6A55F8', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#EC4899']
  return (
    <div className={`border-b border-gray-100 px-3 py-2 flex items-center gap-1 bg-white flex-wrap transition-opacity ${active ? 'opacity-100' : 'opacity-50'}`}>
      <div className="text-[11px] text-gray-400 mr-1">{active ? 'Форматирование:' : 'Выдели текст →'}</div>
      <button onMouseDown={e => { e.preventDefault(); onBold() }} disabled={!active}
        className="w-8 h-8 rounded text-sm font-bold hover:bg-gray-100 disabled:opacity-40">B</button>
      <button onMouseDown={e => { e.preventDefault(); onItalic() }} disabled={!active}
        className="w-8 h-8 rounded text-sm italic hover:bg-gray-100 disabled:opacity-40">I</button>
      <button onMouseDown={e => { e.preventDefault(); onUnderline() }} disabled={!active}
        className="w-8 h-8 rounded text-sm underline hover:bg-gray-100 disabled:opacity-40">U</button>
      <div className="w-px h-5 bg-gray-200 mx-1" />
      <select
        onMouseDown={e => e.preventDefault()}
        onChange={e => { if (e.target.value) { onFontSize(Number(e.target.value)); e.target.value = '' } }}
        disabled={!active}
        className="px-2 py-1 text-xs border border-gray-200 rounded disabled:opacity-40"
        defaultValue=""
      >
        <option value="">Размер</option>
        {SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
      </select>
      <div className="flex items-center gap-0.5 ml-1">
        {COLORS.map(c => (
          <button key={c} onMouseDown={e => { e.preventDefault(); onColor(c) }} disabled={!active}
            title={c}
            className="w-5 h-5 rounded border border-gray-300 disabled:opacity-40"
            style={{ background: c }} />
        ))}
      </div>
      <div className="w-px h-5 bg-gray-200 mx-1" />
      <button onMouseDown={e => { e.preventDefault(); onAlign('Left') }} disabled={!active}
        className="w-8 h-8 rounded text-xs hover:bg-gray-100 disabled:opacity-40" title="По левому краю">⬅</button>
      <button onMouseDown={e => { e.preventDefault(); onAlign('Center') }} disabled={!active}
        className="w-8 h-8 rounded text-xs hover:bg-gray-100 disabled:opacity-40" title="По центру">↔</button>
      <button onMouseDown={e => { e.preventDefault(); onAlign('Right') }} disabled={!active}
        className="w-8 h-8 rounded text-xs hover:bg-gray-100 disabled:opacity-40" title="По правому краю">➡</button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// VIDEO PICKER MODAL — выбор видео для вставки шорткода в HTML
// ═══════════════════════════════════════════════════════════════════════════
function VideoPickerModal({
  projectId,
  onClose,
  onPick,
}: {
  projectId: string
  onClose: () => void
  onPick: (videoId: string) => void
}) {
  const supabase = createClient()
  const [videos, setVideos] = useState<Array<{
    id: string
    title: string
    kinescope_status: string
    thumbnail_url: string | null
    duration_seconds: number | null
  }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('videos')
      .select('id, title, kinescope_status, thumbnail_url, duration_seconds')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setVideos((data ?? []) as typeof videos)
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Вставить видео</h3>
            <p className="text-xs text-gray-500 mt-0.5">Выбери видео — в HTML вставится шорткод <code className="bg-gray-100 px-1 rounded">{'{{video:ID}}'}</code>, он заменится на плеер</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-12 text-sm text-gray-400">Загрузка…</div>
          ) : videos.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-2">🎬</div>
              <p className="text-sm text-gray-500">В проекте пока нет видео</p>
              <p className="text-xs text-gray-400 mt-1">Загрузи видео во вкладке Видеохостинг</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {videos.map(v => {
                const isReady = v.kinescope_status === 'done' || v.kinescope_status === 'ready'
                return (
                  <button
                    key={v.id}
                    onClick={() => isReady && onPick(v.id)}
                    disabled={!isReady}
                    className={`bg-white rounded-lg border-2 overflow-hidden text-left transition-colors ${
                      isReady ? 'border-gray-200 hover:border-[#6A55F8] cursor-pointer' : 'border-gray-100 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <div className="aspect-video bg-gray-900 flex items-center justify-center relative">
                      {v.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.thumbnail_url} alt={v.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-3xl opacity-50">🎬</div>
                      )}
                      {!isReady && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <span className="text-white text-[10px] font-semibold bg-amber-500 px-2 py-0.5 rounded-full">Обработка</span>
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-medium text-gray-900 truncate">{v.title}</p>
                      {v.duration_seconds && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {Math.floor(v.duration_seconds / 60)}:{(v.duration_seconds % 60).toString().padStart(2, '0')}
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// IMAGE PICKER MODAL — вставить картинку по URL или загрузкой файла (base64)
// ═══════════════════════════════════════════════════════════════════════════
function ImagePickerModal({
  onClose,
  onPick,
  mode = 'insert',
}: {
  onClose: () => void
  onPick: (url: string, alt: string) => void
  mode?: 'insert' | 'replace'
}) {
  const [tab, setTab] = useState<'url' | 'upload'>('url')
  const [url, setUrl] = useState('')
  const [alt, setAlt] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handlePick() {
    const trimmed = url.trim()
    if (!trimmed) { setError('Вставь URL картинки'); return }
    onPick(trimmed, alt.trim())
  }

  async function handleFile(file: File) {
    setError(null)
    if (!file.type.startsWith('image/')) { setError('Файл должен быть картинкой'); return }
    if (file.size > 2 * 1024 * 1024) {
      setError('Картинка больше 2 МБ — лучше загрузи на хостинг и вставь по URL')
      return
    }
    setUploading(true)
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      setUploading(false)
      onPick(dataUrl, alt.trim() || file.name)
    }
    reader.onerror = () => { setUploading(false); setError('Не удалось прочитать файл') }
    reader.readAsDataURL(file)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-md w-full overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">{mode === 'replace' ? 'Заменить картинку' : 'Вставить картинку'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="px-4 pt-3 flex gap-1 border-b border-gray-100">
          <button onClick={() => setTab('url')}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'url' ? 'border-[#6A55F8] text-[#6A55F8]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            По URL
          </button>
          <button onClick={() => setTab('upload')}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'upload' ? 'border-[#6A55F8] text-[#6A55F8]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            Загрузить файл
          </button>
        </div>

        <div className="p-4 space-y-3">
          {tab === 'url' ? (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">URL картинки</label>
                <input type="url" value={url} onChange={e => setUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter' && url.trim()) handlePick() }}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Alt-текст (необязательно)</label>
                <input type="text" value={alt} onChange={e => setAlt(e.target.value)}
                  placeholder="Описание для SEO и доступности"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10" />
              </div>
            </>
          ) : (
            <>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => { if (e.target.files?.[0]) void handleFile(e.target.files[0]); e.target.value = '' }} />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                className="w-full py-8 rounded-lg border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-[#6A55F8] hover:text-[#6A55F8] transition-colors disabled:opacity-50">
                {uploading ? 'Загрузка...' : '📁 Выбрать картинку (до 2 МБ)'}
              </button>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Alt-текст (необязательно)</label>
                <input type="text" value={alt} onChange={e => setAlt(e.target.value)}
                  placeholder="Описание для SEO и доступности"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10" />
              </div>
              <p className="text-[11px] text-gray-400">Картинка встроится в HTML как base64. Для больших картинок лучше залить на внешний хостинг и вставить по URL.</p>
            </>
          )}

          {error && <div className="text-xs text-red-500">{error}</div>}
        </div>

        {tab === 'url' && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-end gap-2">
            <button onClick={onClose} className="px-3 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100">Отмена</button>
            <button onClick={handlePick} disabled={!url.trim()}
              className="px-4 py-2 text-sm font-semibold bg-[#6A55F8] text-white rounded-lg hover:bg-[#5845e0] disabled:opacity-50">
              Вставить
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// LIST VIEW
// ═══════════════════════════════════════════════════════════════════════════
function LandingsList({
  projectId,
  onSelect,
  onLandingsLoaded,
}: {
  projectId: string
  onSelect: (l: Landing) => void
  onLandingsLoaded?: (landings: Landing[]) => void
}) {
  const supabase = createClient()
  const [landings, setLandings] = useState<Landing[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)

  useEffect(() => {
    loadLandings()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadLandings() {
    const { data } = await supabase
      .from('landings')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    const loaded = (data ?? []) as Landing[]
    setLandings(loaded)
    onLandingsLoaded?.(loaded)
    setLoading(false)
  }

  function autoSlug(name: string) {
    return name
      .toLowerCase()
      .replace(/[а-яё]/g, (c) => {
        const map: Record<string, string> = {
          а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',
          и:'i',й:'j',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',
          с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',
          ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
        }
        return map[c] ?? c
      })
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  async function handleCreate() {
    if (!newName.trim()) return
    const slug = newSlug.trim() || autoSlug(newName)
    const template = selectedTemplate ? landingTemplates.find(t => t.id === selectedTemplate) : null
    const htmlContent = template?.html || null
    const tempLanding: Landing = {
      id: 'temp-' + Date.now(),
      name: newName.trim(),
      slug,
      status: 'draft',
      html_content: htmlContent,
      meta_title: null,
      meta_description: null,
      funnel_id: null,
      funnel_stage_id: null,
      custom_domain: null,
      visits: 0,
      conversions: 0,
      project_id: projectId,
      created_at: new Date().toISOString(),
    }
    setLandings((prev) => [tempLanding, ...prev])
    setNewName('')
    setNewSlug('')
    setSelectedTemplate(null)
    setCreating(false)
    setSaving(true)
    const { data } = await supabase
      .from('landings')
      .insert({
        project_id: projectId,
        name: tempLanding.name,
        slug,
        status: 'draft',
        html_content: htmlContent,
      })
      .select()
      .single()
    if (data) {
      setLandings((prev) => prev.map((l) => l.id === tempLanding.id ? data as Landing : l))
    }
    setSaving(false)
  }

  function handleUpdated(updated: Landing) {
    if (updated.id === '__deleted__') {
      setLandings((prev) => prev.filter((l) => l.id !== updated.id))
      loadLandings()
    } else {
      setLandings((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-gray-400">Загрузка сайтов...</div>
    )
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Сайты и лендинги</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Создавайте посадочные страницы и отслеживайте их эффективность
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#6A55F8] text-white text-sm font-medium rounded-xl hover:bg-[#5040D6] transition-colors shadow-sm shadow-[#6A55F8]/30"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Создать сайт
        </button>
      </div>

      {/* Create modal */}
      <Modal
        isOpen={creating}
        onClose={() => { setCreating(false); setNewName(''); setNewSlug(''); setSelectedTemplate(null) }}
        title="Новый лендинг"
        subtitle="Выбери шаблон и задай название — дальше сможешь редактировать"
        maxWidth="2xl"
        footer={
          <>
            <button
              onClick={() => { setCreating(false); setNewName(''); setNewSlug(''); setSelectedTemplate(null) }}
              className="px-3 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100"
            >
              Отмена
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || !newName.trim()}
              className="px-4 py-2 text-sm font-semibold bg-[#6A55F8] text-white rounded-lg hover:bg-[#5845e0] disabled:opacity-50"
            >
              {saving ? 'Создание...' : 'Создать лендинг'}
            </button>
          </>
        }
      >
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Шаблон (необязательно)</label>
            <div className="grid grid-cols-2 gap-3">
              {landingTemplates.map(t => (
                <button key={t.id} onClick={() => setSelectedTemplate(selectedTemplate === t.id ? null : t.id)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    selectedTemplate === t.id ? 'border-[#6A55F8] bg-[#F8F7FF]' : 'border-gray-100 hover:border-gray-200'
                  }`}>
                  <div className="text-2xl mb-2">{t.icon}</div>
                  <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
                </button>
              ))}
            </div>
            {!selectedTemplate && <p className="text-xs text-gray-400 mt-2">Или создайте пустой лендинг</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Название</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value)
                if (!newSlug) setNewSlug(autoSlug(e.target.value))
              }}
              placeholder="Лендинг для курса"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Slug (URL)</label>
            <div className="flex items-center">
              <span className="px-3 py-2.5 bg-gray-50 border border-r-0 border-gray-200 rounded-l-lg text-xs text-gray-500 whitespace-nowrap">
                studency.app/
              </span>
              <input
                type="text"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="moi-lending"
                className="flex-1 px-3 py-2.5 border border-gray-200 rounded-r-lg text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10"
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Empty state */}
      {landings.length === 0 && !creating && (
        <div className="bg-white rounded-xl border border-gray-100 py-20 text-center">
          <div className="text-5xl mb-4">🌐</div>
          <p className="text-lg font-semibold text-gray-700 mb-1">Сайтов пока нет</p>
          <p className="text-sm text-gray-400 mb-6">
            Создайте первый лендинг для привлечения студентов
          </p>
          <button
            onClick={() => setCreating(true)}
            className="px-6 py-2.5 bg-[#6A55F8] text-white text-sm font-medium rounded-xl hover:bg-[#5040D6] transition-colors"
          >
            Создать первый сайт
          </button>
        </div>
      )}

      {/* Cards grid */}
      {landings.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {landings.map((landing) => (
            <button
              key={landing.id}
              onClick={() => onSelect(landing)}
              className="bg-white rounded-xl border border-gray-100 p-5 text-left hover:border-[#6A55F8]/40 hover:shadow-md transition-all group"
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="w-10 h-10 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-[#6A55F8] text-xl flex-shrink-0">
                  🌐
                </div>
                <StatusBadge status={landing.status} />
              </div>

              {/* Name */}
              <p className="font-semibold text-gray-900 mb-0.5 group-hover:text-[#6A55F8] transition-colors">
                {landing.name}
              </p>
              <p className="text-xs text-gray-400 mb-4 font-mono truncate">
                studency.app/{landing.slug}
              </p>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-50">
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900">{landing.visits}</p>
                  <p className="text-xs text-gray-400">посещений</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900">{landing.conversions}</p>
                  <p className="text-xs text-gray-400">конверсий</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ROOT PAGE
// ═══════════════════════════════════════════════════════════════════════════
export default function SitesPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [landingsList, setLandingsList] = useState<Landing[]>([])

  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null)
  const urlLandingId = searchParams.get('open')
  const openLandingId = localSelectedId ?? urlLandingId
  const selectedLanding = openLandingId ? landingsList.find(l => l.id === openLandingId) ?? null : null

  function selectLanding(id: string) {
    setLocalSelectedId(id)
    const p = new URLSearchParams(searchParams.toString())
    p.set('open', id)
    router.replace(`?${p.toString()}`, { scroll: false })
  }
  function clearSelection() {
    setLocalSelectedId(null)
    const p = new URLSearchParams(searchParams.toString())
    p.delete('open')
    router.replace(`?${p.toString()}`, { scroll: false })
  }

  function handleBack(updated: Landing) {
    if (updated.id === '__deleted__') {
      clearSelection()
      setLandingsList((prev) => prev.filter((l) => l.id !== updated.id))
    } else {
      setLandingsList((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
      clearSelection()
    }
  }

  if (selectedLanding) {
    return (
      <div className="p-6">
        <LandingDetail
          landing={selectedLanding}
          onBack={handleBack}
          projectId={projectId}
        />
      </div>
    )
  }

  return (
    <div className="p-6">
      <LandingsList
        projectId={projectId}
        onSelect={(l) => selectLanding(l.id)}
        onLandingsLoaded={setLandingsList}
      />
    </div>
  )
}
