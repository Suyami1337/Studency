'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import ActivityTimeline from '@/components/users/ActivityTimeline'
import {
  CustomerRow, deriveClientType, CLIENT_TYPE_LABELS, CLIENT_TYPE_COLOR, CLIENT_TYPE_HINT,
  FIRST_TOUCH_KIND_LABELS,
  formatDate, formatDateTime, formatRelative, formatMoney,
} from '@/lib/users/config'

type TabId = 'activity' | 'orders' | 'funnels' | 'touchpoints' | 'fields' | 'notes'

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
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  async function load() {
    setLoading(true)
    const [cRes, aRes] = await Promise.all([
      supabase.from('customers').select('*').eq('id', userId).single(),
      supabase.from('customer_aggregates').select('last_activity_at, orders_count, revenue, has_paid, in_funnel').eq('customer_id', userId).maybeSingle(),
    ])
    if (cRes.data) {
      setCustomer({ ...(cRes.data as CustomerRow), ...((aRes.data ?? {}) as Partial<CustomerRow>) })
    }
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [userId])

  function startEdit() {
    if (!customer) return
    setEditData({
      full_name: customer.full_name,
      email: customer.email,
      phone: customer.phone,
      telegram_username: customer.telegram_username,
      instagram: customer.instagram,
      vk: customer.vk,
      whatsapp: customer.whatsapp,
    })
    setEditMode(true)
  }

  async function saveEdit() {
    if (!customer) return
    setSaving(true)
    const { data } = await supabase.from('customers').update(editData).eq('id', customer.id).select().single()
    if (data) setCustomer(prev => prev ? { ...prev, ...(data as CustomerRow) } : prev)
    setSaving(false)
    setEditMode(false)
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
              {(customer.full_name || customer.email || customer.telegram_username || '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              {editMode ? (
                <input
                  type="text"
                  value={editData.full_name ?? ''}
                  onChange={e => setEditData(d => ({ ...d, full_name: e.target.value }))}
                  className="text-2xl font-semibold text-gray-900 border-b border-[#6A55F8] focus:outline-none bg-transparent w-full"
                />
              ) : (
                <h1 className="text-2xl font-semibold text-gray-900 truncate">
                  {customer.full_name || 'Без имени'}
                </h1>
              )}

              <div className="flex items-center gap-2 flex-wrap mt-1.5">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: typeColor.bg, color: typeColor.fg }}
                  title={CLIENT_TYPE_HINT[type]}
                >
                  {CLIENT_TYPE_LABELS[type]}
                </span>
                {customer.is_blocked && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600">
                    Заблокирован
                  </span>
                )}
                {customer.bot_subscribed && !customer.bot_blocked && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                    🤖 На боте
                  </span>
                )}
                {customer.bot_blocked && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">
                    🚫 Бот заблокирован
                  </span>
                )}
                {customer.channel_subscribed && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                    📣 На канале
                  </span>
                )}
                {customer.tags && customer.tags.length > 0 && (
                  <>
                    {customer.tags.map(t => (
                      <span key={t} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#F0EDFF] text-[#6A55F8]">
                        {t}
                      </span>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {customer.telegram_username && (
              <a
                href={`https://t.me/${customer.telegram_username}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm px-3 py-1.5 rounded-lg bg-[#F0EDFF] text-[#6A55F8] hover:bg-[#E5DFFF] font-medium"
              >
                ✈ Открыть Telegram
              </a>
            )}
            {!editMode && (
              <button onClick={startEdit} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-300">
                ✏ Редактировать
              </button>
            )}
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <Metric label="Зарегистрирован" value={formatDate(customer.created_at)} hint={formatDateTime(customer.created_at)} />
          <Metric label="Последняя активность" value={formatRelative(customer.last_activity_at ?? customer.created_at)} hint={formatDateTime(customer.last_activity_at ?? customer.created_at)} />
          <Metric label="Заказов" value={String(customer.orders_count ?? 0)} />
          <Metric label="Сумма заказов" value={formatMoney(customer.revenue ?? 0)} />
        </div>

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

        {editMode && (
          <EditFormFields
            data={editData}
            onChange={setEditData}
            saving={saving}
            onSave={saveEdit}
            onCancel={() => setEditMode(false)}
          />
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {([
            { id: 'activity',    label: 'Активность',   icon: '📊' },
            { id: 'orders',      label: 'Заказы',       icon: '🛒' },
            { id: 'funnels',     label: 'Воронки',      icon: '🎯' },
            { id: 'touchpoints', label: 'Точки входа',  icon: '📍' },
            { id: 'fields',      label: 'Поля',         icon: '📋' },
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
          {tab === 'funnels' && <FunnelsTab customerId={customer.id} />}
          {tab === 'touchpoints' && <TouchpointsTab customerId={customer.id} />}
          {tab === 'fields' && <FieldsTab customer={customer} onUpdated={c => setCustomer(prev => prev ? { ...prev, ...c } : prev)} />}
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

  useEffect(() => {
    let cancelled = false
    async function loadCount() {
      const { count } = await supabase
        .from('customer_touchpoints')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', customer.id)
      if (!cancelled) setTpCount(count ?? 0)
    }
    loadCount()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.id])

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
              {customer.first_touch_source ?? '—'}
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
function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-[#FAFAFD] rounded-xl px-3 py-2.5" title={hint}>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-sm font-semibold text-gray-900 mt-0.5">{value}</div>
    </div>
  )
}

function EditFormFields({
  data, onChange, saving, onSave, onCancel,
}: {
  data: Partial<CustomerRow>
  onChange: (d: Partial<CustomerRow>) => void
  saving: boolean
  onSave: () => void
  onCancel: () => void
}) {
  const fields: { key: keyof CustomerRow; label: string; type: string }[] = [
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Телефон', type: 'tel' },
    { key: 'telegram_username', label: 'Telegram', type: 'text' },
    { key: 'instagram', label: 'Instagram', type: 'text' },
    { key: 'vk', label: 'ВКонтакте', type: 'text' },
    { key: 'whatsapp', label: 'WhatsApp', type: 'text' },
  ]
  return (
    <div className="border-t border-gray-100 pt-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {fields.map(f => (
          <label key={f.key} className="block">
            <span className="text-xs text-gray-500">{f.label}</span>
            <input
              type={f.type}
              value={(data[f.key] as string) ?? ''}
              onChange={e => onChange({ ...data, [f.key]: e.target.value || null })}
              className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#6A55F8]"
            />
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={onSave} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#6A55F8' }}>
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-700">
          Отмена
        </button>
      </div>
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

// ─── FieldsTab ───
type CustomField = { id: string; field_key: string; field_label: string; field_type: 'text' | 'number' | 'boolean' | 'select' | 'date'; field_options: { options?: string[] } | null }
type FieldValue = { field_id: string; value_text: string | null; value_number: number | null; value_boolean: boolean | null; value_date: string | null }

function FieldsTab({ customer, onUpdated }: { customer: CustomerRow; onUpdated: (c: Partial<CustomerRow>) => void }) {
  const supabase = createClient()
  const [fields, setFields] = useState<CustomField[]>([])
  const [values, setValues] = useState<Map<string, FieldValue>>(new Map())
  const [loading, setLoading] = useState(true)
  const [draftValues, setDraftValues] = useState<Map<string, Partial<FieldValue>>>(new Map())
  const [contactDraft, setContactDraft] = useState<Partial<CustomerRow>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [fRes, vRes] = await Promise.all([
        supabase.from('customer_custom_fields').select('*').eq('project_id', customer.project_id).order('order_index'),
        supabase.from('customer_field_values').select('field_id, value_text, value_number, value_boolean, value_date').eq('customer_id', customer.id),
      ])
      if (cancelled) return
      setFields((fRes.data ?? []) as CustomField[])
      setValues(new Map(((vRes.data ?? []) as FieldValue[]).map(v => [v.field_id, v])))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.id])

  function getValue(f: CustomField): FieldValue {
    const draft = draftValues.get(f.id)
    const stored = values.get(f.id)
    return {
      field_id: f.id,
      value_text:    draft?.value_text    ?? stored?.value_text    ?? null,
      value_number:  draft?.value_number  ?? stored?.value_number  ?? null,
      value_boolean: draft?.value_boolean ?? stored?.value_boolean ?? null,
      value_date:    draft?.value_date    ?? stored?.value_date    ?? null,
    }
  }

  function updateDraft(fieldId: string, patch: Partial<FieldValue>) {
    setDraftValues(prev => {
      const next = new Map(prev)
      next.set(fieldId, { ...(next.get(fieldId) ?? {}), ...patch })
      return next
    })
  }

  const hasContactChanges = Object.keys(contactDraft).length > 0
  const hasFieldChanges = draftValues.size > 0
  const isDirty = hasContactChanges || hasFieldChanges

  async function saveAll() {
    setSaving(true)
    if (hasContactChanges) {
      const { data } = await supabase.from('customers').update(contactDraft).eq('id', customer.id).select().single()
      if (data) onUpdated(data as Partial<CustomerRow>)
      setContactDraft({})
    }
    for (const [fieldId, draft] of draftValues) {
      await supabase.from('customer_field_values').upsert({
        customer_id: customer.id,
        field_id: fieldId,
        value_text: draft.value_text ?? null,
        value_number: draft.value_number ?? null,
        value_boolean: draft.value_boolean ?? null,
        value_date: draft.value_date ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'customer_id,field_id' })
    }
    // reload values
    const vRes = await supabase.from('customer_field_values').select('field_id, value_text, value_number, value_boolean, value_date').eq('customer_id', customer.id)
    setValues(new Map(((vRes.data ?? []) as FieldValue[]).map(v => [v.field_id, v])))
    setDraftValues(new Map())
    setSaving(false)
  }

  if (loading) return <div className="text-sm text-gray-400 py-3">Загрузка…</div>

  const contactFields: { key: keyof CustomerRow; label: string; type: string }[] = [
    { key: 'full_name', label: 'Имя', type: 'text' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Телефон', type: 'tel' },
    { key: 'telegram_username', label: 'Telegram', type: 'text' },
    { key: 'instagram', label: 'Instagram', type: 'text' },
    { key: 'vk', label: 'ВКонтакте', type: 'text' },
    { key: 'whatsapp', label: 'WhatsApp', type: 'text' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Контакты</h3>
        <div className="grid grid-cols-2 gap-3">
          {contactFields.map(f => (
            <label key={f.key} className="block">
              <span className="text-xs text-gray-500">{f.label}</span>
              <input
                type={f.type}
                value={(contactDraft[f.key] !== undefined ? contactDraft[f.key] : customer[f.key]) as string ?? ''}
                onChange={e => setContactDraft(d => ({ ...d, [f.key]: e.target.value || null }))}
                className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#6A55F8]"
              />
            </label>
          ))}
        </div>
      </div>

      {fields.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Дополнительные поля</h3>
          <div className="grid grid-cols-2 gap-3">
            {fields.map(f => {
              const v = getValue(f)
              return (
                <label key={f.id} className="block">
                  <span className="text-xs text-gray-500">{f.field_label}</span>
                  {f.field_type === 'text' && (
                    <input type="text" value={v.value_text ?? ''} onChange={e => updateDraft(f.id, { value_text: e.target.value || null })}
                      className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#6A55F8]" />
                  )}
                  {f.field_type === 'number' && (
                    <input type="number" value={v.value_number ?? ''} onChange={e => updateDraft(f.id, { value_number: e.target.value === '' ? null : Number(e.target.value) })}
                      className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#6A55F8]" />
                  )}
                  {f.field_type === 'boolean' && (
                    <select
                      value={v.value_boolean === null ? '' : v.value_boolean ? 'true' : 'false'}
                      onChange={e => updateDraft(f.id, { value_boolean: e.target.value === '' ? null : e.target.value === 'true' })}
                      className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#6A55F8]"
                    >
                      <option value="">—</option>
                      <option value="true">Да</option>
                      <option value="false">Нет</option>
                    </select>
                  )}
                  {f.field_type === 'date' && (
                    <input type="date" value={(v.value_date ?? '').slice(0, 10)} onChange={e => updateDraft(f.id, { value_date: e.target.value || null })}
                      className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#6A55F8]" />
                  )}
                  {f.field_type === 'select' && (
                    <select
                      value={v.value_text ?? ''}
                      onChange={e => updateDraft(f.id, { value_text: e.target.value || null })}
                      className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#6A55F8]"
                    >
                      <option value="">—</option>
                      {(f.field_options?.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  )}
                </label>
              )
            })}
          </div>
        </div>
      )}

      {isDirty && (
        <div className="flex items-center gap-2 sticky bottom-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          <span className="text-xs text-amber-700 font-medium">Изменения не сохранены</span>
          <button onClick={saveAll} disabled={saving} className="ml-auto text-sm font-medium text-white px-3 py-1 rounded-lg disabled:opacity-50" style={{ backgroundColor: '#6A55F8' }}>
            {saving ? 'Сохраняю…' : 'Сохранить'}
          </button>
          <button onClick={() => { setContactDraft({}); setDraftValues(new Map()) }} className="text-sm text-gray-500 hover:text-gray-800">
            Сбросить
          </button>
        </div>
      )}
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
