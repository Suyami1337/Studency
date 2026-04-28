// Конфигурация раздела «Пользователи»: типы, колонки, фильтры, helpers.

export type SortDirection = 'asc' | 'desc'

export type ClientType = 'guest' | 'user' | 'client'

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  guest:      'Гость',
  user:       'Пользователь',
  client:     'Клиент',
}

export const CLIENT_TYPE_COLOR: Record<ClientType, { bg: string; fg: string }> = {
  guest:      { bg: '#F1F5F9', fg: '#64748B' },
  user:       { bg: '#EDE9FF', fg: '#6A55F8' },
  client:     { bg: '#D1FAE5', fg: '#059669' },
}

export const CLIENT_TYPE_HINT: Record<ClientType, string> = {
  guest:      'Только visitor_token, нет имени и контактов',
  user:       'Попал в воронку (оставил данные / запустил бота / был на лендинге)',
  client:     'Совершил оплаченную покупку',
}

// ─── Customer + aggregate row ───
export type CustomerRow = {
  id: string
  project_id: string
  public_code: string | null   // G-1, G-2, ... — отображается вместо "Без имени"
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
  crm_visible?: boolean | null   // false = скрытая карточка (подписка/диалог без воронки)
  created_at: string
  // first-touch attribution
  first_touch_at?: string | null
  first_touch_kind?: string | null   // 'landing' | 'bot' | 'channel' | 'direct'
  first_touch_source?: string | null
  first_touch_landing_id?: string | null
  first_touch_referrer?: string | null
  first_touch_url?: string | null
  first_touch_utm?: Record<string, string> | null
  // joined from customer_aggregates
  last_activity_at?: string | null
  orders_count?: number
  revenue?: number
  has_paid?: boolean
  in_funnel?: boolean
  // joined from project_members + roles (через view customers_with_role)
  user_id?: string | null
  role_code?: string | null
  role_label?: string | null
  role_access_type?: 'admin_panel' | 'student_panel' | 'no_access' | null
  membership_id?: string | null
  // подгружаются отдельно через loadAll в /users/page.tsx
  subscribed_bot_ids?: string[]   // боты на которые подписан (из chatbot_conversations)
  blocked_bot_ids?: string[]      // боты которые заблокировал
  subscribed_channel_ids?: string[]  // каналы на которые подписан (social_subscribers_log)
  paid_product_ids?: string[]     // продукты которые купил (orders.status='paid')
}

// Dynamic options для фильтров: подгружаются на клиенте per-проект.
export type DynamicFilterOptions = {
  bots: { value: string; label: string }[]      // telegram_bots
  channels: { value: string; label: string }[]  // social_accounts
  products: { value: string; label: string }[]  // products
  tags: { value: string; label: string }[]      // уникальные tags из customers
}

export const EMPTY_DYNAMIC_OPTIONS: DynamicFilterOptions = {
  bots: [], channels: [], products: [], tags: [],
}

/**
 * Имя для отображения. Приоритет: full_name > @telegram_username > public_code.
 * Никогда не возвращает «Без имени» — для каждого customer'а гарантирован
 * уникальный public_code.
 */
export function customerDisplayName(c: Pick<CustomerRow, 'full_name' | 'telegram_username' | 'public_code' | 'id'>): string {
  if (c.full_name && c.full_name.trim()) return c.full_name
  if (c.telegram_username) return `@${c.telegram_username}`
  if (c.public_code) return c.public_code
  return c.id.slice(0, 8)  // last-resort fallback
}

/** Первая буква для аватара. */
export function customerAvatarLetter(c: Pick<CustomerRow, 'full_name' | 'telegram_username' | 'public_code' | 'email'>): string {
  const src = (c.full_name || c.email || c.telegram_username || c.public_code || '?').trim()
  return src.charAt(0).toUpperCase()
}

export const FIRST_TOUCH_KIND_LABELS: Record<string, { label: string; icon: string }> = {
  landing: { label: 'Лендинг',     icon: '🌐' },
  bot:     { label: 'Бот',         icon: '🤖' },
  channel: { label: 'Канал',       icon: '📣' },
  direct:  { label: 'Прямой заход', icon: '↗' },
}

export function deriveClientType(c: CustomerRow): ClientType {
  if (c.has_paid) return 'client'
  // Любая активность за пределами «голого посещения» = пользователь
  if (c.in_funnel || c.email || c.phone || c.full_name || c.bot_subscribed || c.channel_subscribed) return 'user'
  // Совсем ничего нет — только visitor_token / случайно зашедший
  return 'guest'
}

