// Unified customer timeline helper
// Aggregates events from multiple sources into a single chronological feed

import { SupabaseClient } from '@supabase/supabase-js'

export type TimelineItem = {
  id: string
  type: 'action' | 'note' | 'order' | 'event' | 'message' | 'video_view'
  icon: string
  title: string
  subtitle?: string
  timestamp: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>
}

export async function loadCustomerTimeline(
  supabase: SupabaseClient,
  customerId: string
): Promise<TimelineItem[]> {
  const items: TimelineItem[] = []

  // 1. Customer actions
  const { data: actions } = await supabase
    .from('customer_actions')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(100)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const a of (actions ?? []) as any[]) {
    items.push({
      id: `action-${a.id}`,
      type: 'action',
      icon: actionIcon(a.action),
      title: actionLabel(a.action),
      subtitle: a.data ? JSON.stringify(a.data).slice(0, 100) : undefined,
      timestamp: a.created_at,
      metadata: a.data,
    })
  }

  // 2. Orders
  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (orders ?? []) as any[]) {
    items.push({
      id: `order-${o.id}`,
      type: 'order',
      icon: '🛒',
      title: `Заказ: ${o.product_name ?? 'Без названия'}`,
      subtitle: `${o.amount ?? 0} ₽ · ${o.status}`,
      timestamp: o.created_at,
    })
  }

  // 3. Events
  const { data: events } = await supabase
    .from('events')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(100)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (events ?? []) as any[]) {
    items.push({
      id: `event-${e.id}`,
      type: 'event',
      icon: eventIcon(e.event_type),
      title: `${e.event_type}${e.event_name ? `: ${e.event_name}` : ''}`,
      subtitle: e.source ? `из ${e.source}` : undefined,
      timestamp: e.created_at,
      metadata: e.metadata,
    })
  }

  // 4. Notes
  const { data: notes } = await supabase
    .from('customer_notes')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const n of (notes ?? []) as any[]) {
    items.push({
      id: `note-${n.id}`,
      type: 'note',
      icon: '📝',
      title: 'Заметка',
      subtitle: n.content,
      timestamp: n.created_at,
    })
  }

  // 5. Video views
  const { data: views } = await supabase
    .from('video_views')
    .select('*, videos(title)')
    .eq('customer_id', customerId)
    .order('started_at', { ascending: false })
    .limit(50)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const v of (views ?? []) as any[]) {
    items.push({
      id: `view-${v.id}`,
      type: 'video_view',
      icon: '🎬',
      title: `Смотрел видео: ${v.videos?.title ?? 'Без названия'}`,
      subtitle: v.completed
        ? `Досмотрел до конца`
        : `Посмотрел ${Math.floor(v.watch_time_seconds / 60)}:${(v.watch_time_seconds % 60).toString().padStart(2, '0')}`,
      timestamp: v.started_at,
    })
  }

  // Sort all items by timestamp DESC
  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return items
}

function actionIcon(action: string): string {
  const map: Record<string, string> = {
    bot_start: '🤖', bot_message: '💬', bot_button_click: '👆',
    landing_visit: '🌐', landing_button_click: '🖱️',
    button_click: '🖱️', link_click: '🔗', form_submit: '📝',
    page_view: '👁️', source_linked: '📍', order_created: '🛒',
    order_paid: '💰', email_sent: '✉️',
  }
  return map[action] ?? '•'
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    bot_start: 'Запустил бота',
    bot_message: 'Написал в бота',
    bot_button_click: 'Нажал кнопку в боте',
    landing_visit: 'Открыл лендинг',
    landing_button_click: 'Кликнул на кнопку сайта',
    button_click: 'Клик по кнопке',
    link_click: 'Переход по ссылке',
    form_submit: 'Отправил форму',
    page_view: 'Просмотр страницы',
    source_linked: 'Источник определён',
    order_created: 'Создал заказ',
    order_paid: 'Оплатил заказ',
    email_sent: 'Отправлено письмо',
  }
  return map[action] ?? action
}

function eventIcon(type: string): string {
  const map: Record<string, string> = {
    page_view: '👁️', button_click: '🖱️', form_submit: '📝',
    video_start: '▶️', video_complete: '✅', custom: '⚡',
  }
  return map[type] ?? '⚡'
}
