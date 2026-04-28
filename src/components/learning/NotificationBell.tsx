'use client'

// Phase 7.12 — Колокольчик уведомлений (для ученика и для куратора).
// Автоматически определяет recipient: customer (для /learn) или user (для админки).

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Notification = {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  is_read: boolean
  created_at: string
}

export default function NotificationBell() {
  const supabase = createClient()
  const router = useRouter()
  const [items, setItems] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    // Обе грани: уведомления адресованные user_id и через customer_id
    const { data: customers } = await supabase.from('customers').select('id').eq('user_id', user.id)
    const customerIds = (customers ?? []).map(c => c.id)

    let query = supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(30)

    if (customerIds.length > 0) {
      query = query.or(`recipient_user_id.eq.${user.id},recipient_customer_id.in.(${customerIds.join(',')})`)
    } else {
      query = query.eq('recipient_user_id', user.id)
    }

    const { data } = await query
    setItems((data as Notification[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    // Поллинг каждые 30 сек когда вкладка открыта
    const interval = setInterval(() => { void load() }, 30000)
    return () => clearInterval(interval)
  }, [load])

  async function markRead(id: string) {
    await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id)
    setItems(prev => prev.map(x => x.id === id ? { ...x, is_read: true } : x))
  }

  async function markAllRead() {
    const unread = items.filter(x => !x.is_read).map(x => x.id)
    if (unread.length === 0) return
    await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).in('id', unread)
    setItems(prev => prev.map(x => ({ ...x, is_read: true })))
  }

  function onClickItem(n: Notification) {
    markRead(n.id)
    if (n.link) router.push(n.link)
    setOpen(false)
  }

  const unreadCount = items.filter(x => !x.is_read).length

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
        aria-label="Уведомления"
      >
        <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#6A55F8] text-white text-[10px] font-semibold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-gray-100 shadow-xl z-50 max-h-[70vh] overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900">Уведомления</span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-[#6A55F8] hover:underline">Прочитать все</button>
              )}
            </div>
            <div className="flex-1 overflow-auto">
              {loading && items.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-400">Загрузка…</div>
              ) : items.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-400">Уведомлений пока нет</div>
              ) : (
                items.map(n => (
                  <button
                    key={n.id}
                    onClick={() => onClickItem(n)}
                    className={`w-full px-4 py-3 text-left border-b border-gray-50 last:border-b-0 hover:bg-gray-50 ${!n.is_read ? 'bg-[#6A55F8]/5' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.is_read && <div className="w-2 h-2 rounded-full bg-[#6A55F8] mt-1.5 flex-shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900">{n.title}</div>
                        {n.body && <div className="text-xs text-gray-500 line-clamp-2 mt-0.5">{n.body}</div>}
                        <div className="text-xs text-gray-400 mt-1">{new Date(n.created_at).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