// ─── Filter fields ───

export type FilterFieldType = 'text' | 'select' | 'multiselect' | 'date_range' | 'boolean' | 'number_range' | 'tag'

export type FilterField = {
  id: string
  label: string
  type: FilterFieldType
  options?: { value: string; label: string }[]   // для select/multiselect (статичные)
  // Если задан — options подгружаются на клиенте динамически из этого источника.
  dynamic_source?: 'bots' | 'channels' | 'products' | 'tags'
  placeholder?: string
}

export const FILTER_FIELDS: FilterField[] = [
  {
    id: 'client_type',
    label: 'Тип (этап воронки)',
    type: 'multiselect',
    options: [
      { value: 'guest',  label: '🟦 Гость' },
      { value: 'user',   label: '🎯 Пользователь' },
      { value: 'client', label: '💳 Клиент' },
    ],
  },
  {
    id: 'role_code',
    label: 'Роль в проекте',
    type: 'multiselect',
    options: [
      { value: 'owner',       label: '👑 Владелец' },
      { value: 'super_admin', label: '⚙ Главный администратор' },
      { value: 'admin',       label: '🛠 Администратор' },
      { value: 'curator',     label: '👨‍🏫 Куратор' },
      { value: 'sales',       label: '💼 Продажник' },
      { value: 'marketer',    label: '📊 Таргетолог' },
      { value: 'student',     label: '🎓 Ученик' },
      { value: '__none__',    label: '— Без роли (нет входа)' },
    ],
  },
  { id: 'has_email',     label: 'Email указан',    type: 'boolean' },
  { id: 'has_phone',     label: 'Телефон указан',  type: 'boolean' },
  { id: 'has_telegram',  label: 'Telegram указан', type: 'boolean' },
  { id: 'subscribed_bot_ids',     label: 'Подписан на бота',     type: 'multiselect', dynamic_source: 'bots' },
  { id: 'blocked_bot_ids',        label: 'Заблокировал бота',    type: 'multiselect', dynamic_source: 'bots' },
  { id: 'subscribed_channel_ids', label: 'Подписан на канал',    type: 'multiselect', dynamic_source: 'channels' },
  { id: 'paid_product_ids',       label: 'Купил продукт',         type: 'multiselect', dynamic_source: 'products' },
  { id: 'in_funnel',     label: 'В воронке',       type: 'boolean' },
  { id: 'tags',          label: 'Теги',            type: 'multiselect', dynamic_source: 'tags' },
  { id: 'source_name',   label: 'Источник',        type: 'text', placeholder: 'название источника' },
  {
    id: 'first_touch_kind',
    label: 'Точка входа',
    type: 'multiselect',
    options: [
      { value: 'landing', label: '🌐 Лендинг' },
      { value: 'bot',     label: '🤖 Бот' },
      { value: 'channel', label: '📣 Канал' },
      { value: 'direct',  label: '↗ Прямой' },
    ],
  },
  { id: 'first_touch_source', label: 'Источник входа (UTM/название)', type: 'text', placeholder: 'utm_source / blogger_ivan / ...' },
  { id: 'utm_campaign',  label: 'UTM Campaign',   type: 'text', placeholder: 'campaign' },
  { id: 'utm_source',    label: 'UTM Source',     type: 'text', placeholder: 'source' },
  { id: 'created_range', label: 'Дата создания',   type: 'date_range' },
  { id: 'activity_range',label: 'Последняя активность', type: 'date_range' },
  { id: 'revenue_range', label: 'Сумма заказов (₽)', type: 'number_range' },
  { id: 'search',        label: 'Поиск (имя/email/Telegram)', type: 'text', placeholder: 'строка для поиска' },
]

export type FilterCondition = {
  field: string
  // negate=true инвертирует условие («НЕ соответствует»). Применяется к каждому условию отдельно.
  negate?: boolean
  // type-specific value
  value: string | string[] | boolean | { from?: string; to?: string } | { min?: number; max?: number } | null
}

// FilterState = группа условий + логика их объединения.
// combinator='and' — должно выполняться ВСЕ условия (по умолчанию).
// combinator='or' — достаточно хотя бы одного.
export type FilterCombinator = 'and' | 'or'

export type FilterState = {
  combinator: FilterCombinator
  conditions: FilterCondition[]
}

