'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'

type TimelineEvent = {
  customer_id: string
  project_id: string
  ts: string
  kind: string
  side: 'us' | 'them'
  data: Record<string, unknown> | null
}

const KIND_META: Record<string, { icon: string; label: string }> = {
  message_in:           { icon: '💬', label: 'Сообщение клиента' },
  message_out:          { icon: '📤', label: 'Бот отправил сообщение' },
  button_click:         { icon: '🖱️', label: 'Клик по кнопке' },
  bot_button_click:     { icon: '👆', label: 'Нажал кнопку в боте' },
  bot_start:            { icon: '🤖', label: 'Запустил бота' },
  bot_message:          { icon: '💬', label: 'Написал боту' },
  landing_view:         { icon: '🌐', label: 'Открыл лендинг' },
  landing_visit:        { icon: '🌐', label: 'Открыл лендинг' },
  landing_button_click: { icon: '🔗', label: 'Клик по кнопке на лендинге' },
  link_click:           { icon: '🔗', label: 'Перешёл по ссылке' },
  form_submit:          { icon: '📝', label: 'Отправил форму' },
  page_view:            { icon: '👁️', label: 'Просмотр страницы' },
  source_linked:        { icon: '📍', label: 'Источник определён' },
  order_created:        { icon: '🛒', label: 'Создан заказ' },
  order_paid:           { icon: '💳', label: 'Оплатил заказ' },
  order_refund:         { icon: '↩️', label: 'Возврат' },
  funnel_stage_entered: { icon: '➡️', label: 'Этап воронки' },
  channel_subscribed:   { icon: '📣', label: 'Подписался на канал' },
  channel_unsubscribed: { icon: '⚪', label: 'Отписался от канала' },
  bot_subscribed:       { icon: '🤖', label: 'Подписался на бота' },
  bot_blocked:          { icon: '🚫', label: 'Заблокировал бота' },
  broadcast_sent:       { icon: '📨', label: 'Получил рассылку' },
  broadcast_failed:     { icon: '⚠️', label: 'Ошибка рассылки' },
  video_view:           { icon: '▶️', label: 'Смотрел видео' },
  lesson_started:       { icon: '📚', label: 'Начал урок' },
  lesson_completed:     { icon: '✅', label: 'Завершил урок' },
  note_added:           { icon: '📌', label: 'Добавлена заметка' },
  manual_action:        { icon: '✏️', label: 'Ручное действие' },
}

