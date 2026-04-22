'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import RichTextEditor from '@/components/RichTextEditor'

type Broadcast = {
  id: string
  name: string
  status: string
  text: string | null
  media_url: string | null
  media_type: string | null
  telegram_bot_id: string | null
  channel: string
  email_subject: string | null
  segment_type: string
  segment_value: string | null
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
type TabKey = 'all' | 'draft' | 'scheduled' | 'sent'

// Формат для datetime-local с учётом локальной таймзоны (без смещения в UTC).
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
  const [showCreate, setShowCreate] = useState(false)
  const [selectedBroadcast, setSelectedBroadcast] = useState<Broadcast | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('all')

  // Form state
  const [name, setName] = useState('')
  const [botId, setBotId] = useState('')
  const [channel, setChannel] = useState<'telegram' | 'email' | 'both'>('telegram')
  const [emailSubject, setEmailSubject] = useState('')
  const [text, setText] = useState('')
  const [segmentType, setSegmentType] = useState<SegmentType>('all')
  const [segmentValue, setSegmentValue] = useState('')
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now')
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date()
    d.setMinutes(d.getMinutes() + 15)
    d.setSeconds(0, 0)
    return toLocalDateTimeInput(d)
  })
  const [saving, setSaving] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [brRes, botsRes, stagesRes, blocksRes] = await Promise.all([
      fetch(`/api/broadcasts?project_id=${projectId}`).then(r => r.json()),
      supabase.from('telegram_bots').select('id, name').eq('project_id', projectId),
      supabase.from('funnel_stages').select('id, name, funnels!inner(name, project_id)')
        .eq('funnels.project_id', projectId),
      // Блоки сценария для сегментации «был/не был в блоке». Ограничиваемся
      // проектом через join на chatbot_scenarios.
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

  const filteredBroadcasts = useMemo(() => {
    if (activeTab === 'all') return broadcasts
    if (activeTab === 'draft') return broadcasts.filter(b => b.status === 'draft')
    if (activeTab === 'scheduled') return broadcasts.filter(b => b.status === 'scheduled')
    if (activeTab === 'sent') return broadcasts.filter(b => b.status === 'sent' || b.status === 'failed')
    return broadcasts
  }, [broadcasts, activeTab])

  const counts = useMemo(() => ({
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
    setSegmentType('all')
    setSegmentValue('')
    setScheduleMode('now')
    const d = new Date()
    d.setMinutes(d.getMinutes() + 15)
    d.setSeconds(0, 0)
    setScheduledAt(toLocalDateTimeInput(d))
  }

  async function handleCreate() {
    if (!name.trim() || !text.trim()) {
      alert('Заполни название и текст')
      return
    }
    if ((channel === 'telegram' || channel === 'both') && !botId) {
      alert('Для Telegram-канала выбери бота')
      return
    }
    if ((channel === 'email' || channel === 'both') && !emailSubject.trim()) {
      alert('Для email-канала заполни тему письма')
      return
    }
    if ((segmentType === 'scenario_message_in' || segmentType === 'scenario_message_not_in') && !segmentValue) {
      alert('Выбери блок сценария')
      return
    }

    // Если запланировано — время должно быть в будущем
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
    const res = await fetch('/api/broadcasts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        telegram_bot_id: botId || null,
        name, text,
        channel,
        email_subject: emailSubject || null,
        segment_type: segmentType,
        segment_value: segmentValue || null,
        scheduled_at: scheduledIso,
      }),
    })
    const json = await res.json()
    setSaving(false)

    if (json.error) {
      alert('Ошибка: ' + json.error)
      return
    }

    setShowCreate(false)
    resetForm()
    await load()

    // Если выбрано "Отправить сейчас" — сразу запускаем
    if (scheduleMode === 'now' && json.broadcast?.id) {
      if (confirm('Запустить рассылку сейчас?')) {
        await handleSend(json.broadcast.id)
      } else {
        setActiveTab('draft')
      }
    } else {
      setActiveTab('scheduled')
    }
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

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Рассылки</h1>
          <p className="text-sm text-gray-500 mt-0.5">Массовая отправка сообщений по сегменту клиентов</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-[#6A55F8] text-white text-sm font-medium rounded-lg hover:bg-[#5845e0]">
          + Новая рассылка
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-gray-100">
        {([
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
                onClick={() => setSelectedBroadcast(b)}
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

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Новая рассылка</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Название</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Например: Скидка 20% на курс"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
              </div>

              {/* Channel selector */}
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

              {/* Schedule */}
              <div className="pt-2 border-t border-gray-100">
                <label className="block text-xs font-medium text-gray-700 mb-1">Когда отправить</label>
                <div className="flex gap-2 mb-2">
                  {([
                    { id: 'now' as const, label: '⚡ Сейчас' },
                    { id: 'later' as const, label: '📅 Запланировать' },
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
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
                )}
              </div>
            </div>
            <div className="p-5 border-t border-gray-100 flex items-center justify-end gap-2">
              <button onClick={() => setShowCreate(false)}
                className="px-3 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100">
                Отмена
              </button>
              <button onClick={handleCreate} disabled={saving}
                className="px-4 py-2 text-sm font-semibold bg-[#6A55F8] text-white rounded-lg hover:bg-[#5845e0] disabled:opacity-50">
                {saving
                  ? 'Сохраняю…'
                  : scheduleMode === 'later' ? 'Запланировать' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selectedBroadcast && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedBroadcast(null)}>
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">{selectedBroadcast.name}</h3>
              <button onClick={() => setSelectedBroadcast(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <div>
                <p className="text-xs text-gray-500 mb-1">Текст</p>
                <div className="text-gray-900 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: selectedBroadcast.text ?? '' }} />
              </div>
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
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