export const EMPTY_FILTER_STATE: FilterState = { combinator: 'and', conditions: [] }

/** Привести filters старого формата (массив) или нового (объект) к FilterState. */
export function normalizeFilterState(input: unknown): FilterState {
  if (!input) return EMPTY_FILTER_STATE
  if (Array.isArray(input)) {
    return { combinator: 'and', conditions: input as FilterCondition[] }
  }
  if (typeof input === 'object') {
    const obj = input as { combinator?: FilterCombinator; conditions?: FilterCondition[] }
    return {
      combinator: obj.combinator === 'or' ? 'or' : 'and',
      conditions: Array.isArray(obj.conditions) ? obj.conditions : [],
    }
  }
  return EMPTY_FILTER_STATE
}

// ─── Columns ───

export type ColumnId =
  | 'name' | 'email' | 'phone' | 'telegram' | 'tags'
  | 'created_at' | 'last_activity_at' | 'client_type' | 'role'
  | 'source' | 'orders_count' | 'revenue'
  | 'bot_subscribed' | 'channel_subscribed' | 'in_funnel'
  | 'first_touch'

export type ColumnDef = {
  id: ColumnId
  label: string
  sortable: boolean
  default?: boolean   // показана по умолчанию
  width?: string
}

export const COLUMNS: ColumnDef[] = [
  { id: 'name',             label: 'Имя',                      sortable: true,  default: true },
  { id: 'client_type',      label: 'Тип',                      sortable: true,  default: true },
  { id: 'role',             label: 'Роль',                     sortable: true,  default: true },
  { id: 'email',            label: 'Email',                    sortable: true,  default: true },
  { id: 'phone',            label: 'Телефон',                  sortable: true,  default: true },
  { id: 'telegram',         label: 'Telegram',                 sortable: true,  default: true },
  { id: 'tags',             label: 'Теги',                     sortable: true,  default: true },
  { id: 'last_activity_at', label: 'Последняя активность',     sortable: true,  default: true },
  { id: 'created_at',       label: 'Создан',                   sortable: true },
  { id: 'source',           label: 'Источник',                 sortable: true },
  { id: 'first_touch',      label: 'Точка входа',              sortable: true },
  { id: 'orders_count',     label: 'Заказов',                  sortable: true },
  { id: 'revenue',          label: 'Сумма заказов',            sortable: true },
  { id: 'bot_subscribed',   label: 'Подписан на бота',         sortable: true },
  { id: 'channel_subscribed', label: 'Подписан на канал',      sortable: true },
  { id: 'in_funnel',        label: 'В воронке',                sortable: true },
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

export function applyFilters(rows: CustomerRow[], filters: FilterCondition[] | FilterState): CustomerRow[] {
  const state = Array.isArray(filters) ? { combinator: 'and' as FilterCombinator, conditions: filters } : filters
  if (state.conditions.length === 0) return rows
  return rows.filter(row => {
    const tester = (f: FilterCondition) => {
      const matches = matchFilter(row, f)
      return f.negate ? !matches : matches
    }
    return state.combinator === 'or'
      ? state.conditions.some(tester)
      : state.conditions.every(tester)
  })
}

export function matchFilter(row: CustomerRow, f: FilterCondition): boolean {
  switch (f.field) {
    case 'client_type': {
      const v = f.value
      if (!Array.isArray(v) || v.length === 0) return true
      return v.includes(deriveClientType(row))
    }
    case 'role_code': {
      const v = f.value
      if (!Array.isArray(v) || v.length === 0) return true
      if (!row.role_code) return v.includes('__none__')
      return v.includes(row.role_code)
    }
    case 'has_email':    return f.value === null ? true : Boolean(row.email) === f.value
    case 'has_phone':    return f.value === null ? true : Boolean(row.phone) === f.value
    case 'has_telegram': return f.value === null ? true : Boolean(row.telegram_id || row.telegram_username) === f.value
    case 'in_funnel':    return f.value === null ? true : Boolean(row.in_funnel) === f.value
    case 'subscribed_bot_ids': {
      const want = f.value as string[]
      if (!Array.isArray(want) || want.length === 0) return true
      const have = row.subscribed_bot_ids ?? []
      return want.some(id => have.includes(id))
    }
    case 'blocked_bot_ids': {
      const want = f.value as string[]
      if (!Array.isArray(want) || want.length === 0) return true
      const have = row.blocked_bot_ids ?? []
      return want.some(id => have.includes(id))
    }
    case 'subscribed_channel_ids': {
      const want = f.value as string[]
      if (!Array.isArray(want) || want.length === 0) return true
      const have = row.subscribed_channel_ids ?? []
      return want.some(id => have.includes(id))
    }
    case 'paid_product_ids': {
      const want = f.value as string[]
      if (!Array.isArray(want) || want.length === 0) return true
      const have = row.paid_product_ids ?? []
      return want.some(id => have.includes(id))
    }
    case 'tags': {
      const want = f.value as string[]
      if (!Array.isArray(want) || want.length === 0) return true
      const have = row.tags ?? []
      return want.some(t => have.includes(t))
    }
    case 'source_name': {
      const q = ((f.value as string) ?? '').toLowerCase().trim()
      if (!q) return true
      return (row.source_name ?? '').toLowerCase().includes(q)
    }
    case 'first_touch_kind': {
      const v = f.value
      if (!Array.isArray(v) || v.length === 0) return true
      return v.includes(row.first_touch_kind ?? '')
    }
    case 'first_touch_source': {
      const q = ((f.value as string) ?? '').toLowerCase().trim()
      if (!q) return true
      return (row.first_touch_source ?? '').toLowerCase().includes(q)
    }
    case 'utm_campaign': {
      const q = ((f.value as string) ?? '').toLowerCase().trim()
      if (!q) return true
      const utm = row.first_touch_utm
      return Boolean(utm && (utm.utm_campaign ?? '').toLowerCase().includes(q))
    }
    case 'utm_source': {
      const q = ((f.value as string) ?? '').toLowerCase().trim()
      if (!q) return true
      const utm = row.first_touch_utm
      return Boolean(utm && (utm.utm_source ?? utm.src ?? '').toLowerCase().includes(q))
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
        (row.telegram_username ?? '').toLowerCase().includes(q) ||
        (row.public_code ?? '').toLowerCase().includes(q) ||
        (row.instagram ?? '').toLowerCase().includes(q) ||
        (row.vk ?? '').toLowerCase().includes(q) ||
        (row.whatsapp ?? '').toLowerCase().includes(q) ||
        (row.role_label ?? '').toLowerCase().includes(q)
      )
    }
    default: return true
  }
}

