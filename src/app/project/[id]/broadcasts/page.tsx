'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import RichTextEditor from '@/components/RichTextEditor'
import { MediaUpload } from '@/components/MediaUpload'

type BroadcastButton = {
  text: string
  action_type: 'url' | 'trigger' | 'goto_message'
  url?: string
  action_trigger_word?: string
  action_goto_message_id?: string
  // legacy для обратной совместимости со старыми рассылками, где было { text, url }
}

type Broadcast = {
  id: string
  name: string
  status: string
  text: string | null
  media_id: string | null
  media_url: string | null
  media_type: string | null
  media_file_name?: string | null
  telegram_bot_id: string | null
  channel: string
  email_subject: string | null
  segment_type: string
  segment_value: string | null
  buttons: BroadcastButton[] | null
  total_recipients: number
  sent_count: number
  failed_count: number
  scheduled_at: string | null
  sent_at: string | null
  created_at: string
}

type Bot = { id: string; name: string }
type FunnelStage = { id: string; name: string; funnel_name: string }
type ScenarioBlock = {
  id: string
  text: string | null
  order_position: number
  scenario_id: string
  scenario_name: string
  bot_name: string
}

type SegmentType = 'all' | 'funnel_stage' | 'tag' | 'source' | 'scenario_message_in' | 'scenario_message_not_in'
type TabKey = 'calendar' | 'all' | 'draft' | 'scheduled' | 'sent'
type ScheduleMode = 'now' | 'later' | 'draft'

function toLocalDateTimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

