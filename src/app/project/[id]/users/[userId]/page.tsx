'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import ActivityTimeline from '@/components/users/ActivityTimeline'
import { Modal } from '@/components/ui/Modal'
import {
  CustomerRow, deriveClientType, CLIENT_TYPE_LABELS, CLIENT_TYPE_COLOR, CLIENT_TYPE_HINT,
  FIRST_TOUCH_KIND_LABELS, customerDisplayName, customerAvatarLetter,
  formatDate, formatDateTime, formatRelative, formatMoney,
} from '@/lib/users/config'

type TabId = 'activity' | 'orders' | 'access' | 'bots' | 'funnels' | 'touchpoints' | 'notes'

export default function UserCardPage() {
  const supabase = createClient()
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const userId = params.userId as string

  const [customer, setCustomer] = useState<CustomerRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabId>('activity')
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState<Partial<CustomerRow>>({})
  const [showRoleEditor, setShowRoleEditor] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  async function load() {
    setLoading(true)
    const [cRes, aRes] = await Promise.all([
      supabase.from('customers_with_role').select('*').eq('id', userId).single(),
      supabase.from('customer_aggregates').select('last_activity_at, orders_count, paid_orders_count, total_amount, revenue, has_paid, in_funnel').eq('customer_id', userId).maybeSingle(),
    ])
    if (cRes.data) {
      setCustomer({ ...(cRes.data as CustomerRow), ...((aRes.data ?? {}) as Partial<CustomerRow>) })
    }
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [userId])

  function startEdit() {
    // Кнопка ✎ рядом с именем в шапке. Редактируется ТОЛЬКО full_name —
    // остальные контакты (email/phone/telegram/...) защищены от случайной
    // правки и редактируются только через вкладку «Поля» (per-field).
    if (!customer) return
    setEditData({ full_name: customer.full_name })
    setEditMode(true)
  }

  async function saveEdit() {
    if (!customer) return
    setSaving(true)
    const update: Partial<CustomerRow> = { full_name: editData.full_name ?? null }
    const { data } = await supabase.from('customers').update(update).eq('id', customer.id).select().single()
    if (data) setCustomer(prev => prev ? { ...prev, ...(data as CustomerRow) } : prev)
    setSaving(false)
    setEditMode(false)
    setEditData({})
  }

  async function toggleBlock() {
    if (!customer) return
    const { data } = await supabase.from('customers').update({ is_blocked: !customer.is_blocked }).eq('id', customer.id).select().single()
    if (data) setCustomer(prev => prev ? { ...prev, ...(data as CustomerRow) } : prev)
  }

  async function handleDelete() {
    if (!customer) return
    if (!deleteConfirm) { setDeleteConfirm(true); return }
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/customers/${customer.id}/delete`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setDeleteError(json?.error || `HTTP ${res.status}`)
        setDeleting(false)
        return
      }
      router.push(`/project/${projectId}/users`)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Ошибка')
      setDeleting(false)
    }
  }

  if (loading) {
    return <div className="text-sm text-gray-400">Загрузка…</div>
  }
  if (!customer) {
    return (
      <div className="text-center py-16">
        <div className="text-3xl mb-2">🔍</div>
        <h2 className="font-semibold text-gray-900">Пользователь не найден</h2>
        <button onClick={() => router.push(`/project/${projectId}/users`)} className="text-sm text-[#6A55F8] hover:underline mt-2">
          ← Назад к списку
        </button>
      </div>
    )
  }

  const type = deriveClientType(customer)
  const typeColor = CLIENT_TYPE_COLOR[type]

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Back */}
      <button
        onClick={() => router.push(`/project/${projectId}/users`)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
        </svg>
        К пользователям
      </button>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4 min-w-0 flex-1">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-semibold text-xl flex-shrink-0" style={{ backgroundColor: '#6A55F8' }}>
              {customerAvatarLetter(customer)}
            </div>
            <div className="min-w-0 flex-1">
              {editMode ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    autoFocus
                    value={editData.full_name ?? ''}
                    onChange={e => setEditData(d => ({ ...d, full_name: e.target.value }))}
                    placeholder="Имя"
                    onKeyDown={e => { if (e.key === 'Escape') { setEditMode(false); setEditData({}) } }}
                    className="text-2xl font-semibold text-gray-900 border-b border-[#6A55F8] focus:outline-none bg-transparent flex-1"
                  />
                  <button onClick={saveEdit} disabled={saving} className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-[#6A55F8] text-white hover:bg-[#5040D6] disabled:opacity-50">
                    {saving ? '…' : 'Сохранить'}
                  </button>
                  <button onClick={() => { setEditMode(false); setEditData({}) }} className="text-xs px-2.5 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
                    Отмена
                  </button>
                </div>
              ) : (() => {
                const isCodeOnly = !customer.full_name && !customer.telegram_username
                return (
                  <div className="group flex items-center gap-2">
                    <h1 className={`text-2xl font-semibold truncate ${isCodeOnly ? 'text-gray-500 font-mono' : 'text-gray-900'}`}>
                      {customerDisplayName(customer)}
                    </h1>
                    <button
                      onClick={startEdit}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-[#6A55F8] hover:bg-[#F0EDFF] transition-colors"
                      title="Изменить имя"
                      aria-label="Изменить имя"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                      </svg>
                    </button>
                  </div>
                )
              })()}
              {customer.public_code && (customer.full_name || customer.telegram_username) && (
                <div className="text-xs text-gray-400 font-mono mt-0.5">{customer.public_code}</div>
              )}

              <div className="flex items-center gap-2 flex-wrap mt-1.5">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: typeColor.bg, color: typeColor.fg }}
                  title={`Тип (этап воронки): ${CLIENT_TYPE_HINT[type]}`}
                >
                  {CLIENT_TYPE_LABELS[type]}
                </span>
                {customer.role_label && (() => {
                  const isAdmin = customer.role_access_type === 'admin_panel'
                  const isStudent = customer.role_access_type === 'student_panel'
                  const c = isAdmin
                    ? { bg: '#EDE9FF', fg: '#6A55F8' }
                    : isStudent
                    ? { bg: '#D1FAE5', fg: '#059669' }
                    : { bg: '#F1F5F9', fg: '#64748B' }
                  return (
                    <button
                      onClick={() => setShowRoleEditor(true)}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium hover:ring-2 hover:ring-offset-1 transition-all"
                      style={{ backgroundColor: c.bg, color: c.fg }}
                      title="Кликните, чтобы изменить роль"
                    >
                      🔑 {customer.role_label}
                    </button>
                  )
                })()}
                {!customer.role_label && customer.email && (
                  <button
                    onClick={() => setShowRoleEditor(true)}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-dashed border-gray-300 text-gray-500 hover:border-[#6A55F8] hover:text-[#6A55F8]"
                    title="Назначить роль / пригласить в проект"
                  >
                    🔑 Назначить роль
                  </button>
                )}
                {customer.is_blocked && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600">
                    Заблокирован
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={toggleBlock}
              className="text-sm px-3 py-1.5 rounded-lg border font-medium"
              style={customer.is_blocked
                ? { backgroundColor: '#D1FAE5', color: '#10B981', borderColor: '#10B981' }
                : { backgroundColor: '#FEE2E2', color: '#EF4444', borderColor: '#FECACA' }}
            >
              {customer.is_blocked ? 'Разблокировать' : 'Заблокировать'}
            </button>

            {deleteConfirm ? (
              <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                <span className="text-xs text-red-600 font-medium">Удалить навсегда?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded px-2 py-0.5 disabled:opacity-50"
                >
                  {deleting ? 'Удаляю…' : 'Да'}
                </button>
                <button
                  onClick={() => { setDeleteConfirm(false); setDeleteError('') }}
                  className="text-xs text-gray-400 hover:text-gray-600 px-1"
                >
                  Отмена
                </button>
              </div>
            ) : (
              <button
                onClick={handleDelete}
                className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-300"
                title="Удалить пользователя полностью"
              >
                🗑
              </button>
            )}
          </div>
        </div>
        {deleteError && <p className="text-xs text-red-500">{deleteError}</p>}

        {/* Metrics row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
          <Metric
            label="Зарегистрирован"
            value={formatDate(customer.created_at)}
            sub={formatDateTime(customer.created_at)}
          />
          <Metric
            label="Последняя активность"
            value={formatRelative(customer.last_activity_at ?? customer.created_at)}
            sub={formatDateTime(customer.last_activity_at ?? customer.created_at)}
          />
          <Metric label="Заказов всего" value={String(customer.orders_count ?? 0)} />
          <Metric label="Оплачено заказов" value={String(customer.paid_orders_count ?? 0)} />
          <Metric label="Сумма заказов" value={formatMoney(customer.total_amount ?? 0)} />
          <Metric label="Сумма оплат" value={formatMoney(customer.revenue ?? 0)} />
        </div>

        <ContactsBlock customer={customer} onUpdated={c => setCustomer(prev => prev ? { ...prev, ...c } : prev)} />

        {customer.first_touch_at && (
          <FirstTouchBlock customer={customer} onOpenAll={() => setTab('touchpoints')} />
        )}

        {customer.source_name && !customer.first_touch_at && (
          <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
            <span className="text-xs text-gray-400">Источник:</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#F0EDFF] text-[#6A55F8]">
              📍 {customer.source_name}
            </span>
          </div>
        )}

        <SubscriptionsBlock customerId={customer.id} />

        <TagsBlock customer={customer} onUpdated={c => setCustomer(prev => prev ? { ...prev, ...c } : prev)} />

      </div>

      {showRoleEditor && (
        <RoleEditorModal
          customer={customer}
          onClose={() => setShowRoleEditor(false)}
          onChanged={() => { setShowRoleEditor(false); load() }}
        />
      )}

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {([
            { id: 'activity',    label: 'Активность',   icon: '📊' },
            { id: 'orders',      label: 'Заказы',       icon: '🛒' },
            { id: 'access',      label: 'Продукты',     icon: '📚' },
            { id: 'bots',        label: 'Чат-боты',     icon: '🤖' },
            { id: 'funnels',     label: 'Воронки',      icon: '🎯' },
            { id: 'touchpoints', label: 'Точки входа',  icon: '📍' },
            { id: 'notes',       label: 'Заметки',      icon: '📌' },
          ] as { id: TabId; label: string; icon: string }[]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                tab === t.id
                  ? 'text-[#6A55F8] border-[#6A55F8]'
                  : 'text-gray-500 border-transparent hover:text-gray-800'
              }`}
            >
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
        <div className="p-5">
          {tab === 'activity' && <ActivityTimeline customerId={customer.id} />}
          {tab === 'orders' && <OrdersTab customerId={customer.id} />}
          {tab === 'access' && <AccessTab projectId={customer.project_id} customerId={customer.id} />}
          {tab === 'bots' && <BotsTab customerId={customer.id} />}
          {tab === 'funnels' && <FunnelsTab customerId={customer.id} />}
          {tab === 'touchpoints' && <TouchpointsTab customerId={customer.id} />}
          {tab === 'notes' && <NotesTab customerId={customer.id} projectId={customer.project_id} />}
        </div>
      </div>
    </div>
  )
}

