// Конфигурация раздела «Пользователи»: типы, колонки, фильтры, helpers.

export type SortDirection = 'asc' | 'desc'

export type ClientType = 'guest' | 'subscriber' | 'user' | 'client'

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  guest:      'Гость',
  subscriber: 'Подписчик',
  user:       'Пользователь',
  client:     'Клиент',
}

export const CLIENT_TYPE_COLOR: Record<ClientType, { bg: string; fg: string }> = {
  guest:      { bg: '#F1F5F9', fg: '#64748B' },
  subscriber: { bg: '#DBEAFE', fg: '#2563EB' },
  user:       { bg: '#EDE9FF', fg: '#6A55F8' },
  client:     { bg: '#D1FAE5', fg: '#059669' },
}

export const CLIENT_TYPE_HINT: Record<ClientType, string> = {
  guest:      'Только visitor_token, нет имени и контактов',
  subscriber: 'Подписался на бота или канал, в воронку не заходил',
  user:       'Попал в воронку (оставил данные / запустил бота)',
  client:     'Совершил оплаченную покупку',
}

// ─── Customer + aggregate row ───
export type CustomerRow = {
  id: string
  project_id: string
  full_name: string | null
  email: string | null
  phone: string | null
  telegram_id: string | null
  telegram_username: string | null
  instagram: string | null
  vk: string | null
  whatsapp: string | null
  tags: string[] | null
  is_blocked: boolean | null
  source_name: string | null
  source_slug: string | null
  visitor_token: string | null
  bot_subscribed: boolean | null
  bot_blocked: boolean | null
  channel_subscribed: boolean | null
  created_at: string
  // joined from customer_aggregates
  last_activity_at?: string | null
  orders_count?: number
  revenue?: number
  has_paid?: boolean
  in_funnel?: boolean
}

export function deriveClientType(c: CustomerRow): ClientType {
  if (c.has_paid) return 'client'
  if (c.in_funnel) return 'user'
  if (c.bot_subscribed || c.channel_subscribed) return 'subscriber'
  if (!c.full_name && !c.email && !c.phone && !c.telegram_id) return 'guest'
  // если есть данные но нет ни воронки, ни бота, ни покупки — относим к подписчикам
  return 'subscriber'
}

// ─── Filter fields ───

export type FilterFieldType = 'text' | 'select' | 'multiselect' | 'date_range' | 'boolean' | 'number_range' | 'tag'

export type FilterField = {
  id: string
  label: string
  type: FilterFieldType
  options?: { value: string; label: string }[]   // для select/multiselect
  placeholder?: string
}

export const FILTER_FIELDS: FilterField[] = [
  {
    id: 'client_type',
    label: 'Тип',
    type: 'multiselect',
    options: [
      { value: 'guest',      label: '🟦 Гость' },
      { value: 'subscriber', label: '🔔 Подписчик' },
      { value: 'user',       label: '🎯 Пользователь' },
      { value: 'client',     label: '💳 Клиент' },
    ],
  },
  { id: 'has_email',     label: 'Email указан',    type: 'boolean' },
  { id: 'has_phone',     label: 'Телефон указан',  type: 'boolean' },
  { id: 'has_telegram',  label: 'Telegram указан', type: 'boolean' },
  { id: 'bot_subscribed',label: 'Подписан на бота',type: 'boolean' },
  { id: 'bot_blocked',   label: 'Заблокировал бота', type: 'boolean' },
  { id: 'channel_subscribed', label: 'Подписан на канал', type: 'boolean' },
  { id: 'has_paid',      label: 'Совершил покупку',type: 'boolean' },
  { id: 'in_funnel',     label: 'В воронке',       type: 'boolean' },
  { id: 'tags',          label: 'Теги',            type: 'tag', placeholder: 'тег' },
  { id: 'source_name',   label: 'Источник',        type: 'text', placeholder: 'название источника' },
  { id: 'created_range', label: 'Дата создания',   type: 'date_range' },
  { id: 'activity_range',label: 'Последняя активность', type: 'date_range' },
  { id: 'revenue_range', label: 'Сумма заказов (₽)', type: 'number_range' },
  { id: 'search',        label: 'Поиск (имя/email/Telegram)', type: 'text', placeholder: 'строка для поиска' },
]

