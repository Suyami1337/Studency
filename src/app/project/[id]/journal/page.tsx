'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type LogEntry = {
  id: string
  customer_id: string
  action: string
  data: Record<string, unknown> | null
  created_at: string
  // joined
  customer_name: string | null
  customer_telegram: string | null
  customer_source: string | null
}

const ACTION_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  bot_start:              { label: 'Запустил бота',            icon: '🤖', color: 'bg-purple-50 text-purple-700' },
  bot_subscribed:         { label: 'Подписался на бота',       icon: '🤖', color: 'bg-green-50 text-green-700' },
  bot_blocked:            { label: 'Заблокировал бота',        icon: '🚫', color: 'bg-red-50 text-red-700' },
  bot_unsubscribed:       { label: 'Отписался от бота',        icon: '👋', color: 'bg-gray-50 text-gray-600' },
  bot_message:            { label: 'Написал в бота',           icon: '💬', color: 'bg-blue-50 text-blue-700' },
  bot_button_click:       { label: 'Нажал кнопку в боте',      icon: '👆', color: 'bg-indigo-50 text-indigo-700' },
  channel_subscribed:     { label: 'Подписался на канал',       icon: '📢', color: 'bg-green-50 text-green-700' },
  channel_unsubscribed:   { label: 'Отписался от канала',       icon: '📢', color: 'bg-red-50 text-red-600' },
  landing_visit:          { label: 'Посетил лендинг',           icon: '🌐', color: 'bg-cyan-50 text-cyan-700' },
  landing_button_click:   { label: 'Кликнул кнопку на сайте',   icon: '🖱️', color: 'bg-cyan-50 text-cyan-700' },
  button_click:           { label: 'Клик по кнопке',            icon: '🖱️', color: 'bg-cyan-50 text-cyan-700' },
  link_click:             { label: 'Перешёл по ссылке',         icon: '🔗', color: 'bg-blue-50 text-blue-600' },
  form_submit:            { label: 'Заполнил форму',            icon: '📝', color: 'bg-amber-50 text-amber-700' },
  page_view:              { label: 'Просмотр страницы',         icon: '👁️', color: 'bg-gray-50 text-gray-600' },
  source_linked:          { label: 'Источник определён',        icon: '📍', color: 'bg-emerald-50 text-emerald-700' },
  order_created:          { label: 'Создал заказ',              icon: '🛒', color: 'bg-orange-50 text-orange-700' },
  order_paid:             { label: 'Оплатил заказ',             icon: '💰', color: 'bg-green-50 text-green-700' },
  order_refund:           { label: 'Возврат заказа',            icon: '↩️', color: 'bg-red-50 text-red-600' },
  crm_auto_move:          { label: 'CRM: авто-перемещение',     icon: '⚡', color: 'bg-purple-50 text-purple-700' },
  crm_manual_move:        { label: 'CRM: ручное перемещение',   icon: '👤', color: 'bg-gray-50 text-gray-600' },
  lesson_started:         { label: 'Начал урок',                icon: '📚', color: 'bg-blue-50 text-blue-700' },
  lesson_completed:       { label: 'Завершил урок',             icon: '✅', color: 'bg-green-50 text-green-700' },
  note_added:             { label: 'Добавлена заметка',         icon: '📝', color: 'bg-gray-50 text-gray-500' },
  manual_action:          { label: 'Ручное действие',           icon: '✏️', color: 'bg-gray-50 text-gray-500' },
}

const FILTER_GROUPS = [
  { label: 'Telegram', actions: ['bot_start', 'bot_subscribed', 'bot_blocked', 'bot_unsubscribed', 'bot_message', 'bot_button_click', 'channel_subscribed', 'channel_unsubscribed'] },
  { label: 'Сайт', actions: ['landing_visit', 'landing_button_click', 'button_click', 'link_click', 'form_submit', 'page_view'] },
  { label: 'Продажи', actions: ['order_created', 'order_paid', 'order_refund'] },
  { label: 'CRM', actions: ['crm_auto_move', 'crm_manual_move', 'source_linked'] },
  { label: 'Обучение', actions: ['lesson_started', 'lesson_completed'] },
]

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('ru', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru', { day: '2-digit', month: 'long', year: 'numeric' })
}