// ─── First-touch block ───
function FirstTouchBlock({ customer, onOpenAll }: { customer: CustomerRow; onOpenAll: () => void }) {
  const supabase = createClient()
  const meta = customer.first_touch_kind ? FIRST_TOUCH_KIND_LABELS[customer.first_touch_kind] : null
  const utm = customer.first_touch_utm
  const [tpCount, setTpCount] = useState<number | null>(null)
  const [landingName, setLandingName] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadAll() {
      const [tpRes, landingRes] = await Promise.all([
        supabase
          .from('customer_touchpoints')
          .select('id', { count: 'exact', head: true })
          .eq('customer_id', customer.id),
        customer.first_touch_landing_id
          ? supabase.from('landings').select('name').eq('id', customer.first_touch_landing_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      if (cancelled) return
      setTpCount(tpRes.count ?? 0)
      const ld = (landingRes.data ?? null) as { name: string } | null
      setLandingName(ld?.name ?? null)
    }
    loadAll()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.id])

  // Человеко-читаемое описание источника
  const sourceDisplay = (() => {
    const src = customer.first_touch_source
    if (!src) return 'Неизвестный заход'
    if (src === 'direct') return 'Прямой заход'
    if (src === 'telegram_bot' || customer.first_touch_kind === 'bot') return src
    return src
  })()

  // Описание точки входа: «<источник> → <название лендинга>»
  const entryLabel = (() => {
    if (customer.first_touch_kind === 'landing') {
      if (landingName) return `${sourceDisplay} → ${landingName}`
      return sourceDisplay
    }
    if (customer.first_touch_kind === 'bot') return sourceDisplay
    return sourceDisplay
  })()

  return (
    <div className="border-t border-gray-100 pt-3 mt-1">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Первая точка входа в воронку</div>
        {tpCount !== null && tpCount > 1 && (
          <button
            onClick={onOpenAll}
            className="text-xs text-[#6A55F8] hover:underline font-medium"
          >
            Все точки входа ({tpCount}) →
          </button>
        )}
      </div>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="bg-gradient-to-br from-[#F0EDFF] to-[#E5DFFF] border border-[#D8CFFF] rounded-xl px-3 py-2 inline-flex items-center gap-2">
          <span className="text-base">{meta?.icon ?? '↗'}</span>
          <div>
            <div className="text-[11px] text-gray-500 leading-none">{meta?.label ?? 'Источник'}</div>
            <div className="text-sm font-semibold text-gray-900 leading-tight mt-0.5">
              {entryLabel}
            </div>
          </div>
        </div>
        {utm && Object.keys(utm).length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            {(['utm_campaign', 'utm_source', 'utm_medium', 'utm_content', 'utm_term', 'src'] as const).map(k => {
              const v = utm[k]
              if (!v) return null
              return (
                <span key={k} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 rounded-md px-2 py-0.5">
                  <span className="text-gray-400">{k.replace('utm_', '')}:</span>
                  <span className="font-medium">{v}</span>
                </span>
              )
            })}
          </div>
        )}
      </div>
      <div className="text-xs text-gray-400 mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
        <span>{formatDateTime(customer.first_touch_at)}</span>
        {customer.first_touch_referrer && (
          <span className="truncate max-w-md" title={customer.first_touch_referrer}>↘ {customer.first_touch_referrer}</span>
        )}
      </div>
    </div>
  )
}