function eventLabel(kind: string, data: Record<string, unknown> | null): { title: string; details: string | null } {
  const meta = KIND_META[kind] ?? { icon: '·', label: kind }
  let details: string | null = null

  if (!data) return { title: meta.label, details: null }

  switch (kind) {
    case 'message_in':
    case 'message_out': {
      const c = String(data.content ?? '').replace(/<[^>]+>/g, '').trim()
      details = c.length > 200 ? c.slice(0, 200) + '…' : c || null
      break
    }
    case 'button_click':
    case 'bot_button_click':
    case 'landing_button_click':
    case 'link_click':
      details = String(data.button_text ?? data.destination_url ?? '') || null
      break
    case 'landing_view':
    case 'landing_visit':
      details = String(data.landing_name ?? data.landing_slug ?? '') || null
      break
    case 'order_created':
    case 'order_paid': {
      const a = data.amount as number | undefined
      const s = data.status as string | undefined
      details = [a ? `${a} ₽` : null, s].filter(Boolean).join(' · ') || null
      break
    }
    case 'funnel_stage_entered':
      details = [data.funnel_name, data.stage_name].filter(Boolean).join(' → ') || null
      break
    case 'broadcast_sent':
    case 'broadcast_failed':
      details = String(data.broadcast_name ?? '') || null
      break
    case 'video_view':
      details = data.completed
        ? `${data.title ?? ''} (полностью)`
        : `${data.title ?? ''} (${data.watch_time_seconds ?? 0} сек)`
      break
    case 'note_added':
      details = String(data.text ?? '') || null
      break
    case 'source_linked':
      details = String(data.source_name ?? '') || null
      break
    case 'bot_message':
      details = String(data.text ?? '') || null
      break
  }
  const title = `${meta.icon} ${meta.label}`
  return { title, details }
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yest = new Date(); yest.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (sameDay(d, today)) return 'Сегодня'
  if (sameDay(d, yest))  return 'Вчера'
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export default function ActivityTimeline({ customerId }: { customerId: string }) {
  const supabase = createClient()
  const [events, setEvents] = useState<TimelineEvent[] | null>(null)
  const [activeKinds, setActiveKinds] = useState<Set<string> | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('customer_timeline_events')
        .select('*')
        .eq('customer_id', customerId)
        .order('ts', { ascending: false })
        .limit(500)
      if (!cancelled) setEvents((data ?? []) as TimelineEvent[])
    }
    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  const allKindsInData = useMemo(() => {
    if (!events) return [] as string[]
    return Array.from(new Set(events.map(e => e.kind)))
  }, [events])

  const filtered = useMemo(() => {
    if (!events) return []
    if (!activeKinds) return events
    return events.filter(e => activeKinds.has(e.kind))
  }, [events, activeKinds])

  const grouped = useMemo(() => {
    const out: { day: string; items: TimelineEvent[] }[] = []
    let curr: { day: string; items: TimelineEvent[] } | null = null
    for (const e of filtered) {
      const day = dayLabel(e.ts)
      if (!curr || curr.day !== day) {
        curr = { day, items: [] }
        out.push(curr)
      }
      curr.items.push(e)
    }
    return out
  }, [filtered])

  if (events === null) {
    return <div className="text-sm text-gray-400 py-6">Загрузка таймлайна…</div>
  }
  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <div className="text-3xl mb-2">📭</div>
        <div className="text-sm">Активности пока нет</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5 pb-2 border-b border-gray-100">
        <button
          onClick={() => setActiveKinds(null)}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            activeKinds === null
              ? 'bg-[#6A55F8] border-[#6A55F8] text-white'
              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
          }`}
        >
          Все ({events.length})
        </button>
        {allKindsInData.map(k => {
          const meta = KIND_META[k] ?? { icon: '·', label: k }
          const count = events.filter(e => e.kind === k).length
          const checked = activeKinds?.has(k)
          return (
            <button
              key={k}
              onClick={() => {
                const next = new Set(activeKinds ?? [])
                if (next.has(k)) next.delete(k)
                else next.add(k)
                setActiveKinds(next.size === 0 ? null : next)
              }}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                checked
                  ? 'bg-[#F0EDFF] border-[#6A55F8] text-[#6A55F8]'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
              title={`${count} ${meta.label}`}
            >
              {meta.icon} {meta.label} <span className="opacity-50">({count})</span>
            </button>
          )
        })}
      </div>

      {/* Timeline groups */}
      {grouped.map(g => (
        <div key={g.day}>
          <div className="sticky top-0 z-10 bg-white py-1.5 mb-2">
            <div className="inline-block bg-gray-100 text-gray-600 text-xs font-medium rounded-full px-3 py-1">
              {g.day}
            </div>
          </div>
          <div className="space-y-2">
            {g.items.map((e, i) => {
              const { title, details } = eventLabel(e.kind, e.data)
              const isUs = e.side === 'us'
              return (
                <div key={`${e.ts}-${e.kind}-${i}`} className={`flex ${isUs ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                      isUs
                        ? 'bg-[#F0EDFF] text-[#1F1B4D] rounded-tr-sm'
                        : 'bg-gray-50 text-gray-800 rounded-tl-sm border border-gray-100'
                    }`}
                  >
                    <div className="flex items-center gap-1 text-xs opacity-70 mb-0.5">
                      <span className={isUs ? 'text-[#6A55F8]' : 'text-gray-500'}>{title}</span>
                      <span>·</span>
                      <span>{timeLabel(e.ts)}</span>
                    </div>
                    {details && <div className="whitespace-pre-wrap break-words">{details}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