export function sortRows(rows: CustomerRow[], col: ColumnId, dir: SortDirection): CustomerRow[] {
  const m = dir === 'asc' ? 1 : -1
  function getKey(r: CustomerRow): string | number {
    switch (col) {
      case 'name':             return (r.full_name ?? r.telegram_username ?? r.public_code ?? '').toLowerCase()
      case 'email':            return (r.email ?? '').toLowerCase()
      case 'phone':            return (r.phone ?? '').toLowerCase()
      case 'telegram':         return (r.telegram_username ?? '').toLowerCase()
      case 'tags':             return (r.tags ?? []).join(' ').toLowerCase()
      case 'created_at':       return new Date(r.created_at).getTime()
      case 'last_activity_at': return new Date(r.last_activity_at ?? r.created_at).getTime()
      case 'client_type':      return CLIENT_TYPE_LABELS[deriveClientType(r)]
      case 'role':             return (r.role_label ?? 'я').toLowerCase()
      case 'source':           return (r.source_name ?? '').toLowerCase()
      case 'orders_count':     return r.orders_count ?? 0
      case 'revenue':          return r.revenue ?? 0
      case 'bot_subscribed':   return r.bot_subscribed ? 1 : 0
      case 'channel_subscribed': return r.channel_subscribed ? 1 : 0
      case 'in_funnel':        return r.in_funnel ? 1 : 0
      case 'first_touch':      return (r.first_touch_kind ?? '').toLowerCase()
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
    case 'role':             return r.role_label ?? ''
    case 'email':            return r.email ?? ''
    case 'phone':            return r.phone ?? ''
    case 'telegram':         return r.telegram_username ? `@${r.telegram_username}` : ''
    case 'tags':             return (r.tags ?? []).join('; ')
    case 'created_at':       return formatDateTime(r.created_at)
    case 'last_activity_at': return formatDateTime(r.last_activity_at ?? r.created_at)
    case 'source':           return r.source_name ?? ''
    case 'first_touch': {
      const k = r.first_touch_kind
      const meta = k ? FIRST_TOUCH_KIND_LABELS[k] : null
      const src = r.first_touch_source ?? ''
      return meta ? `${meta.label}${src ? ': ' + src : ''}` : src
    }
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