export type FilterCondition = {
  field: string
  // type-specific value
  value: string | string[] | boolean | { from?: string; to?: string } | { min?: number; max?: number } | null
}

// ─── Columns ───

export type ColumnId =
  | 'name' | 'email' | 'phone' | 'telegram' | 'tags'
  | 'created_at' | 'last_activity_at' | 'client_type'
  | 'source' | 'orders_count' | 'revenue'
  | 'bot_subscribed' | 'channel_subscribed' | 'in_funnel'

export type ColumnDef = {
  id: ColumnId
  label: string
  sortable: boolean
  default?: boolean   // показана по умолчанию
  width?: string
}

export const COLUMNS: ColumnDef[] = [
  { id: 'name',             label: 'Имя',                      sortable: true,  default: true },
  { id: 'client_type',      label: 'Тип',                      sortable: false, default: true },
  { id: 'email',            label: 'Email',                    sortable: true,  default: true },
  { id: 'phone',            label: 'Телефон',                  sortable: false, default: true },
  { id: 'telegram',         label: 'Telegram',                 sortable: false, default: true },
  { id: 'tags',             label: 'Теги',                     sortable: false, default: true },
  { id: 'last_activity_at', label: 'Последняя активность',     sortable: true,  default: true },
  { id: 'created_at',       label: 'Создан',                   sortable: true },
  { id: 'source',           label: 'Источник',                 sortable: true },
  { id: 'orders_count',     label: 'Заказов',                  sortable: true },
  { id: 'revenue',          label: 'Сумма заказов',            sortable: true },
  { id: 'bot_subscribed',   label: 'Подписан на бота',         sortable: false },
  { id: 'channel_subscribed', label: 'Подписан на канал',      sortable: false },
  { id: 'in_funnel',        label: 'В воронке',                sortable: false },
]

export const DEFAULT_VISIBLE_COLUMNS: ColumnId[] = COLUMNS.filter(c => c.default).map(c => c.id)

export const DEFAULT_SORT = { column: 'last_activity_at' as ColumnId, direction: 'desc' as SortDirection }

// ─── Segment ───

export type Segment = {
  id: string
  project_id: string
  name: string
  filters: FilterCondition[]
  sort: { column: ColumnId; direction: SortDirection }
  visible_columns: ColumnId[]
  created_at: string
  updated_at: string
}

// ─── Filtering / sorting helpers ───

function inRange(value: number | null | undefined, range?: { min?: number; max?: number }) {
  if (!range) return true
  if (range.min !== undefined && range.min !== null && (value ?? 0) < range.min) return false
  if (range.max !== undefined && range.max !== null && (value ?? 0) > range.max) return false
  return true
}

function inDateRange(iso: string | null | undefined, range?: { from?: string; to?: string }) {
  if (!range) return true
  if (!iso) return false
  const t = new Date(iso).getTime()
  if (range.from && t < new Date(range.from).getTime()) return false
  if (range.to)   {
    // inclusive end-of-day
    const end = new Date(range.to)
    end.setHours(23, 59, 59, 999)
    if (t > end.getTime()) return false
  }
  return true
}

export function applyFilters(rows: CustomerRow[], filters: FilterCondition[]): CustomerRow[] {
  return rows.filter(row => filters.every(f => matchFilter(row, f)))
}