export default function BroadcastsPage() {
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()

  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [bots, setBots] = useState<Bot[]>([])
  const [stages, setStages] = useState<FunnelStage[]>([])
  const [blocks, setBlocks] = useState<ScenarioBlock[]>([])
  const [loading, setLoading] = useState(true)
  // Редактор рассылки:
  // - 'new' — создание (POST)
  // - uuid — редактирование существующей (PATCH)
  // - null — закрыто
  const [editorId, setEditorId] = useState<string | null>(null)
  const editorOpen = editorId !== null
  const isEditing = editorOpen && editorId !== 'new'
  const [selectedBroadcast, setSelectedBroadcast] = useState<Broadcast | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('calendar')

  // Получатели рассылки (для detail-модалки)
  type Delivery = {
    id: string
    status: string
    error: string | null
    sent_at: string | null
    created_at: string
    customer_id: string | null
    customers: {
      full_name: string | null
      telegram_username: string | null
      telegram_id: string | null
      email: string | null
      bot_blocked_at?: string | null
      bot_blocked_source?: string | null
    } | null
  }
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [deliveriesLoading, setDeliveriesLoading] = useState(false)
  const [deliveriesFilter, setDeliveriesFilter] = useState<'all' | 'sent' | 'failed'>('all')

  // Form state
  const [name, setName] = useState('')
  const [botId, setBotId] = useState('')
  const [channel, setChannel] = useState<'telegram' | 'email' | 'both'>('telegram')
  const [emailSubject, setEmailSubject] = useState('')
  const [text, setText] = useState('')
  const [mediaId, setMediaId] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<string | null>(null)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [mediaFileName, setMediaFileName] = useState<string | null>(null)
  const [buttons, setButtons] = useState<BroadcastButton[]>([])
  const [segmentType, setSegmentType] = useState<SegmentType>('all')
  const [segmentValue, setSegmentValue] = useState('')
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('now')
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date()
    d.setMinutes(d.getMinutes() + 15)
    d.setSeconds(0, 0)
    return toLocalDateTimeInput(d)
  })
  const [saving, setSaving] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)

  // Preview count — под капотом сначала синхронизирует список подписчиков
  // бота через sendChatAction, потом пересчитывает. Юзер видит одну кнопку.
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewStage, setPreviewStage] = useState<'sync' | 'count' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [brRes, botsRes, stagesRes, blocksRes] = await Promise.all([
      fetch(`/api/broadcasts?project_id=${projectId}`).then(r => r.json()),
      supabase.from('telegram_bots').select('id, name').eq('project_id', projectId),
      supabase.from('funnel_stages').select('id, name, funnels!inner(name, project_id)')
        .eq('funnels.project_id', projectId),
      supabase.from('scenario_messages')
        .select('id, text, order_position, scenario_id, chatbot_scenarios!inner(name, project_id, telegram_bots(name))')
        .eq('chatbot_scenarios.project_id', projectId)
        .order('order_position', { ascending: true }),
    ])
    setBroadcasts(brRes.broadcasts ?? [])
    setBots((botsRes.data ?? []) as Bot[])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setStages(((stagesRes.data ?? []) as any[]).map(s => ({
      id: s.id, name: s.name, funnel_name: s.funnels.name,
    })))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setBlocks(((blocksRes.data ?? []) as any[]).map(b => ({
      id: b.id,
      text: b.text,
      order_position: b.order_position,
      scenario_id: b.scenario_id,
      scenario_name: b.chatbot_scenarios?.name ?? 'Сценарий',
      bot_name: b.chatbot_scenarios?.telegram_bots?.name ?? 'Бот',
    })))
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => { load() }, [load])

  // При открытии detail-модалки — подгружаем получателей
  useEffect(() => {
    if (!selectedBroadcast) { setDeliveries([]); return }
    setDeliveriesLoading(true)
    setDeliveriesFilter('all')
    fetch(`/api/broadcasts/${selectedBroadcast.id}/deliveries`)
      .then(r => r.json())
      .then(json => {
        setDeliveries(json.deliveries ?? [])
        setDeliveriesLoading(false)
      })
      .catch(() => setDeliveriesLoading(false))
  }, [selectedBroadcast])

  const filteredDeliveries = useMemo(() => {
    if (deliveriesFilter === 'all') return deliveries
    return deliveries.filter(d => d.status === deliveriesFilter)
  }, [deliveries, deliveriesFilter])

  const filteredBroadcasts = useMemo(() => {
    if (activeTab === 'all') return broadcasts
    if (activeTab === 'draft') return broadcasts.filter(b => b.status === 'draft')
    if (activeTab === 'scheduled') return broadcasts.filter(b => b.status === 'scheduled')
    if (activeTab === 'sent') return broadcasts.filter(b => b.status === 'sent' || b.status === 'failed')
    return broadcasts
  }, [broadcasts, activeTab])

  const counts = useMemo(() => ({
    calendar: broadcasts.filter(b => !!(b.scheduled_at || b.sent_at)).length,
    all: broadcasts.length,
    draft: broadcasts.filter(b => b.status === 'draft').length,
    scheduled: broadcasts.filter(b => b.status === 'scheduled').length,
    sent: broadcasts.filter(b => b.status === 'sent' || b.status === 'failed').length,
  }), [broadcasts])

  function resetForm() {
    setName('')
    setText('')
    setBotId('')
    setChannel('telegram')
    setEmailSubject('')
    setMediaId(null); setMediaType(null); setMediaUrl(null); setMediaFileName(null)
    setButtons([])
    setSegmentType('all')
    setSegmentValue('')
    setScheduleMode('now')
    setPreviewCount(null)
    const d = new Date()
    d.setMinutes(d.getMinutes() + 15)
    d.setSeconds(0, 0)
    setScheduledAt(toLocalDateTimeInput(d))
  }

  // Сброс превью если меняются параметры сегмента/канала/бота
  useEffect(() => { setPreviewCount(null) }, [channel, botId, segmentType, segmentValue])

  /**
   * Две стадии под одной кнопкой:
   *  1) sync — ping через Telegram API, помечаем заблокировавших
   *  2) count — запрашиваем preview-count с актуальными данными
   * Для email-only канала sync пропускаем.
   */
  async function handlePreviewCount() {
    if ((channel === 'telegram' || channel === 'both') && !botId) {
      alert('Для Telegram-канала выбери бота')
      return
    }
    setPreviewLoading(true)
    try {
      // 1. Сначала — проверка актуальности подписчиков (только для telegram-канала)
      if ((channel === 'telegram' || channel === 'both') && botId) {
        setPreviewStage('sync')
        try {
          await fetch('/api/broadcasts/sync-subscribers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegram_bot_id: botId }),
          })
        } catch (err) {
          console.warn('[preview] sync failed, счёт всё равно покажу:', err)
        }
      }

      // 2. Подсчёт получателей
      setPreviewStage('count')
      const res = await fetch('/api/broadcasts/preview-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          telegram_bot_id: botId || null,
          channel,
          segment_type: segmentType,
          segment_value: segmentValue || null,
        }),
      })
      const json = await res.json()
      if (json.error) alert('Ошибка: ' + json.error)
      else setPreviewCount(json.count ?? 0)
    } finally {
      setPreviewLoading(false)
      setPreviewStage(null)
    }
  }

  function addButton() {
    setButtons(prev => [...prev, { text: '', action_type: 'url', url: '' }])
  }
  function updateButton(i: number, patch: Partial<BroadcastButton>) {
    setButtons(prev => prev.map((b, idx) => idx === i ? { ...b, ...patch } : b))
  }
  function removeButton(i: number) {
    setButtons(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleCreate() {
    if (!name.trim()) {
      alert('Заполни название')
      return
    }
    // Для черновика — менее строгая валидация, разрешаем пустой текст
    const isDraft = scheduleMode === 'draft'
    if (!isDraft && !text.trim() && !mediaUrl) {
      alert('Добавь текст или медиа')
      return
    }
    if (!isDraft && (channel === 'telegram' || channel === 'both') && !botId) {
      alert('Для Telegram-канала выбери бота')
      return
    }
    if (!isDraft && (channel === 'email' || channel === 'both') && !emailSubject.trim()) {
      alert('Для email-канала заполни тему письма')
      return
    }
    if (!isDraft && (segmentType === 'scenario_message_in' || segmentType === 'scenario_message_not_in') && !segmentValue) {
      alert('Выбери блок сценария')
      return
    }
    // Валидация кнопок по action_type
    for (const b of buttons) {
      const hasAnyValue = b.text.trim() || b.url?.trim() || b.action_trigger_word?.trim() || b.action_goto_message_id
      if (!hasAnyValue) continue
      if (isDraft) continue
      if (!b.text.trim()) {
        alert('У кнопок должен быть текст')
        return
      }
      if (b.action_type === 'url') {
        if (!b.url?.trim()) { alert('У URL-кнопки должна быть ссылка'); return }
        if (!/^https?:\/\//i.test(b.url.trim())) {
          alert('Ссылка кнопки должна начинаться с http:// или https://')
          return
        }
      } else if (b.action_type === 'trigger') {
        if (!b.action_trigger_word?.trim()) { alert('Укажи кодовое слово в кнопке'); return }
      } else if (b.action_type === 'goto_message') {
        if (!b.action_goto_message_id) { alert('Выбери сообщение в кнопке'); return }
      }
    }

    let scheduledIso: string | null = null
    if (scheduleMode === 'later') {
      const d = new Date(scheduledAt)
      if (isNaN(d.getTime())) {
        alert('Некорректная дата/время')
        return
      }
      if (d.getTime() <= Date.now()) {
        alert('Время отправки должно быть в будущем')
        return
      }
      scheduledIso = d.toISOString()
    }

    setSaving(true)
    // Фильтруем «пустые» кнопки и обрезаем лишние поля по action_type
    const cleanButtons = buttons
      .filter(b => {
        if (!b.text.trim()) return false
        if (b.action_type === 'url') return !!b.url?.trim()
        if (b.action_type === 'trigger') return !!b.action_trigger_word?.trim()
        if (b.action_type === 'goto_message') return !!b.action_goto_message_id
        return false
      })
      .map(b => ({
        text: b.text.trim(),
        action_type: b.action_type,
        ...(b.action_type === 'url' ? { url: b.url?.trim() } : {}),
        ...(b.action_type === 'trigger' ? { action_trigger_word: b.action_trigger_word?.trim() } : {}),
        ...(b.action_type === 'goto_message' ? { action_goto_message_id: b.action_goto_message_id } : {}),
      }))
    const payload = {
      project_id: projectId,
      telegram_bot_id: botId || null,
      name, text,
      channel,
      email_subject: emailSubject || null,
      media_id: mediaId, media_type: mediaType, media_url: mediaUrl,
      segment_type: segmentType,
      segment_value: segmentValue || null,
      buttons: cleanButtons,
      scheduled_at: scheduledIso,
    }

    const res = isEditing
      ? await fetch(`/api/broadcasts?id=${editorId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/broadcasts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
    const json = await res.json()
    setSaving(false)

    if (json.error) {
      alert('Ошибка: ' + json.error)
      return
    }

    const broadcastId = json.broadcast?.id ?? (isEditing ? editorId : null)
    setEditorId(null)
    resetForm()
    await load()

    if (scheduleMode === 'now' && broadcastId) {
      // Сразу запускаем — без лишнего confirm, юзер уже выбрал «Сейчас»
      await handleSend(broadcastId)
    } else if (scheduleMode === 'later') {
      setActiveTab('scheduled')
    } else {
      setActiveTab('draft')
    }
  }

  /**
   * Открыть пустой редактор с предустановленной датой отправки.
   * Используется из календаря: клик по дню → новая запланированная рассылка.
   */
  function handleOpenNewAt(date: Date) {
    resetForm()
    const target = new Date(date)
    // Если кликнули на прошедший день — ставим сегодня+15 мин как в обычном режиме
    const now = new Date()
    if (target.getTime() < now.getTime()) {
      target.setTime(now.getTime() + 15 * 60 * 1000)
    } else {
      // По умолчанию 10:00 выбранного дня
      target.setHours(10, 0, 0, 0)
    }
    setScheduleMode('later')
    setScheduledAt(toLocalDateTimeInput(target))
    setEditorId('new')
  }

  /**
   * Открыть редактор для существующей рассылки: prefill полей и setEditorId(id).
   * Работает для draft и scheduled — sent/sending/failed не редактируются.
   */
  function handleEdit(b: Broadcast) {
    setName(b.name || '')
    setText(b.text || '')
    setBotId(b.telegram_bot_id || '')
    setChannel((b.channel as 'telegram' | 'email' | 'both') || 'telegram')
    setEmailSubject(b.email_subject || '')
    setMediaId(b.media_id || null)
    setMediaType(b.media_type || null)
    setMediaUrl(b.media_url || null)
    setMediaFileName(b.media_file_name || null)
    // Нормализуем кнопки из БД (бэкенд может вернуть legacy формат { text, url })
    const normalized: BroadcastButton[] = Array.isArray(b.buttons)
      ? b.buttons.map(raw => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r = raw as any
          const action_type = r.action_type || (r.url ? 'url' : 'url')
          return {
            text: r.text || '',
            action_type: action_type as BroadcastButton['action_type'],
            url: r.url,
            action_trigger_word: r.action_trigger_word,
            action_goto_message_id: r.action_goto_message_id,
          }
        })
      : []
    setButtons(normalized)
    setSegmentType((b.segment_type as SegmentType) || 'all')
    setSegmentValue(b.segment_value || '')
    setPreviewCount(null)
    if (b.scheduled_at) {
      setScheduleMode('later')
      setScheduledAt(toLocalDateTimeInput(new Date(b.scheduled_at)))
    } else {
      setScheduleMode(b.status === 'draft' ? 'draft' : 'now')
      const d = new Date()
      d.setMinutes(d.getMinutes() + 15)
      d.setSeconds(0, 0)
      setScheduledAt(toLocalDateTimeInput(d))
    }
    setEditorId(b.id)
  }

  /**
   * Создать копию: POST новой рассылки с теми же полями, статус = draft
   * (scheduled_at сбрасываем). Сразу открываем её в редакторе.
   */
  async function handleDuplicate(b: Broadcast) {
    const cleanButtons = Array.isArray(b.buttons)
      ? b.buttons.map(raw => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r = raw as any
          const action_type = r.action_type || (r.url ? 'url' : 'url')
          return {
            text: r.text || '',
            action_type,
            ...(action_type === 'url' ? { url: r.url } : {}),
            ...(action_type === 'trigger' ? { action_trigger_word: r.action_trigger_word } : {}),
            ...(action_type === 'goto_message' ? { action_goto_message_id: r.action_goto_message_id } : {}),
          }
        })
      : []
    const res = await fetch('/api/broadcasts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        telegram_bot_id: b.telegram_bot_id,
        name: (b.name || 'Рассылка') + ' (копия)',
        channel: b.channel,
        email_subject: b.email_subject,
        text: b.text,
        media_id: b.media_id,
        media_type: b.media_type,
        media_url: b.media_url,
        segment_type: b.segment_type,
        segment_value: b.segment_value,
        buttons: cleanButtons,
        scheduled_at: null,
      }),
    })
    const json = await res.json()
    if (json.error) { alert('Ошибка: ' + json.error); return }
    setSelectedBroadcast(null)
    await load()
    // Открываем копию в редакторе — prefill через только что созданный объект
    if (json.broadcast) handleEdit(json.broadcast)
  }

  async function handleSend(id: string) {
    setSendingId(id)
    const res = await fetch(`/api/broadcasts/${id}/send`, { method: 'POST' })
    const json = await res.json()
    setSendingId(null)
    if (json.error) alert('Ошибка: ' + json.error)
    else alert(`Отправлено ${json.sent} из ${json.total}${json.failed ? ` (${json.failed} ошибок)` : ''}`)
    await load()
  }

  async function handleCancel(id: string) {
    if (!confirm('Отменить запланированную рассылку?')) return
    await fetch(`/api/broadcasts?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'draft', scheduled_at: null }),
    })
    await load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Удалить рассылку?')) return
    await fetch(`/api/broadcasts?id=${id}`, { method: 'DELETE' })
    await load()
  }

  const statusLabel = (s: string) => {
    switch (s) {
      case 'draft': return { label: 'Черновик', color: 'bg-gray-100 text-gray-600' }
      case 'scheduled': return { label: 'Запланирована', color: 'bg-indigo-100 text-indigo-700' }
      case 'sending': return { label: 'Отправка…', color: 'bg-amber-100 text-amber-700' }
      case 'sent': return { label: 'Отправлено', color: 'bg-green-100 text-green-700' }
      case 'failed': return { label: 'Ошибка', color: 'bg-red-100 text-red-700' }
      case 'cancelled': return { label: 'Отменена', color: 'bg-gray-100 text-gray-400' }
      default: return { label: s, color: 'bg-gray-100 text-gray-600' }
    }
  }

  const segmentLabel = (b: Broadcast) => {
    if (b.segment_type === 'all') return 'Все клиенты'
    if (b.segment_type === 'funnel_stage') return `Этап: ${stages.find(s => s.id === b.segment_value)?.name ?? b.segment_value}`
    if (b.segment_type === 'tag') return `Тег: ${b.segment_value}`
    if (b.segment_type === 'source') return `Источник: ${b.segment_value}`
    if (b.segment_type === 'scenario_message_in') {
      const blk = blocks.find(x => x.id === b.segment_value)
      return `Был в блоке: ${blk ? stripHtml(blk.text).slice(0, 30) || '#' + blk.order_position : b.segment_value}`
    }
    if (b.segment_type === 'scenario_message_not_in') {
      const blk = blocks.find(x => x.id === b.segment_value)
      return `Не был в блоке: ${blk ? stripHtml(blk.text).slice(0, 30) || '#' + blk.order_position : b.segment_value}`
    }
    return b.segment_type
  }

  const primaryButtonLabel = saving
    ? 'Сохраняю…'
    : scheduleMode === 'later' ? 'Запланировать'
    : scheduleMode === 'draft' ? 'Сохранить черновик'
    : 'Отправить'

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Рассылки</h1>
          <p className="text-sm text-gray-500 mt-0.5">Массовая отправка сообщений по сегменту клиентов</p>
        </div>
        <button onClick={() => { resetForm(); setEditorId('new') }}
          className="px-4 py-2 bg-[#6A55F8] text-white text-sm font-medium rounded-lg hover:bg-[#5845e0]">
          + Новая рассылка
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-gray-100">
        {([
          { id: 'calendar' as const, label: '📅 Календарь' },
          { id: 'all' as const, label: 'Все' },
          { id: 'draft' as const, label: 'Черновики' },
          { id: 'scheduled' as const, label: 'Запланированные' },
          { id: 'sent' as const, label: 'Отправленные' },
        ]).map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === t.id
                ? 'border-[#6A55F8] text-[#6A55F8]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
            <span className="ml-1.5 text-[10px] text-gray-400">{counts[t.id]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Загрузка…</div>
      ) : activeTab === 'calendar' ? (
        <BroadcastCalendar
          broadcasts={broadcasts}
          onDayClick={handleOpenNewAt}
          onBroadcastClick={b => {
            if (b.status === 'draft' || b.status === 'scheduled') handleEdit(b)
            else setSelectedBroadcast(b)
          }}
          statusLabel={statusLabel}
        />
      ) : filteredBroadcasts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-2">📢</div>
          <p className="text-sm text-gray-500">
            {activeTab === 'all' && 'Пока нет рассылок'}
            {activeTab === 'draft' && 'Нет черновиков'}
            {activeTab === 'scheduled' && 'Нет запланированных рассылок'}
            {activeTab === 'sent' && 'Нет отправленных рассылок'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredBroadcasts.map(b => {
            const sl = statusLabel(b.status)
            return (
              <div key={b.id}
                onClick={() => {
                  // Черновик / запланированная — открываем редактор
                  if (b.status === 'draft' || b.status === 'scheduled') handleEdit(b)
                  // Отправленная / отправляемая / ошибка — открываем детали
                  else setSelectedBroadcast(b)
                }}
                className="bg-white rounded-xl border border-gray-100 p-4 hover:border-[#6A55F8]/40 cursor-pointer transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">{b.name}</h3>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${sl.color}`}>{sl.label}</span>
                      {b.status === 'scheduled' && b.scheduled_at && (
                        <span className="text-[10px] text-indigo-600">
                          ⏰ {new Date(b.scheduled_at).toLocaleString('ru', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    {b.text && <p className="text-xs text-gray-500 truncate">{stripHtml(b.text)}</p>}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                      <span>{segmentLabel(b)}</span>
                      {b.sent_count > 0 && (
                        <span>Отправлено: {b.sent_count}/{b.total_recipients}</span>
                      )}
                      {b.failed_count > 0 && (
                        <span className="text-red-500">Ошибок: {b.failed_count}</span>
                      )}
                      <span>{new Date(b.created_at).toLocaleString('ru')}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    {b.status === 'draft' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSend(b.id) }}
                        disabled={sendingId === b.id}
                        className="px-3 py-1 text-xs bg-[#6A55F8] text-white rounded hover:bg-[#5845e0] disabled:opacity-50">
                        {sendingId === b.id ? 'Отправка…' : 'Отправить'}
                      </button>
                    )}
                    {b.status === 'scheduled' && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSend(b.id) }}
                          disabled={sendingId === b.id}
                          className="px-3 py-1 text-xs bg-[#6A55F8] text-white rounded hover:bg-[#5845e0] disabled:opacity-50">
                          {sendingId === b.id ? 'Отправка…' : 'Отправить сейчас'}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCancel(b.id) }}
                          className="text-[10px] text-gray-400 hover:text-amber-600">
                          Отменить
                        </button>
                      </>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(b.id) }}
                      className="text-[10px] text-gray-400 hover:text-red-500">
                      Удалить
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {editorOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditorId(null)}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">
                {isEditing ? 'Редактирование рассылки' : 'Новая рассылка'}
              </h3>
              <button onClick={() => setEditorId(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Название</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Например: Скидка 20% на курс"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Канал</label>
                <div className="flex gap-2">
                  {([
                    { id: 'telegram' as const, label: '💬 Telegram' },
                    { id: 'email' as const, label: '✉️ Email' },
                    { id: 'both' as const, label: '📢 Оба' },
                  ]).map(ch => (
                    <button key={ch.id} type="button" onClick={() => setChannel(ch.id)}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        channel === ch.id
                          ? 'bg-[#6A55F8] text-white border-[#6A55F8]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-[#6A55F8]/40'
                      }`}>
                      {ch.label}
                    </button>
                  ))}
                </div>
              </div>

              {(channel === 'telegram' || channel === 'both') && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Бот</label>
                  <select value={botId} onChange={e => setBotId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
                    <option value="">— Выбери бота —</option>
                    {bots.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}

              {(channel === 'email' || channel === 'both') && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Тема письма</label>
                  <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
                    placeholder="Например: Старт нового курса уже скоро"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Текст сообщения</label>
                <RichTextEditor
                  value={text}
                  onChange={setText}
                  placeholder="Текст который отправится всем клиентам…"
                  rows={5}
                />
              </div>

              {/* Media */}
              <MediaUpload
                projectId={projectId}
                mediaId={mediaId} mediaType={mediaType} mediaUrl={mediaUrl} mediaFileName={mediaFileName ?? null}
                onChange={(mid, mt, mu, mfn) => {
                  setMediaId(mid); setMediaType(mt); setMediaUrl(mu); setMediaFileName(mfn)
                }}
              />

              {/* Buttons */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-700">Кнопки (необязательно)</label>
                  <button type="button" onClick={addButton}
                    className="text-xs text-[#6A55F8] font-medium hover:underline">+ Добавить</button>
                </div>
                {buttons.length === 0 ? (
                  <p className="text-[10px] text-gray-400">Добавь кнопки — появятся под сообщением в Telegram. Можно вести на ссылку, запускать кодовое слово или переводить на конкретный блок сценария.</p>
                ) : (
                  <div className="space-y-2">
                    {buttons.map((b, i) => (
                      <div key={i} className="bg-gray-50 rounded-lg p-2 space-y-2 border border-gray-100">
                        <div className="flex items-center gap-2">
                          <input type="text" value={b.text}
                            onChange={e => updateButton(i, { text: e.target.value })}
                            placeholder="Текст кнопки"
                            className="flex-1 px-2 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:border-[#6A55F8]" />
                          <button type="button" onClick={() => removeButton(i)}
                            className="text-gray-400 hover:text-red-500 text-xs">✕</button>
                        </div>
                        <div className="flex items-center gap-2">
                          <select value={b.action_type}
                            onChange={e => updateButton(i, {
                              action_type: e.target.value as BroadcastButton['action_type'],
                              url: '', action_trigger_word: '', action_goto_message_id: undefined,
                            })}
                            className="px-2 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:border-[#6A55F8]">
                            <option value="url">Ссылка</option>
                            <option value="trigger">Запустить кодовое слово</option>
                            <option value="goto_message">Перейти к сообщению</option>
                          </select>
                          {b.action_type === 'url' && (
                            <input type="url" value={b.url ?? ''}
                              onChange={e => updateButton(i, { url: e.target.value })}
                              placeholder="https://..."
                              className="flex-1 px-2 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:border-[#6A55F8]" />
                          )}
                          {b.action_type === 'trigger' && (
                            <input type="text" value={b.action_trigger_word ?? ''}
                              onChange={e => updateButton(i, { action_trigger_word: e.target.value })}
                              placeholder="Кодовое слово..."
                              className="flex-1 px-2 py-1.5 rounded border border-gray-200 text-xs font-mono focus:outline-none focus:border-[#6A55F8]" />
                          )}
                          {b.action_type === 'goto_message' && (
                            <select value={b.action_goto_message_id ?? ''}
                              onChange={e => updateButton(i, { action_goto_message_id: e.target.value || undefined })}
                              className="flex-1 px-2 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:border-[#6A55F8]">
                              <option value="">Выбери сообщение…</option>
                              {blocks
                                .filter(bl => !botId || bots.find(b2 => b2.id === botId)?.name === bl.bot_name)
                                .map(bl => (
                                  <option key={bl.id} value={bl.id}>
                                    {bl.bot_name} / {bl.scenario_name} / #{bl.order_position}
                                    {bl.text ? ` — ${stripHtml(bl.text).slice(0, 30)}` : ''}
                                  </option>
                                ))}
                            </select>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Segment */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Сегмент</label>
                <select value={segmentType}
                  onChange={e => { setSegmentType(e.target.value as SegmentType); setSegmentValue('') }}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
                  <option value="all">Все клиенты</option>
                  <option value="funnel_stage">По этапу воронки</option>
                  <option value="tag">По тегу</option>
                  <option value="source">По источнику трафика</option>
                  <option value="scenario_message_in">Был в блоке сценария</option>
                  <option value="scenario_message_not_in">НЕ был в блоке сценария</option>
                </select>
              </div>
              {segmentType === 'funnel_stage' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Этап воронки</label>
                  <select value={segmentValue} onChange={e => setSegmentValue(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
                    <option value="">— Выбери этап —</option>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.funnel_name} / {s.name}</option>)}
                  </select>
                </div>
              )}
              {segmentType === 'tag' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Тег</label>
                  <input type="text" value={segmentValue} onChange={e => setSegmentValue(e.target.value)}
                    placeholder="vip, active и т.д."
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
                </div>
              )}
              {segmentType === 'source' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Slug источника</label>
                  <input type="text" value={segmentValue} onChange={e => setSegmentValue(e.target.value)}
                    placeholder="instagram, vk-ads и т.д."
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
                </div>
              )}
              {(segmentType === 'scenario_message_in' || segmentType === 'scenario_message_not_in') && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {segmentType === 'scenario_message_in'
                      ? 'Блок который клиент получил'
                      : 'Блок который клиент НЕ получал'}
                  </label>
                  <select value={segmentValue} onChange={e => setSegmentValue(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
                    <option value="">— Выбери блок —</option>
                    {blocks.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.bot_name} / {b.scenario_name} / #{b.order_position}
                        {b.text ? ` — ${stripHtml(b.text).slice(0, 40)}` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {segmentType === 'scenario_message_in'
                      ? 'Рассылка уйдёт только клиентам, которые уже получили этот блок.'
                      : 'Рассылка уйдёт клиентам проекта, которым этот блок ни разу не отправлялся.'}
                  </p>
                </div>
              )}

              {/* Preview count (включает проверку актуальности подписчиков) */}
              <div className="flex items-center gap-3 pt-1 flex-wrap">
                <button type="button" onClick={handlePreviewCount} disabled={previewLoading}
                  title="Проверяем через Telegram кто реально доступен боту, потом считаем получателей"
                  className="text-xs text-[#6A55F8] font-medium hover:underline disabled:opacity-50">
                  {previewStage === 'sync' ? 'Проверяю подписчиков…'
                    : previewStage === 'count' ? 'Считаю…'
                    : '🔢 Подсчитать получателей'}
                </button>
                {previewCount !== null && !previewLoading && (
                  <span className="text-xs text-gray-700">
                    → <b>{previewCount}</b> {previewCount === 1 ? 'клиент' : previewCount < 5 ? 'клиента' : 'клиентов'}
                  </span>
                )}
              </div>

              {/* Schedule */}
              <div className="pt-2 border-t border-gray-100">
                <label className="block text-xs font-medium text-gray-700 mb-1">Когда отправить</label>
                <div className="flex gap-2">
                  {([
                    { id: 'now' as const, label: '⚡ Сейчас' },
                    { id: 'later' as const, label: '📅 Запланировать' },
                    { id: 'draft' as const, label: '📝 Черновик' },
                  ]).map(m => (
                    <button key={m.id} type="button" onClick={() => setScheduleMode(m.id)}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        scheduleMode === m.id
                          ? 'bg-[#6A55F8] text-white border-[#6A55F8]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-[#6A55F8]/40'
                      }`}>
                      {m.label}
                    </button>
                  ))}
                </div>
                {scheduleMode === 'later' && (
                  <input type="datetime-local" value={scheduledAt}
                    onChange={e => setScheduledAt(e.target.value)}
                    className="mt-2 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
                )}
                {scheduleMode === 'draft' && (
                  <p className="text-[10px] text-gray-400 mt-1">Сохранится как черновик. Отправить сможешь позже из вкладки «Черновики».</p>
                )}
              </div>
            </div>
            <div className="p-5 border-t border-gray-100 flex items-center justify-end gap-2">
              <button onClick={() => setEditorId(null)}
                className="px-3 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100">
                Отмена
              </button>
              <button onClick={handleCreate} disabled={saving}
                className="px-4 py-2 text-sm font-semibold bg-[#6A55F8] text-white rounded-lg hover:bg-[#5845e0] disabled:opacity-50">
                {primaryButtonLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selectedBroadcast && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedBroadcast(null)}>
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-gray-900 flex-1 truncate">{selectedBroadcast.name}</h3>
              <button onClick={() => handleDuplicate(selectedBroadcast)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#6A55F8]/30 text-[#6A55F8] hover:bg-[#F8F7FF]">
                📋 Создать копию
              </button>
              <button onClick={() => setSelectedBroadcast(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <div>
                <p className="text-xs text-gray-500 mb-1">Текст</p>
                <div className="text-gray-900 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: selectedBroadcast.text ?? '' }} />
              </div>
              {selectedBroadcast.media_url && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Вложение</p>
                  {selectedBroadcast.media_type === 'photo' || selectedBroadcast.media_type === 'animation' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selectedBroadcast.media_url} alt="" className="max-h-40 rounded border border-gray-200" />
                  ) : selectedBroadcast.media_type === 'video' || selectedBroadcast.media_type === 'video_note' ? (
                    <video src={selectedBroadcast.media_url} controls className="max-h-40 rounded border border-gray-200" />
                  ) : (
                    <a href={selectedBroadcast.media_url} target="_blank" rel="noreferrer" className="text-xs text-[#6A55F8] hover:underline">
                      {selectedBroadcast.media_type}
                    </a>
                  )}
                </div>
              )}
              {selectedBroadcast.buttons && selectedBroadcast.buttons.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Кнопки</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedBroadcast.buttons.map((btn, i) => {
                      const type = btn.action_type || (btn.url ? 'url' : 'url')
                      let target = ''
                      if (type === 'url') target = btn.url ?? ''
                      else if (type === 'trigger') target = btn.action_trigger_word ? `/${btn.action_trigger_word}` : ''
                      else if (type === 'goto_message') {
                        const blk = blocks.find(b => b.id === btn.action_goto_message_id)
                        target = blk ? `блок #${blk.order_position}` : 'блок сценария'
                      }
                      return (
                        <span key={i} className="text-xs bg-[#F8F7FF] text-[#6A55F8] px-2 py-1 rounded border border-[#6A55F8]/20">
                          {btn.text} → {target}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Канал</p>
                  <p className="text-sm font-medium text-gray-900">{selectedBroadcast.channel}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Сегмент</p>
                  <p className="text-sm font-medium text-gray-900">{segmentLabel(selectedBroadcast)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Статус</p>
                  <p className="text-sm font-medium text-gray-900">{statusLabel(selectedBroadcast.status).label}</p>
                </div>
              </div>
              {selectedBroadcast.scheduled_at && (
                <p className="text-xs text-indigo-600">
                  Запланировано на: {new Date(selectedBroadcast.scheduled_at).toLocaleString('ru')}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Получателей</p>
                  <p className="text-lg font-bold">{selectedBroadcast.total_recipients}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Отправлено</p>
                  <p className="text-lg font-bold text-green-600">{selectedBroadcast.sent_count}</p>
                </div>
              </div>
              {selectedBroadcast.failed_count > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Ошибок</p>
                  <p className="text-sm text-red-600">{selectedBroadcast.failed_count}</p>
                </div>
              )}
              {selectedBroadcast.sent_at && (
                <p className="text-xs text-gray-500">
                  Отправлено: {new Date(selectedBroadcast.sent_at).toLocaleString('ru')}
                </p>
              )}

              {/* Список получателей */}
              <div className="pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-700">Получатели ({deliveries.length})</p>
                  {deliveries.length > 0 && (
                    <div className="flex items-center gap-1">
                      {([
                        { id: 'all' as const, label: 'Все' },
                        { id: 'sent' as const, label: '✓ Отправлено' },
                        { id: 'failed' as const, label: '✗ Ошибки' },
                      ]).map(f => (
                        <button key={f.id} type="button" onClick={() => setDeliveriesFilter(f.id)}
                          className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                            deliveriesFilter === f.id
                              ? 'bg-[#6A55F8] text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {deliveriesLoading ? (
                  <p className="text-xs text-gray-400 py-3">Загрузка…</p>
                ) : deliveries.length === 0 ? (
                  <p className="text-xs text-gray-400 py-3">Рассылка ещё не запускалась</p>
                ) : filteredDeliveries.length === 0 ? (
                  <p className="text-xs text-gray-400 py-3">Нет записей с таким статусом</p>
                ) : (
                  <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-100">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Клиент</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Контакт</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDeliveries.map(d => {
                          const name = d.customers?.full_name || d.customers?.telegram_username || 'Без имени'
                          const uname = d.customers?.telegram_username
                          const href = d.customer_id ? `/project/${projectId}/users?open=${d.customer_id}` : null
                          // Формируем человекочитаемую ошибку для Telegram-отказов
                          const errLow = (d.error ?? '').toLowerCase()
                          const isBlocked = errLow.includes('forbidden') || errLow.includes("can't initiate conversation") || errLow.includes('bot was blocked')
                          const isGone = errLow.includes('chat not found') || errLow.includes('user is deactivated')
                          const blockedAt = d.customers?.bot_blocked_at
                            ? new Date(d.customers.bot_blocked_at).toLocaleString('ru', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                            : null
                          const exact = d.customers?.bot_blocked_source === 'webhook'
                          const prettyError = isBlocked
                            ? (blockedAt ? (exact ? `Заблокировал бота ${blockedAt}` : `Заблокировал бота (обнаружено ${blockedAt})`) : 'Заблокировал бота')
                            : isGone ? 'Удалил чат с ботом'
                            : (d.error ? d.error.slice(0, 60) : 'Ошибка')
                          return (
                            <tr key={d.id} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors">
                              <td className="px-3 py-2 text-gray-900 truncate max-w-[120px]">
                                {href ? (
                                  <Link href={href} className="text-[#6A55F8] hover:underline">{name}</Link>
                                ) : name}
                              </td>
                              <td className="px-3 py-2 text-gray-500 truncate max-w-[140px]">
                                {uname ? (
                                  <a href={`https://t.me/${uname}`} target="_blank" rel="noreferrer"
                                    title={`Открыть чат в Telegram с @${uname}`}
                                    className="text-[#6A55F8] hover:underline">
                                    @{uname}
                                  </a>
                                ) : d.customers?.email ? (
                                  <a href={`mailto:${d.customers.email}`} className="hover:underline">
                                    {d.customers.email}
                                  </a>
                                ) : d.customers?.telegram_id ? (
                                  <span>{d.customers.telegram_id}</span>
                                ) : '—'}
                              </td>
                              <td className="px-3 py-2">
                                {d.status === 'sent' ? (
                                  <span className="text-green-600">✓ Отправлено</span>
                                ) : (
                                  <span className="text-red-500" title={d.error ?? ''}>✗ {prettyError}</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================
// CALENDAR VIEW — месячная сетка рассылок
// =============================================
// Показывает запланированные и отправленные рассылки на календарной сетке.
// Клик по дню → создание новой рассылки на этот день (10:00 по умолчанию).
// Клик по карточке рассылки → редактор (draft/scheduled) или detail (sent).
// Неделя начинается с понедельника (ru локаль).

function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function BroadcastCalendar({ broadcasts, onDayClick, onBroadcastClick, statusLabel }: {
  broadcasts: Broadcast[]
  onDayClick: (date: Date) => void
  onBroadcastClick: (b: Broadcast) => void
  statusLabel: (s: string) => { label: string; color: string }
}) {
  // Текущий месяц (первое число, 00:00 локально)
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date()
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d
  })

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  // Группируем рассылки по YYYY-MM-DD: приоритет scheduled_at, иначе sent_at.
  const broadcastsByDate = useMemo(() => {
    const map = new Map<string, Broadcast[]>()
    for (const b of broadcasts) {
      const iso = b.scheduled_at || b.sent_at
      if (!iso) continue
      const key = dateKey(new Date(iso))
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(b)
    }
    // Сортируем внутри дня по времени
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const ai = new Date(a.scheduled_at || a.sent_at || 0).getTime()
        const bi = new Date(b.scheduled_at || b.sent_at || 0).getTime()
        return ai - bi
      })
    }
    return map
  }, [broadcasts])

  // Сетка 6 недель × 7 дней, стартует с понедельника предыдущего/текущего месяца
  const cells = useMemo(() => {
    const first = new Date(viewMonth)
    // JS: 0=Sun..6=Sat, нам надо 0=Mon..6=Sun
    const firstDow = (first.getDay() + 6) % 7
    const start = new Date(first)
    start.setDate(start.getDate() - firstDow)
    const result: Date[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      result.push(d)
    }
    return result
  }, [viewMonth])

  const monthTitle = viewMonth.toLocaleString('ru', { month: 'long', year: 'numeric' })

  function prevMonth() {
    const d = new Date(viewMonth)
    d.setMonth(d.getMonth() - 1)
    setViewMonth(d)
  }
  function nextMonth() {
    const d = new Date(viewMonth)
    d.setMonth(d.getMonth() + 1)
    setViewMonth(d)
  }
  function goToday() {
    const d = new Date()
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    setViewMonth(d)
  }

  const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">◀</button>
          <button onClick={nextMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">▶</button>
          <h3 className="text-base font-semibold text-gray-900 capitalize ml-2">{monthTitle}</h3>
        </div>
        <button onClick={goToday}
          className="text-xs font-medium text-[#6A55F8] hover:underline">Сегодня</button>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {dayNames.map((n, i) => (
          <div key={n} className={`px-2 py-2 text-[10px] font-medium uppercase tracking-wider text-center ${i >= 5 ? 'text-red-400' : 'text-gray-400'}`}>
            {n}
          </div>
        ))}
      </div>

      {/* Cells */}
      <div className="grid grid-cols-7 auto-rows-fr">
        {cells.map((d, idx) => {
          const inMonth = d.getMonth() === viewMonth.getMonth()
          const isToday = d.getTime() === today.getTime()
          const isWeekend = d.getDay() === 0 || d.getDay() === 6
          const isPast = d.getTime() < today.getTime()
          const items = broadcastsByDate.get(dateKey(d)) ?? []
          return (
            <button
              key={idx}
              onClick={() => onDayClick(new Date(d))}
              className={`group relative min-h-[104px] text-left p-2 border-r border-b border-gray-100 last:border-r-0 transition-colors ${
                inMonth ? 'bg-white hover:bg-[#F8F7FF]' : 'bg-gray-50/60 hover:bg-[#F0EDFF]'
              } ${isToday ? 'ring-1 ring-inset ring-[#6A55F8]' : ''}`}
              title={isPast ? 'Прошедший день — рассылку можно посмотреть' : 'Кликни чтобы запланировать рассылку на этот день'}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-semibold ${
                  isToday ? 'text-[#6A55F8]'
                    : !inMonth ? 'text-gray-300'
                    : isWeekend ? 'text-red-400'
                    : 'text-gray-700'
                }`}>{d.getDate()}</span>
                {inMonth && !isPast && (
                  <span className="opacity-0 group-hover:opacity-100 text-[10px] text-[#6A55F8] transition-opacity">+</span>
                )}
              </div>

              <div className="space-y-0.5">
                {items.slice(0, 3).map(b => {
                  const sl = statusLabel(b.status)
                  const time = (b.scheduled_at || b.sent_at)
                    ? new Date(b.scheduled_at || b.sent_at || '').toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
                    : ''
                  return (
                    <div key={b.id}
                      onClick={ev => { ev.stopPropagation(); onBroadcastClick(b) }}
                      className={`text-[10px] px-1.5 py-0.5 rounded truncate cursor-pointer hover:brightness-95 ${sl.color}`}
                      title={`${b.name}${time ? ' — ' + time : ''}`}>
                      <span className="font-mono mr-1 opacity-70">{time}</span>
                      {b.name}
                    </div>
                  )
                })}
                {items.length > 3 && (
                  <div className="text-[10px] text-gray-400 pl-1.5">+{items.length - 3} ещё</div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <div className="p-3 border-t border-gray-100 flex items-center gap-3 text-[10px] text-gray-400 flex-wrap">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-indigo-400"></span> запланирована
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-400"></span> отправлено
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-400"></span> ошибка
        </span>
        <span className="ml-auto">Клик по дню — создать рассылку на этот день</span>
      </div>
    </div>
  )
}
