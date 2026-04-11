'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { loadCustomerTimeline, TimelineItem } from '@/lib/customer-timeline'

export default function CustomerTimeline({ customerId }: { customerId: string }) {
  const [items, setItems] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const supabase = createClient()

  useEffect(() => {
    setLoading(true)
    loadCustomerTimeline(supabase, customerId).then(data => {
      setItems(data)
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  const filtered = filter === 'all' ? items : items.filter(i => i.type === filter)

  const filters = [
    { id: 'all', label: 'Всё' },
    { id: 'action', label: 'Действия' },
    { id: 'event', label: 'События' },
    { id: 'order', label: 'Заказы' },
    { id: 'video_view', label: 'Видео' },
    { id: 'note', label: 'Заметки' },
  ]

  if (loading) return <div className="text-center py-8 text-sm text-gray-400">Загрузка ленты…</div>

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex gap-1 flex-wrap">
        {filters.map(f => {
          const count = f.id === 'all' ? items.length : items.filter(i => i.type === f.id).length
          if (count === 0 && f.id !== 'all') return null
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1 rounded text-xs font-medium ${
                filter === f.id ? 'bg-[#6A55F8] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Нет событий</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <div key={item.id} className="flex items-start gap-3 bg-white border border-gray-100 rounded-lg p-3 hover:border-gray-200">
              <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-base flex-shrink-0">
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{item.title}</p>
                {item.subtitle && (
                  <p className="text-xs text-gray-500 truncate mt-0.5">{item.subtitle}</p>
                )}
              </div>
              <div className="text-[10px] text-gray-400 whitespace-nowrap">
                {new Date(item.timestamp).toLocaleString('ru', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