export function matchFilter(row: CustomerRow, f: FilterCondition): boolean {
  switch (f.field) {
    case 'client_type': {
      const v = f.value
      if (!Array.isArray(v) || v.length === 0) return true
      return v.includes(deriveClientType(row))
    }
    case 'has_email':    return f.value === null ? true : Boolean(row.email) === f.value
    case 'has_phone':    return f.value === null ? true : Boolean(row.phone) === f.value
    case 'has_telegram': return f.value === null ? true : Boolean(row.telegram_id || row.telegram_username) === f.value
    case 'bot_subscribed':      return f.value === null ? true : Boolean(row.bot_subscribed) === f.value
    case 'bot_blocked':         return f.value === null ? true : Boolean(row.bot_blocked) === f.value
    case 'channel_subscribed':  return f.value === null ? true : Boolean(row.channel_subscribed) === f.value
    case 'has_paid':     return f.value === null ? true : Boolean(row.has_paid) === f.value
    case 'in_funnel':    return f.value === null ? true : Boolean(row.in_funnel) === f.value
    case 'tags': {
      const v = f.value as string | string[] | null
      const tags = (v == null) ? [] : (Array.isArray(v) ? v : [v])
      if (tags.length === 0) return true
      const have = row.tags ?? []
      return tags.every(t => have.includes(t))
    }
    case 'source_name': {
      const q = ((f.value as string) ?? '').toLowerCase().trim()
      if (!q) return true
      return (row.source_name ?? '').toLowerCase().includes(q)
    }
    case 'created_range':  return inDateRange(row.created_at, f.value as { from?: string; to?: string })
    case 'activity_range': return inDateRange(row.last_activity_at ?? row.created_at, f.value as { from?: string; to?: string })
    case 'revenue_range':  return inRange(row.revenue ?? 0, f.value as { min?: number; max?: number })
    case 'search': {
      const q = ((f.value as string) ?? '').toLowerCase().trim()
      if (!q) return true
      return (
        (row.full_name ?? '').toLowerCase().includes(q) ||
        (row.email ?? '').toLowerCase().includes(q) ||
        (row.phone ?? '').toLowerCase().includes(q) ||
        (row.telegram_username ?? '').toLowerCase().includes(q)
      )
    }
    default: return true
  }
}

export function sortRows(rows: CustomerRow[], col: ColumnId, dir: SortDirection): CustomerRow[] {
  const m = dir === 'asc' ? 1 : -1
  function getKey(r: CustomerRow): string | number {
    switch (col) {
      case 'name':             return (r.full_name ?? r.email ?? '').toLowerCase()
      case 'email':            return (r.email ?? '').toLowerCase()
      case 'created_at':       return new Date(r.created_at).getTime()
      case 'last_activity_at': return new Date(r.last_activity_at ?? r.created_at).getTime()
      case 'source':           return (r.source_name ?? '').toLowerCase()
      case 'orders_count':     return r.orders_count ?? 0
      case 'revenue':          return r.revenue ?? 0
      default:                 return ''
    }
  }
  return [...rows].sort((a, b) => {
    const ka = getKey(a), kb = getKey(b)
    if (ka < kb) return -1 * m
    if (ka > kb) return  1 * m
    return 0
  })
}

// ─── Formatting ───

export function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function formatRelative(iso: string | null | undefined) {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  const now = Date.now()
  const sec = Math.floor((now - t) / 1000)
  if (sec < 60) return 'только что'
  if (sec < 3600) return `${Math.floor(sec / 60)} мин назад`
  if (sec < 86400) return `${Math.floor(sec / 3600)} ч назад`
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)} дн назад`
  return formatDate(iso)
}

export function formatMoney(n: number | null | undefined) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency', currency: 'RUB', maximumFractionDigits: 0,
  }).format(n ?? 0)
}

// ─── CSV export ───

export function exportToCSV(rows: CustomerRow[], cols: ColumnId[]): string {
  const header = cols.map(id => COLUMNS.find(c => c.id === id)?.label ?? id)
  const lines = [header.join(',')]
  for (const r of rows) {
    const cells = cols.map(id => {
      const v = cellValue(r, id)
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    })
    lines.push(cells.join(','))
  }
  return lines.join('\n')
}

export function cellValue(r: CustomerRow, id: ColumnId): string | number {
  switch (id) {
    case 'name':             return r.full_name ?? ''
    case 'client_type':      return CLIENT_TYPE_LABELS[deriveClientType(r)]
    case 'email':            return r.email ?? ''
    case 'phone':            return r.phone ?? ''
    case 'telegram':         return r.telegram_username ? `@${r.telegram_username}` : ''
    case 'tags':             return (r.tags ?? []).join('; ')
    case 'created_at':       return formatDateTime(r.created_at)
    case 'last_activity_at': return formatDateTime(r.last_activity_at ?? r.created_at)
    case 'source':           return r.source_name ?? ''
    case 'orders_count':     return r.orders_count ?? 0
    case 'revenue':          return r.revenue ?? 0
    case 'bot_subscribed':   return r.bot_subscribed ? 'да' : 'нет'
    case 'channel_subscribed': return r.channel_subscribed ? 'да' : 'нет'
    case 'in_funnel':        return r.in_funnel ? 'да' : 'нет'
    default: return ''
  }
}

export function downloadCSV(text: string, filename: string) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 100)
}