// ─── Helpers ───
function Metric({ label, value, sub, hint }: { label: string; value: string; sub?: string; hint?: string }) {
  return (
    <div className="bg-[#FAFAFD] rounded-xl px-3 py-2.5" title={hint}>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-sm font-semibold text-gray-900 mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

// ─── OrdersTab ───
type OrderRow = {
  id: string
  product_id: string | null
  tariff_id: string | null
  amount: number
  paid_amount: number | null
  status: string
  customer_email: string | null
  customer_name: string | null
  notes: string | null
  created_at: string
  updated_at: string | null
}

const ORDER_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  new:         { label: 'Новый',     bg: '#EDE9FF', fg: '#6A55F8' },
  in_progress: { label: 'В работе',  bg: '#FEF3C7', fg: '#F59E0B' },
  paid:        { label: 'Оплачен',   bg: '#D1FAE5', fg: '#10B981' },
  partial:     { label: 'Частично',  bg: '#CFFAFE', fg: '#06B6D4' },
  refund:      { label: 'Возврат',   bg: '#FEE2E2', fg: '#EF4444' },
  cancelled:   { label: 'Отменён',   bg: '#F1F5F9', fg: '#94A3B8' },
}

function OrdersTab({ customerId }: { customerId: string }) {
  const supabase = createClient()
  const [orders, setOrders] = useState<OrderRow[] | null>(null)
  const [products, setProducts] = useState<Map<string, string>>(new Map())
  const [tariffs, setTariffs] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    let cancelled = false
    async function load() {
      const oRes = await supabase.from('orders').select('*').eq('customer_id', customerId).order('created_at', { ascending: false })
      const oList = (oRes.data ?? []) as OrderRow[]
      const pIds = Array.from(new Set(oList.map(o => o.product_id).filter(Boolean))) as string[]
      const tIds = Array.from(new Set(oList.map(o => o.tariff_id).filter(Boolean))) as string[]
      const [pRes, tRes] = await Promise.all([
        pIds.length > 0 ? supabase.from('products').select('id, name').in('id', pIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        tIds.length > 0 ? supabase.from('tariffs').select('id, name').in('id', tIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ])
      if (cancelled) return
      setOrders(oList)
      setProducts(new Map(((pRes.data ?? []) as { id: string; name: string }[]).map(p => [p.id, p.name])))
      setTariffs(new Map(((tRes.data ?? []) as { id: string; name: string }[]).map(t => [t.id, t.name])))
    }
    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  if (orders === null) return <div className="text-sm text-gray-400 py-3">Загрузка…</div>
  if (orders.length === 0) return <div className="text-center py-12 text-gray-400"><div className="text-3xl mb-2">🛒</div><div className="text-sm">Заказов нет</div></div>

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
          <th className="pb-2 font-medium">Продукт</th>
          <th className="pb-2 font-medium">Тариф</th>
          <th className="pb-2 font-medium">Сумма</th>
          <th className="pb-2 font-medium">Оплачено</th>
          <th className="pb-2 font-medium">Статус</th>
          <th className="pb-2 font-medium">Дата</th>
        </tr>
      </thead>
      <tbody>
        {orders.map(o => {
          const st = ORDER_STATUS[o.status] ?? { label: o.status, bg: '#F1F5F9', fg: '#64748B' }
          return (
            <tr key={o.id} className="border-b border-gray-50 last:border-0">
              <td className="py-2 text-gray-800">{(o.product_id && products.get(o.product_id)) || '—'}</td>
              <td className="py-2 text-gray-500">{(o.tariff_id && tariffs.get(o.tariff_id)) || '—'}</td>
              <td className="py-2 font-medium text-gray-900">{formatMoney(o.amount)}</td>
              <td className="py-2 text-gray-600">{formatMoney(o.paid_amount ?? 0)}</td>
              <td className="py-2">
                <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: st.bg, color: st.fg }}>
                  {st.label}
                </span>
              </td>
              <td className="py-2 text-gray-400">{formatDateTime(o.created_at)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ─── AccessTab ───
type AccessRow = {
  id: string
  granted_at: string
  expires_at: string | null
  status: string
  is_expired: boolean
  source: string
  source_order_id: string | null
  notes: string | null
  tariff_id: string
  tariff_name: string
  tariff_price: number
  product_name: string
  access_type: string
}

type TariffOption = {
  id: string
  name: string
  price: number
  product_name: string
  access_type: string
  access_days: number | null
  is_active: boolean
  product_active: boolean
}

function AccessTab({ projectId, customerId }: { projectId: string; customerId: string }) {
  const [access, setAccess] = useState<AccessRow[] | null>(null)
  const [tariffs, setTariffs] = useState<TariffOption[]>([])
  const [error, setError] = useState('')
  const [showGrant, setShowGrant] = useState(false)
  const [grantTariffId, setGrantTariffId] = useState('')
  const [grantMode, setGrantMode] = useState<'free' | 'create_paid_order'>('free')
  const [grantNotes, setGrantNotes] = useState('')
  const [granting, setGranting] = useState(false)

  async function load() {
    setError('')
    const [a, t] = await Promise.all([
      fetch(`/api/projects/${projectId}/customers/${customerId}/access`).then(r => r.json()),
      fetch(`/api/projects/${projectId}/tariffs`).then(r => r.json()),
    ])
    setAccess(a.access ?? [])
    setTariffs((t.tariffs ?? []).filter((x: TariffOption) => x.is_active && x.product_active))
    if (!grantTariffId && t.tariffs?.[0]) setGrantTariffId(t.tariffs[0].id)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [customerId])

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault()
    if (!grantTariffId) return
    setGranting(true)
    setError('')
    const res = await fetch(`/api/projects/${projectId}/customers/${customerId}/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tariff_id: grantTariffId, mode: grantMode, notes: grantNotes || undefined }),
    })
    setGranting(false)
    if (!res.ok) {
      const d = await res.json()
      setError(d.error || 'Не удалось выдать доступ')
      return
    }
    setShowGrant(false)
    setGrantNotes('')
    await load()
  }

  async function handleRevoke(accessId: string, label: string) {
    if (!confirm(`Отозвать доступ к «${label}»? Клиент сразу потеряет доступ к курсам этого тарифа.`)) return
    const res = await fetch(`/api/projects/${projectId}/customer-access/${accessId}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error || 'Не удалось отозвать')
      return
    }
    await load()
  }

  function formatExpires(row: AccessRow): string {
    if (!row.expires_at) return 'Бессрочно'
    const d = new Date(row.expires_at)
    if (row.is_expired) return `Истёк ${d.toLocaleDateString('ru')}`
    return `до ${d.toLocaleDateString('ru')}`
  }

  function statusBadge(row: AccessRow) {
    if (row.status === 'revoked') return { bg: '#FEE2E2', fg: '#EF4444', label: 'Отозван' }
    if (row.is_expired) return { bg: '#FEF3C7', fg: '#F59E0B', label: 'Истёк' }
    return { bg: '#D1FAE5', fg: '#10B981', label: 'Активен' }
  }

  if (access === null) return <div className="text-sm text-gray-400 py-3">Загрузка…</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <p className="text-xs text-gray-500">
          {access.length === 0 ? 'Доступов нет' : `${access.length} ${access.length === 1 ? 'доступ' : 'доступов'}`}
        </p>
        <button
          onClick={() => setShowGrant(true)}
          className="px-3 py-1.5 rounded-lg bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium"
        >
          + Выдать доступ
        </button>
      </div>

      {error && <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

      {access.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-3xl mb-2">🔑</div>
          <div className="text-sm">Доступов к продуктам пока нет</div>
        </div>
      ) : (
        <div className="space-y-2">
          {access.map(a => {
            const badge = statusBadge(a)
            return (
              <div key={a.id} className="bg-[#FAFAFD] rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{a.product_name}</div>
                  <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>{a.tariff_name}</span>
                    <span className="text-gray-300">·</span>
                    <span>{formatExpires(a)}</span>
                    <span className="text-gray-300">·</span>
                    <span>выдан {new Date(a.granted_at).toLocaleDateString('ru')}</span>
                    {a.source === 'order' && a.source_order_id && <><span className="text-gray-300">·</span><span>заказ</span></>}
                    {a.source === 'manual' && <><span className="text-gray-300">·</span><span>вручную</span></>}
                  </div>
                  {a.notes && <div className="text-xs text-gray-400 mt-1 italic">«{a.notes}»</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: badge.bg, color: badge.fg }}>
                    {badge.label}
                  </span>
                  {a.status === 'active' && !a.is_expired && (
                    <button
                      onClick={() => handleRevoke(a.id, a.product_name)}
                      className="text-sm text-gray-400 hover:text-red-600 px-1"
                      title="Отозвать"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showGrant && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleGrant} className="bg-white rounded-2xl border border-gray-100 p-8 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Выдать доступ</h2>
            <p className="text-sm text-gray-500 mb-6">Выберите продукт + тариф, и каким способом выдать доступ.</p>

            {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Продукт и тариф</label>
                {tariffs.length === 0 ? (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                    Нет активных тарифов в проекте. Создайте продукт с тарифом в разделе «Продукты».
                  </div>
                ) : (
                  <select
                    value={grantTariffId}
                    onChange={e => setGrantTariffId(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm"
                  >
                    {tariffs.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.product_name} · {t.name} {t.price > 0 ? `· ${formatMoney(t.price)}` : '· бесплатно'}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Способ выдачи</label>
                <div className="space-y-2">
                  <label className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer ${grantMode === 'free' ? 'border-[#6A55F8]/40 bg-[#F8F6FF]' : 'border-gray-200'}`}>
                    <input type="radio" name="grant_mode" value="free" checked={grantMode === 'free'} onChange={() => setGrantMode('free')} className="mt-0.5" />
                    <div>
                      <div className="text-sm font-medium text-gray-900">Бесплатно</div>
                      <div className="text-xs text-gray-500 mt-0.5">Доступ открывается сразу. Создаётся заказ-подарок (₽0) для аудита.</div>
                    </div>
                  </label>
                  <label className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer ${grantMode === 'create_paid_order' ? 'border-[#6A55F8]/40 bg-[#F8F6FF]' : 'border-gray-200'}`}>
                    <input type="radio" name="grant_mode" value="create_paid_order" checked={grantMode === 'create_paid_order'} onChange={() => setGrantMode('create_paid_order')} className="mt-0.5" />
                    <div>
                      <div className="text-sm font-medium text-gray-900">Создать заказ к оплате</div>
                      <div className="text-xs text-gray-500 mt-0.5">Заказ создаётся в статусе «Новый». Доступ откроется когда заказ будет помечен оплаченным.</div>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Заметка (необязательно)</label>
                <textarea
                  value={grantNotes}
                  onChange={e => setGrantNotes(e.target.value)}
                  rows={2}
                  placeholder="Промо для давнего клиента / Тестовый доступ / …"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-6">
              <button type="button" onClick={() => { setShowGrant(false); setGrantNotes(''); setError('') }} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm">Отмена</button>
              <button type="submit" disabled={granting || tariffs.length === 0} className="flex-1 py-2.5 rounded-lg bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium disabled:opacity-50">
                {granting ? 'Сохраняем…' : grantMode === 'free' ? 'Выдать бесплатно' : 'Создать заказ'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

// ─── FunnelsTab ───
type Position = {
  funnel_id: string
  stage_id: string | null
  entered_at: string | null
  funnel_name: string | null
  stage_name: string | null
}

function FunnelsTab({ customerId }: { customerId: string }) {
  const supabase = createClient()
  const [positions, setPositions] = useState<Position[] | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: posData } = await supabase
        .from('customer_funnel_positions')
        .select('funnel_id, stage_id, entered_at')
        .eq('customer_id', customerId)
      const positions = (posData ?? []) as { funnel_id: string; stage_id: string | null; entered_at: string | null }[]

      const fIds = Array.from(new Set(positions.map(p => p.funnel_id)))
      const sIds = Array.from(new Set(positions.map(p => p.stage_id).filter(Boolean) as string[]))

      const [fRes, sRes] = await Promise.all([
        fIds.length ? supabase.from('funnels').select('id, name').in('id', fIds) : Promise.resolve({ data: [] }),
        sIds.length ? supabase.from('funnel_stages').select('id, name').in('id', sIds) : Promise.resolve({ data: [] }),
      ])
      const fMap = new Map(((fRes.data ?? []) as { id: string; name: string }[]).map(f => [f.id, f.name]))
      const sMap = new Map(((sRes.data ?? []) as { id: string; name: string }[]).map(s => [s.id, s.name]))

      if (cancelled) return
      setPositions(positions.map(p => ({
        funnel_id: p.funnel_id,
        stage_id: p.stage_id,
        entered_at: p.entered_at,
        funnel_name: fMap.get(p.funnel_id) ?? null,
        stage_name: p.stage_id ? sMap.get(p.stage_id) ?? null : null,
      })))
    }
    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  if (positions === null) return <div className="text-sm text-gray-400 py-3">Загрузка…</div>
  if (positions.length === 0) return <div className="text-center py-12 text-gray-400"><div className="text-3xl mb-2">🎯</div><div className="text-sm">Не в одной воронке</div></div>

  return (
    <div className="space-y-2">
      {positions.map(p => (
        <div key={p.funnel_id} className="flex items-center justify-between bg-[#FAFAFD] rounded-xl px-4 py-3">
          <div>
            <div className="text-sm font-medium text-gray-900">{p.funnel_name ?? '—'}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Этап: <span className="font-medium text-gray-700">{p.stage_name ?? '—'}</span>
            </div>
          </div>
          <div className="text-xs text-gray-400">
            {p.entered_at ? formatRelative(p.entered_at) : ''}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── TouchpointsTab ───
type Touchpoint = {
  id: string
  ts: string
  kind: string
  source: string | null
  landing_id: string | null
  referrer: string | null
  url: string | null
  utm: Record<string, string> | null
}

function TouchpointsTab({ customerId }: { customerId: string }) {
  const supabase = createClient()
  const [items, setItems] = useState<Touchpoint[] | null>(null)
  const [landingNames, setLandingNames] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('customer_touchpoints')
        .select('id, ts, kind, source, landing_id, referrer, url, utm')
        .eq('customer_id', customerId)
        .order('ts', { ascending: false })
      const list = (data ?? []) as Touchpoint[]
      const lIds = Array.from(new Set(list.map(t => t.landing_id).filter(Boolean) as string[]))
      let lm = new Map<string, string>()
      if (lIds.length > 0) {
        const { data: lrows } = await supabase.from('landings').select('id, name').in('id', lIds)
        lm = new Map(((lrows ?? []) as { id: string; name: string }[]).map(l => [l.id, l.name]))
      }
      if (cancelled) return
      setItems(list)
      setLandingNames(lm)
    }
    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  if (items === null) return <div className="text-sm text-gray-400 py-3">Загрузка…</div>
  if (items.length === 0) return (
    <div className="text-center py-12 text-gray-400">
      <div className="text-3xl mb-2">📍</div>
      <div className="text-sm">Точек входа ещё нет</div>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">
        Полная история всех точек входа этого пользователя в воронку. Самая верхняя — последняя.
      </div>
      {items.map((t, i) => {
        const meta = FIRST_TOUCH_KIND_LABELS[t.kind] ?? { icon: '↗', label: t.kind }
        const isFirst = i === items.length - 1
        return (
          <div
            key={t.id}
            className={`rounded-xl border p-3 ${isFirst ? 'border-[#6A55F8] bg-[#FAF8FF]' : 'border-gray-100 bg-white'}`}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <span className="text-lg">{meta.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{meta.label}</span>
                    {t.source && <span className="text-sm text-gray-700">· {t.source}</span>}
                    {isFirst && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#6A55F8] text-white font-semibold">первая</span>}
                  </div>
                  {t.landing_id && landingNames.get(t.landing_id) && (
                    <div className="text-xs text-gray-500 mt-0.5">Лендинг: <span className="font-medium">{landingNames.get(t.landing_id)}</span></div>
                  )}
                </div>
              </div>
              <div className="text-xs text-gray-400">{formatDateTime(t.ts)}</div>
            </div>
            {t.utm && Object.keys(t.utm).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {Object.entries(t.utm).map(([k, v]) => (
                  <span key={k} className="inline-flex items-center gap-1 text-[11px] bg-gray-100 text-gray-700 rounded-md px-1.5 py-0.5">
                    <span className="text-gray-400">{k.replace('utm_', '')}:</span>
                    <span className="font-medium">{v}</span>
                  </span>
                ))}
              </div>
            )}
            {t.referrer && (
              <div className="text-[11px] text-gray-400 mt-1.5 truncate" title={t.referrer}>↘ {t.referrer}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Per-field редактор контактов: read-only по умолчанию, отдельная кнопка
// «Редактировать» рядом с каждым полем. Случайно стереть телефон или email
// невозможно — нужно явно нажать карандаш, потом «Сохранить».
function ContactFieldRow({
  label, type, placeholder, value, onSave, isLink, linkPrefix,
}: {
  label: string
  type: string
  placeholder?: string
  value: string | null
  onSave: (newValue: string | null) => Promise<{ ok: boolean; error?: string }>
  isLink?: boolean
  linkPrefix?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function startEdit() {
    setDraft(value ?? '')
    setError('')
    setEditing(true)
  }
  async function commit() {
    setSaving(true)
    setError('')
    const trimmed = draft.trim()
    const result = await onSave(trimmed === '' ? null : trimmed)
    setSaving(false)
    if (!result.ok) {
      setError(result.error ?? 'Не удалось сохранить')
      return
    }
    setEditing(false)
  }
  function cancel() {
    setDraft('')
    setEditing(false)
    setError('')
  }

  return (
    <div className="block">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <input
            type={type}
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={placeholder}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }}
            className="flex-1 border border-[#6A55F8] rounded-lg px-3 py-1.5 text-sm focus:outline-none"
          />
          <button onClick={commit} disabled={saving} className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-[#6A55F8] text-white hover:bg-[#5040D6] disabled:opacity-50">
            {saving ? '…' : 'Сохранить'}
          </button>
          <button onClick={cancel} className="text-xs px-2.5 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
            Отмена
          </button>
        </div>
      ) : (
        <div className="group flex items-center gap-2 min-h-[34px]">
          {value ? (
            isLink && linkPrefix ? (
              <a href={`${linkPrefix}${value}`} target="_blank" rel="noopener noreferrer" className="text-sm text-[#6A55F8] hover:underline truncate flex-1">
                {value}
              </a>
            ) : (
              <span className="text-sm text-gray-900 truncate flex-1">{value}</span>
            )
          ) : (
            <span className="text-sm text-gray-300 italic flex-1">не указан</span>
          )}
          <button
            onClick={startEdit}
            className="p-1 rounded text-gray-400 hover:text-[#6A55F8] hover:bg-[#F0EDFF] transition-colors shrink-0"
            title="Редактировать"
            aria-label="Редактировать"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
            </svg>
          </button>
        </div>
      )}
      {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
    </div>
  )
}
// ─── ContactsBlock (под Metric row в шапке карточки) ───
function ContactsBlock({ customer, onUpdated }: { customer: CustomerRow; onUpdated: (c: Partial<CustomerRow>) => void }) {
  const supabase = createClient()
  async function saveContact(key: keyof CustomerRow, newValue: string | null): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await supabase.from('customers').update({ [key]: newValue }).eq('id', customer.id).select().single()
    if (error) return { ok: false, error: error.message }
    if (data) onUpdated(data as Partial<CustomerRow>)
    return { ok: true }
  }

  type ContactField = {
    key: keyof CustomerRow
    label: string
    type: string
    placeholder?: string
    isLink?: boolean
    linkPrefix?: string
  }
  const contactFields: ContactField[] = [
    { key: 'email', label: 'Email', type: 'email', placeholder: 'name@example.com' },
    { key: 'phone', label: 'Телефон', type: 'tel', placeholder: '+7 999 123-45-67' },
    { key: 'telegram_username', label: 'Telegram', type: 'text', placeholder: 'username (без @)', isLink: true, linkPrefix: 'https://t.me/' },
    { key: 'instagram', label: 'Instagram', type: 'text', placeholder: 'username', isLink: true, linkPrefix: 'https://instagram.com/' },
    { key: 'vk', label: 'ВКонтакте', type: 'text', placeholder: 'id или username', isLink: true, linkPrefix: 'https://vk.com/' },
    { key: 'whatsapp', label: 'WhatsApp', type: 'tel', placeholder: '+7 999 123-45-67' },
  ]

  return (
    <div className="pt-4 border-t border-gray-100">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Контакты</h3>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-3">
        {contactFields.map(f => (
          <ContactFieldRow
            key={f.key}
            label={f.label}
            type={f.type}
            placeholder={f.placeholder}
            isLink={f.isLink}
            linkPrefix={f.linkPrefix}
            value={(customer[f.key] as string) ?? null}
            onSave={(v) => saveContact(f.key, v)}
          />
        ))}
      </div>
    </div>
  )
}

// ─── RoleEditorModal (открывается по клику на бейдж роли в шапке) ───
function RoleEditorModal({ customer, onClose, onChanged }: { customer: CustomerRow; onClose: () => void; onChanged: () => void }) {
  type ProjectRole = { id: string; code: string; label: string; access_type: string }
  const [roles, setRoles] = useState<ProjectRole[]>([])
  const [memberId, setMemberId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [rRes, mRes] = await Promise.all([
        fetch(`/api/projects/${customer.project_id}/roles`).then(r => r.json()),
        customer.user_id
          ? fetch(`/api/projects/${customer.project_id}/members`).then(r => r.json())
          : Promise.resolve({ members: [] }),
      ])
      if (cancelled) return
      const list = (rRes.roles ?? []) as ProjectRole[]
      setRoles(list)
      const me = (mRes.members ?? []).find((m: { user_id: string; id: string }) => m.user_id === customer.user_id)
      setMemberId(me?.id ?? null)
      const currentRole = list.find(r => r.label === customer.role_label)
      const fallback = list.find(r => r.code === 'student') ?? list.find(r => r.code === 'admin')
      setSelectedRoleId(currentRole?.id ?? fallback?.id ?? list[0]?.id ?? '')
      setLoaded(true)
    }
    load()
    return () => { cancelled = true }
  }, [customer.id, customer.user_id, customer.project_id, customer.role_label])

  async function handleSave() {
    if (!selectedRoleId) return
    setError('')
    setSaving(true)

    if (memberId) {
      // Уже есть membership — меняем роль
      const res = await fetch(`/api/projects/${customer.project_id}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_id: selectedRoleId }),
      })
      setSaving(false)
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || 'Не удалось изменить роль')
        return
      }
      onChanged()
      return
    }

    // Membership нет — приглашаем (или создаём membership через invite если user уже есть)
    if (!customer.email) {
      setSaving(false)
      setError('У клиента не указан email — добавьте его в контактах сверху')
      return
    }
    const res = await fetch('/api/team/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: customer.project_id, email: customer.email, role_id: selectedRoleId }),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json()
      setError(d.error || 'Не удалось пригласить')
      return
    }
    onChanged()
  }

  async function handleRemoveMember() {
    if (!memberId) return
    if (!confirm('Удалить из проекта? Доступ будет отозван.')) return
    setError('')
    const res = await fetch(`/api/projects/${customer.project_id}/members/${memberId}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error || 'Не удалось удалить')
      return
    }
    onChanged()
  }

  // Если customer = Владелец, не позволяем менять роль через эту модалку.
  if (customer.role_code === 'owner') {
    return (
      <Modal isOpen={true} onClose={onClose} title="Роль в проекте" maxWidth="md">
        <div className="p-6 space-y-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50/60 border border-amber-100 text-sm">
            <span>👑</span>
            <strong className="text-amber-800">Владелец проекта</strong>
          </div>
          <p className="text-sm text-gray-500">
            Роль владельца меняется только через передачу владения в Настройках проекта → Команда.
          </p>
        </div>
      </Modal>
    )
  }

  const isInvite = !memberId
  const titleText = isInvite ? (customer.user_id ? 'Назначить роль' : 'Пригласить в проект') : 'Изменить роль'

  return (
    <Modal isOpen={true} onClose={onClose} title={titleText} maxWidth="md">
      <div className="p-6 space-y-4">
        {error && <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>}

        {!loaded ? (
          <div className="text-sm text-gray-400">Загрузка…</div>
        ) : (
          <>
            {isInvite && (
              <p className="text-sm text-gray-500">
                {customer.user_id
                  ? `Зарегистрированному пользователю ${customer.email} будет назначена выбранная роль, и придёт письмо «вам открыт доступ».`
                  : customer.email
                  ? `На ${customer.email} уйдёт письмо со ссылкой регистрации.`
                  : 'У клиента не указан email — сначала добавьте email в контактах в шапке карточки.'}
              </p>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Роль</label>
              <select
                value={selectedRoleId}
                onChange={e => setSelectedRoleId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
              >
                {roles.filter(r => r.code !== 'owner' && r.code !== 'guest' && r.code !== 'lead').map(r => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">
                Отмена
              </button>
              {!isInvite && (
                <button
                  onClick={handleRemoveMember}
                  className="px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium"
                >
                  Удалить из проекта
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving || !selectedRoleId || (isInvite && !customer.email)}
                className="flex-1 py-2 rounded-lg bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium disabled:opacity-50"
              >
                {saving ? 'Сохраняем…' : isInvite ? 'Отправить' : 'Сохранить'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

// ─── BotsTab — список чат-ботов клиента с детализацией статуса ───
type BotConvRow = {
  bot_id: string
  bot_name: string
  is_active: boolean | null
  chat_blocked: boolean | null
  scenario_name: string | null
  step_position: number | null
  updated_at: string | null
}

function BotsTab({ customerId }: { customerId: string }) {
  const supabase = createClient()
  const [bots, setBots] = useState<BotConvRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('chatbot_conversations')
        .select('telegram_bot_id, current_step_position, is_active, chat_blocked, updated_at, telegram_bots!inner(name), chatbot_scenarios(name)')
        .eq('customer_id', customerId)
      type Raw = {
        telegram_bot_id: string
        current_step_position: number | null
        is_active: boolean | null
        chat_blocked: boolean | null
        updated_at: string | null
        telegram_bots: { name: string } | { name: string }[]
        chatbot_scenarios: { name: string } | { name: string }[] | null
      }
      const rows: BotConvRow[] = ((data ?? []) as unknown as Raw[]).map(r => {
        const tb = Array.isArray(r.telegram_bots) ? r.telegram_bots[0] : r.telegram_bots
        const sc = Array.isArray(r.chatbot_scenarios) ? r.chatbot_scenarios[0] : r.chatbot_scenarios
        return {
          bot_id: r.telegram_bot_id,
          bot_name: tb?.name ?? 'Бот',
          is_active: r.is_active,
          chat_blocked: r.chat_blocked,
          scenario_name: sc?.name ?? null,
          step_position: r.current_step_position,
          updated_at: r.updated_at,
        }
      })
      if (!cancelled) setBots(rows)
    }
    load()
    return () => { cancelled = true }
  }, [customerId, supabase])

  if (bots === null) return <div className="text-sm text-gray-400 py-3">Загрузка…</div>
  if (bots.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <div className="text-3xl mb-2">🤖</div>
        <div className="text-sm">Клиент не подписан ни на один чат-бот этого проекта</div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {bots.map(b => (
        <div key={b.bot_id} className="bg-[#FAFAFD] rounded-xl border border-gray-100 px-4 py-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-medium text-gray-900">{b.bot_name}</div>
            <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
              {b.scenario_name ? <>Сценарий: <strong>{b.scenario_name}</strong></> : <span className="italic">Без активного сценария</span>}
              {b.step_position !== null && b.step_position !== undefined && (
                <span className="text-gray-400">· шаг {b.step_position + 1}</span>
              )}
              {b.updated_at && (
                <span className="text-gray-400">· обновлён {new Date(b.updated_at).toLocaleDateString('ru')}</span>
              )}
            </div>
          </div>
          <div className="shrink-0">
            {b.chat_blocked ? (
              <span className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-700">🚫 заблокирован</span>
            ) : b.is_active ? (
              <span className="text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-700">✓ активен</span>
            ) : (
              <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">пауза</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── SubscriptionsBlock — компактный обзор подписок: чат-боты + соц-сети ───
function SubscriptionsBlock({ customerId }: { customerId: string }) {
  const supabase = createClient()
  const [bots, setBots] = useState<Array<{ id: string; name: string; chat_blocked: boolean | null; is_active: boolean | null }> | null>(null)
  const [channels, setChannels] = useState<Array<{ id: string; label: string; platform: string | null; subscribed: boolean }> | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [bRes, cRes] = await Promise.all([
        supabase
          .from('chatbot_conversations')
          .select('telegram_bot_id, chat_blocked, is_active, telegram_bots!inner(name)')
          .eq('customer_id', customerId),
        supabase
          .from('social_subscribers_log')
          .select('account_id, action, at, social_accounts!inner(external_title, external_username, platform)')
          .eq('customer_id', customerId)
          .order('at', { ascending: false }),
      ])

      type BotRaw = {
        telegram_bot_id: string
        chat_blocked: boolean | null
        is_active: boolean | null
        telegram_bots: { name: string } | { name: string }[]
      }
      const botRows = ((bRes.data ?? []) as unknown as BotRaw[]).map(r => {
        const tb = Array.isArray(r.telegram_bots) ? r.telegram_bots[0] : r.telegram_bots
        return { id: r.telegram_bot_id, name: tb?.name ?? 'Бот', chat_blocked: r.chat_blocked, is_active: r.is_active }
      })

      type SubRaw = {
        account_id: string
        action: string | null
        at: string
        social_accounts: { external_title: string | null; external_username: string | null; platform: string | null } | { external_title: string | null; external_username: string | null; platform: string | null }[]
      }
      const lastByAccount = new Map<string, SubRaw>()
      ;((cRes.data ?? []) as unknown as SubRaw[]).forEach(s => {
        if (!lastByAccount.has(s.account_id)) lastByAccount.set(s.account_id, s)
      })
      const channelRows: Array<{ id: string; label: string; platform: string | null; subscribed: boolean }> = []
      lastByAccount.forEach(s => {
        const sa = Array.isArray(s.social_accounts) ? s.social_accounts[0] : s.social_accounts
        const label = sa?.external_title || (sa?.external_username ? `@${sa.external_username}` : 'Канал')
        channelRows.push({
          id: s.account_id,
          label,
          platform: sa?.platform ?? null,
          // action из БД: 'join' (подписался) или 'leave' (отписался/удалён).
          subscribed: s.action !== 'leave' && s.action !== 'unsubscribe' && s.action !== 'left',
        })
      })

      if (!cancelled) {
        setBots(botRows)
        setChannels(channelRows)
      }
    }
    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  if (bots === null || channels === null) return null
  if (bots.length === 0 && channels.length === 0) return null

  return (
    <div className="pt-4 border-t border-gray-100">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Подписки</h3>
      <div className="flex flex-wrap gap-2">
        {bots.map(b => {
          // chat_blocked=true означает что человек заблокировал бот / удалил чат — фактически отписался.
          const isUnsubscribed = !!b.chat_blocked
          const c = isUnsubscribed ? { bg: '#FEE2E2', fg: '#B91C1C' } : { bg: '#D1FAE5', fg: '#059669' }
          return (
            <div key={b.id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm" style={{ backgroundColor: c.bg, color: c.fg }}>
              <span className="text-xs opacity-70">Чат-бот:</span>
              <span className="font-medium">{b.name}</span>
              <span className="text-base leading-none" title={isUnsubscribed ? 'Отписался / заблокировал бота' : 'Подписан'}>
                {isUnsubscribed ? '✕' : '✓'}
              </span>
            </div>
          )
        })}
        {channels.map(ch => {
          const c = ch.subscribed ? { bg: '#D1FAE5', fg: '#059669' } : { bg: '#FEE2E2', fg: '#B91C1C' }
          return (
            <div key={ch.id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm" style={{ backgroundColor: c.bg, color: c.fg }}>
              <span className="text-xs opacity-70">Канал:</span>
              <span className="font-medium">{ch.label}</span>
              <span className="text-base leading-none" title={ch.subscribed ? 'Подписан' : 'Отписался'}>
                {ch.subscribed ? '✓' : '✕'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── TagsBlock — добавление/удаление тегов клиенту ───
function TagsBlock({ customer, onUpdated }: { customer: CustomerRow; onUpdated: (c: Partial<CustomerRow>) => void }) {
  const supabase = createClient()
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const tags = customer.tags ?? []

  async function save(next: string[]) {
    setSaving(true)
    const { data } = await supabase.from('customers').update({ tags: next }).eq('id', customer.id).select().single()
    if (data) onUpdated(data as Partial<CustomerRow>)
    setSaving(false)
  }

  async function addTag(t: string) {
    const trimmed = t.trim()
    if (!trimmed) return
    if (tags.includes(trimmed)) return
    await save([...tags, trimmed])
    setDraft('')
  }

  async function removeTag(t: string) {
    await save(tags.filter(x => x !== t))
  }

  return (
    <div className="pt-4 border-t border-gray-100">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">🏷 Теги</h3>
      <div className="flex items-center gap-1.5 flex-wrap">
        {tags.map(t => (
          <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#F0EDFF] text-[#6A55F8]">
            {t}
            <button onClick={() => removeTag(t)} disabled={saving} className="hover:text-red-500 disabled:opacity-50" title="Удалить тег">✕</button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); addTag(draft) }
          }}
          placeholder={tags.length === 0 ? 'Добавить тег и нажать Enter' : 'Ещё тег…'}
          className="px-2.5 py-1 rounded-full text-xs border border-dashed border-gray-300 focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10 min-w-[140px]"
        />
      </div>
    </div>
  )
}

// ─── NotesTab ───
type Note = { id: string; text: string | null; content: string | null; author_id: string | null; created_at: string | null }

function NotesTab({ customerId, projectId }: { customerId: string; projectId: string }) {
  const supabase = createClient()
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)

  async function load() {
    const { data } = await supabase.from('customer_notes').select('*').eq('customer_id', customerId).order('created_at', { ascending: false })
    setNotes((data ?? []) as Note[])
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [customerId])

  async function add() {
    const text = draft.trim()
    if (!text) return
    setAdding(true)
    setDraft('')
    await supabase.from('customer_notes').insert({ customer_id: customerId, project_id: projectId, text, content: text })
    await load()
    setAdding(false)
  }

  async function remove(id: string) {
    if (!window.confirm('Удалить заметку?')) return
    await supabase.from('customer_notes').delete().eq('id', id)
    await load()
  }

  if (notes === null) return <div className="text-sm text-gray-400 py-3">Загрузка…</div>

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Новая заметка…"
          rows={2}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-[#6A55F8]"
        />
        <button
          onClick={add}
          disabled={adding || !draft.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 self-start"
          style={{ backgroundColor: '#6A55F8' }}
        >
          {adding ? '…' : 'Добавить'}
        </button>
      </div>

      {notes.length === 0 ? (
        <p className="text-center py-8 text-sm text-gray-400">Заметок пока нет</p>
      ) : (
        <div className="space-y-2">
          {notes.map(n => (
            <div key={n.id} className="bg-[#FAFAFD] rounded-xl px-4 py-3 group relative">
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.content || n.text}</p>
              <p className="text-xs text-gray-400 mt-1.5">{n.created_at ? formatDateTime(n.created_at) : ''}</p>
              <button
                onClick={() => remove(n.id)}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-red-500"
                aria-label="Удалить"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