function getDataSummary(action: string, data: Record<string, unknown> | null): string {
  if (!data) return ''
  const parts: string[] = []
  if (data.bot_name) parts.push(`бот: ${data.bot_name}`)
  if (data.button_text) parts.push(`кнопка: "${data.button_text}"`)
  if (data.source_name) parts.push(`источник: ${data.source_name}`)
  if (data.source_slug) parts.push(`slug: ${data.source_slug}`)
  if (data.landing_slug) parts.push(`лендинг: ${data.landing_slug}`)
  if (data.landing_name) parts.push(`${data.landing_name}`)
  if (data.channel_id) parts.push(`канал: ${data.channel_id}`)
  if (data.order_id) parts.push(`заказ: ${String(data.order_id).slice(0, 8)}...`)
  if (data.amount) parts.push(`сумма: ${data.amount} ₽`)
  if (data.auto_created) parts.push('(авто-создан)')
  if (data.telegram_username) parts.push(`@${data.telegram_username}`)
  return parts.join(' · ')
}

export default function JournalPage() {
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()

  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  // Filters
  const [selectedActions, setSelectedActions] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [sources, setSources] = useState<Array<{ id: string; name: string }>>([])

  const PAGE_SIZE = 50

  // Load sources for filter
  useEffect(() => {
    supabase.from('traffic_sources').select('id, name').eq('project_id', projectId)
      .order('click_count', { ascending: false })
      .then(({ data }) => setSources((data ?? []) as Array<{ id: string; name: string }>))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const loadLogs = useCallback(async (offset = 0, append = false) => {
    if (offset === 0) setLoading(true)
    else setLoadingMore(true)

    // Build query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from('customer_actions')
      .select('id, customer_id, action, data, created_at, customers!inner(full_name, telegram_username, source_name, source_id)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    // Action filter
    if (selectedActions.size > 0) {
      query = query.in('action', Array.from(selectedActions))
    }

    // Source filter — filter by customer source
    if (sourceFilter) {
      query = query.eq('customers.source_id', sourceFilter)
    }

    const { data, error } = await query

    if (error) {
      console.error('journal load error:', error)
      setLoading(false)
      setLoadingMore(false)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries: LogEntry[] = ((data ?? []) as any[]).map(row => ({
      id: row.id,
      customer_id: row.customer_id,
      action: row.action,
      data: row.data,
      created_at: row.created_at,
      customer_name: row.customers?.full_name ?? null,
      customer_telegram: row.customers?.telegram_username ?? null,
      customer_source: row.customers?.source_name ?? null,
    }))

    if (append) setLogs(prev => [...prev, ...entries])
    else setLogs(entries)

    setHasMore(entries.length === PAGE_SIZE)
    setLoading(false)
    setLoadingMore(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, selectedActions, sourceFilter])

  useEffect(() => { loadLogs(0) }, [loadLogs])

  function toggleAction(action: string) {
    setSelectedActions(prev => {
      const next = new Set(prev)
      if (next.has(action)) next.delete(action)
      else next.add(action)
      return next
    })
  }

  function toggleGroup(actions: string[]) {
    setSelectedActions(prev => {
      const next = new Set(prev)
      const allSelected = actions.every(a => next.has(a))
      if (allSelected) actions.forEach(a => next.delete(a))
      else actions.forEach(a => next.add(a))
      return next
    })
  }

  // Client-side search filter
  const filteredLogs = searchQuery.trim()
    ? logs.filter(l => {
        const q = searchQuery.toLowerCase()
        return (l.customer_name ?? '').toLowerCase().includes(q)
          || (l.customer_telegram ?? '').toLowerCase().includes(q)
          || (ACTION_CONFIG[l.action]?.label ?? l.action).toLowerCase().includes(q)
          || getDataSummary(l.action, l.data).toLowerCase().includes(q)
      })
    : logs

  // Group by date
  const groupedByDate = new Map<string, LogEntry[]>()
  for (const log of filteredLogs) {
    const dateKey = formatDate(log.created_at)
    if (!groupedByDate.has(dateKey)) groupedByDate.set(dateKey, [])
    groupedByDate.get(dateKey)!.push(log)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Журнал событий</h1>
        <p className="text-sm text-gray-500 mt-0.5">Все действия клиентов в реальном времени</p>
      </div>

      {/* Filters bar */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        {/* Search + Source */}
        <div className="flex gap-3 flex-wrap">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Поиск по имени, username, действию..."
            className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]"
          />
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]"
          >
            <option value="">Все источники</option>
            {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {(selectedActions.size > 0 || sourceFilter || searchQuery) && (
            <button
              onClick={() => { setSelectedActions(new Set()); setSourceFilter(''); setSearchQuery('') }}
              className="px-3 py-2 text-xs text-[#6A55F8] font-medium hover:underline"
            >
              Сбросить фильтры
            </button>
          )}
        </div>

        {/* Action type filters by group */}
        <div className="space-y-2">
          {FILTER_GROUPS.map(group => (
            <div key={group.label} className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => toggleGroup(group.actions)}
                className={`px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-wide ${
                  group.actions.every(a => selectedActions.has(a))
                    ? 'bg-[#6A55F8] text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {group.label}
              </button>
              {group.actions.map(action => {
                const cfg = ACTION_CONFIG[action]
                if (!cfg) return null
                const isActive = selectedActions.has(action)
                return (
                  <button
                    key={action}
                    onClick={() => toggleAction(action)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      isActive ? 'bg-[#6A55F8] text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    {cfg.icon} {cfg.label}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
        <span>{filteredLogs.length} событий{hasMore ? '+' : ''}</span>
        {selectedActions.size > 0 && <span>· {selectedActions.size} фильтров</span>}
        {sourceFilter && <span>· по источнику</span>}
      </div>

      {/* Log entries grouped by date */}
      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Загрузка...</div>
      ) : filteredLogs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-2">📋</div>
          <p className="text-sm text-gray-500">Нет событий по выбранным фильтрам</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(groupedByDate.entries()).map(([date, entries]) => (
            <div key={date}>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">{date}</div>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
                {entries.map(log => {
                  const cfg = ACTION_CONFIG[log.action] ?? { label: log.action, icon: '•', color: 'bg-gray-50 text-gray-600' }
                  const dataSummary = getDataSummary(log.action, log.data)
                  return (
                    <div key={log.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50/50">
                      {/* Icon */}
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0 ${cfg.color}`}>
                        {cfg.icon}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900">
                            {log.customer_name ?? 'Аноним'}
                          </span>
                          {log.customer_telegram && (
                            <span className="text-xs text-gray-400">@{log.customer_telegram}</span>
                          )}
                          {log.customer_source && (
                            <span className="text-[10px] bg-[#F0EDFF] text-[#6A55F8] rounded px-1.5 py-0.5">📍 {log.customer_source}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">{cfg.label}</p>
                        {dataSummary && (
                          <p className="text-[10px] text-gray-400 mt-0.5">{dataSummary}</p>
                        )}
                      </div>

                      {/* Time */}
                      <span className="text-[10px] text-gray-400 flex-shrink-0 pt-1">
                        {formatTime(log.created_at)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Load more */}
          {hasMore && (
            <div className="text-center py-4">
              <button
                onClick={() => loadLogs(logs.length, true)}
                disabled={loadingMore}
                className="px-5 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {loadingMore ? 'Загрузка...' : 'Загрузить ещё'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
