'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { SkeletonList } from '@/components/ui/Skeleton'

type Customer = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  telegram_username: string | null
  instagram: string | null
  vk: string | null
  whatsapp: string | null
  tags: string[] | null
  is_blocked: boolean
  created_at: string
}

type Order = {
  id: string
  product_name: string | null
  tariff_name: string | null
  amount: number
  paid_amount: number
  status: string
  created_at: string
}

type CustomerAction = {
  id: string
  action_type: string
  description: string | null
  created_at: string
}

type CustomerNote = {
  id: string
  text: string
  created_at: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; textColor: string }> = {
  new:         { label: 'Новый',     color: '#EDE9FF', textColor: '#6A55F8' },
  in_progress: { label: 'В работе', color: '#FEF3C7', textColor: '#F59E0B' },
  paid:        { label: 'Оплачен',  color: '#D1FAE5', textColor: '#10B981' },
  partial:     { label: 'Частично', color: '#CFFAFE', textColor: '#06B6D4' },
  refund:      { label: 'Возврат',  color: '#FEE2E2', textColor: '#EF4444' },
  cancelled:   { label: 'Отменён', color: '#F1F5F9', textColor: '#94A3B8' },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatMoney(n: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n)
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: '#F1F5F9', textColor: '#64748B' }
  return (
    <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: cfg.color, color: cfg.textColor }}>
      {cfg.label}
    </span>
  )
}

// ─── Customer Detail ──────────────────────────────────────────────────────────

function CustomerDetail({ customer, onBack, onUpdated }: { customer: Customer; onBack: () => void; onUpdated: (c: Customer) => void }) {
  const supabase = createClient()
  const [current, setCurrent] = useState<Customer>(customer)
  const [orders, setOrders] = useState<Order[]>([])
  const [actions, setActions] = useState<CustomerAction[]>([])
  const [notes, setNotes] = useState<CustomerNote[]>([])
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState<Partial<Customer>>({})
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)

  async function load() {
    const [oRes, aRes, nRes] = await Promise.all([
      supabase.from('orders').select('id, product_name, tariff_name, amount, paid_amount, status, created_at').eq('customer_id', customer.id).order('created_at', { ascending: false }),
      supabase.from('customer_actions').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('customer_notes').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false }),
    ])
    if (oRes.data) setOrders(oRes.data as Order[])
    if (aRes.data) setActions(aRes.data as CustomerAction[])
    if (nRes.data) setNotes(nRes.data as CustomerNote[])
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [customer.id])

  function startEdit() {
    setEditData({
      full_name: current.full_name,
      email: current.email,
      phone: current.phone,
      telegram_username: current.telegram_username,
      instagram: current.instagram,
      vk: current.vk,
      whatsapp: current.whatsapp,
    })
    setEditMode(true)
  }

  async function saveEdit() {
    setSaving(true)
    const { data } = await supabase.from('customers').update(editData).eq('id', current.id).select().single()
    if (data) { setCurrent(data as Customer); onUpdated(data as Customer) }
    setSaving(false)
    setEditMode(false)
  }

  async function toggleBlock() {
    setToggling(true)
    const { data } = await supabase.from('customers').update({ is_blocked: !current.is_blocked }).eq('id', current.id).select().single()
    if (data) { setCurrent(data as Customer); onUpdated(data as Customer) }
    setToggling(false)
  }

  async function addNote() {
    if (!newNote.trim()) return
    setAddingNote(true)
    const text = newNote.trim()
    setNewNote('')
    const { data } = await supabase.from('customer_notes').insert({ customer_id: current.id, text }).select().single()
    if (data) setNotes(prev => [data as CustomerNote, ...prev])
    setAddingNote(false)
  }

  const contactFields = [
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Телефон', type: 'tel' },
    { key: 'telegram_username', label: 'Telegram', type: 'text' },
    { key: 'instagram', label: 'Instagram', type: 'text' },
    { key: 'vk', label: 'ВКонтакте', type: 'text' },
    { key: 'whatsapp', label: 'WhatsApp', type: 'text' },
  ] as const

  return (
    <div className="space-y-6">
      {/* Back */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Назад к клиентам
        </button>
        <div className="flex gap-2">
          {!editMode && (
            <button onClick={startEdit} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-300 transition-colors">
              Редактировать
            </button>
          )}
          <button
            onClick={toggleBlock}
            disabled={toggling}
            className="text-sm px-3 py-1.5 rounded-lg border font-medium transition-colors disabled:opacity-50"
            style={current.is_blocked
              ? { backgroundColor: '#D1FAE5', color: '#10B981', borderColor: '#10B981' }
              : { backgroundColor: '#FEE2E2', color: '#EF4444', borderColor: '#EF4444' }}
          >
            {toggling ? '...' : current.is_blocked ? 'Разблокировать' : 'Заблокировать'}
          </button>
        </div>
      </div>

      {/* Contact card */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-lg" style={{ backgroundColor: '#6A55F8' }}>
            {(current.full_name || current.email || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            {editMode ? (
              <input
                type="text"
                value={editData.full_name ?? ''}
                onChange={e => setEditData(d => ({ ...d, full_name: e.target.value }))}
                className="text-xl font-semibold text-gray-900 border-b border-[#6A55F8] focus:outline-none bg-transparent"
              />
            ) : (
              <h2 className="text-xl font-semibold text-gray-900">{current.full_name}</h2>
            )}
            {current.is_blocked && (
              <span className="text-xs text-red-500 font-medium">Заблокирован</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {contactFields.map(({ key, label, type }) => (
            <div key={key}>
              <p className="text-xs text-gray-400 mb-0.5">{label}</p>
              {editMode ? (
                <input
                  type={type}
                  value={(editData[key] as string) ?? ''}
                  onChange={e => setEditData(d => ({ ...d, [key]: e.target.value || null }))}
                  placeholder={`${label}...`}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#6A55F8]"
                />
              ) : (
                <p className="text-sm font-medium text-gray-800">{(current[key] as string | null) ?? '—'}</p>
              )}
            </div>
          ))}
        </div>

        {current.tags && current.tags.length > 0 && (
          <div>
            <p className="text-xs text-gray-400 mb-1.5">Теги</p>
            <div className="flex flex-wrap gap-1.5">
              {current.tags.map(tag => (
                <span key={tag} className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: '#F0EDFF', color: '#6A55F8' }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {editMode && (
          <div className="flex gap-2 pt-2">
            <button onClick={saveEdit} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#6A55F8' }}>
              {saving ? 'Сохраняю...' : 'Сохранить'}
            </button>
            <button onClick={() => setEditMode(false)} className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-700">
              Отмена
            </button>
          </div>
        )}
      </div>

      {/* Orders */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Заказы</h3>
        {orders.length === 0 ? (
          <p className="text-sm text-gray-400">Заказов нет</p>
        ) : (
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
              {orders.map(o => (
                <tr key={o.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 text-gray-800">{o.product_name ?? '—'}</td>
                  <td className="py-2 text-gray-500">{o.tariff_name ?? '—'}</td>
                  <td className="py-2 font-medium text-gray-900">{formatMoney(o.amount)}</td>
                  <td className="py-2 text-gray-600">{formatMoney(o.paid_amount)}</td>
                  <td className="py-2"><StatusBadge status={o.status} /></td>
                  <td className="py-2 text-gray-400">{formatDate(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Action log */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">История действий</h3>
        {actions.length === 0 ? (
          <p className="text-sm text-gray-400">Действий пока нет</p>
        ) : (
          <div className="space-y-2">
            {actions.map(a => (
              <div key={a.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-gray-50">
                <div className="w-2 h-2 mt-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#6A55F8' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">{a.action_type}{a.description ? ` — ${a.description}` : ''}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(a.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Заметки</h3>
        <div className="space-y-2 mb-4">
          {notes.length === 0 && <p className="text-sm text-gray-400">Заметок пока нет</p>}
          {notes.map(n => (
            <div key={n.id} className="p-3 rounded-lg bg-gray-50 text-sm">
              <p className="text-gray-800">{n.text}</p>
              <p className="text-xs text-gray-400 mt-1">{formatDate(n.created_at)}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Добавить заметку..."
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addNote()}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6A55F8]"
          />
          <button
            onClick={addNote}
            disabled={addingNote || !newNote.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: '#6A55F8' }}
          >
            {addingNote ? '...' : 'Добавить'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Create Customer Form ─────────────────────────────────────────────────────

function CreateCustomerForm({ projectId, onCreated, onCancel }: { projectId: string; onCreated: () => void; onCancel: () => void }) {
  const supabase = createClient()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [telegram, setTelegram] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!name.trim()) return setError('Введите имя клиента')
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('customers').insert({
      project_id: projectId,
      full_name: name.trim(),
      email: email || null,
      phone: phone || null,
      telegram_username: telegram || null,
      is_blocked: false,
    })
    setSaving(false)
    if (err) return setError(err.message)
    onCreated()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
      <h3 className="font-semibold text-gray-900">Новый клиент</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <input
            type="text"
            placeholder="Имя *"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6A55F8]"
          />
        </div>
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6A55F8]" />
        <input type="tel" placeholder="Телефон" value={phone} onChange={e => setPhone(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6A55F8]" />
        <input type="text" placeholder="Telegram" value={telegram} onChange={e => setTelegram(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6A55F8]" />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={saving} className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#6A55F8' }}>
          {saving ? 'Создаю...' : 'Создать клиента'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-700">
          Отмена
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const supabase = createClient()
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const projectId = params.id as string

  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null)
  const urlCustomerId = searchParams.get('open')
  const openCustomerId = localSelectedId ?? urlCustomerId
  const selected = openCustomerId ? customers.find(c => c.id === openCustomerId) ?? null : null

  function selectCustomer(id: string) {
    setLocalSelectedId(id)
    const p = new URLSearchParams(searchParams.toString())
    p.set('open', id)
    router.replace(`?${p.toString()}`, { scroll: false })
  }
  function clearSelection() {
    setLocalSelectedId(null)
    const p = new URLSearchParams(searchParams.toString())
    p.delete('open')
    router.replace(`?${p.toString()}`, { scroll: false })
  }

  async function loadCustomers() {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    if (data) setCustomers(data as Customer[])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadCustomers() }, [projectId])

  function updateCustomer(updated: Customer) {
    setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c))
  }

  const filtered = customers.filter(c => {
    const q = search.toLowerCase()
    return !q
      || (c.full_name || '').toLowerCase().includes(q)
      || (c.email ?? '').toLowerCase().includes(q)
      || (c.telegram_username ?? '').toLowerCase().includes(q)
  })

  if (selected) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <CustomerDetail customer={selected} onBack={clearSelection} onUpdated={updateCustomer} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Клиенты</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {customers.length} {customers.length === 1 ? 'клиент' : customers.length < 5 ? 'клиента' : 'клиентов'}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(v => !v)}
          className="px-4 py-2.5 rounded-xl text-sm font-medium text-white shadow-sm"
          style={{ backgroundColor: '#6A55F8' }}
        >
          + Добавить клиента
        </button>
      </div>

      {showCreate && (
        <CreateCustomerForm
          projectId={projectId}
          onCreated={() => { setShowCreate(false); loadCustomers() }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="Поиск по имени, email или Telegram..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full max-w-md border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#6A55F8]"
      />

      {/* Table */}
      {loading ? (
        <SkeletonList count={3} />
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-3">👤</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            {customers.length === 0 ? 'Клиентов пока нет' : 'Ничего не найдено'}
          </h3>
          <p className="text-sm text-gray-500">
            {customers.length === 0
              ? 'Добавьте первого клиента, нажав кнопку выше'
              : 'Попробуйте изменить поисковый запрос'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-left text-xs text-gray-400">
                <th className="px-4 py-3 font-medium">Имя</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Телефон</th>
                <th className="px-4 py-3 font-medium">Telegram</th>
                <th className="px-4 py-3 font-medium">Теги</th>
                <th className="px-4 py-3 font-medium">Создан</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr
                  key={c.id}
                  onClick={() => selectCustomer(c.id)}
                  className="border-b border-gray-50 last:border-0 hover:bg-[#F0EDFF] cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0" style={{ backgroundColor: '#6A55F8' }}>
                        {(c.full_name || c.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{c.full_name || 'Без имени'}</div>
                        {c.is_blocked && <div className="text-xs text-red-500">Заблокирован</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.email ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.telegram_username ? `@${c.telegram_username}` : '—'}</td>
                  <td className="px-4 py-3">
                    {c.tags && c.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {c.tags.slice(0, 2).map(tag => (
                          <span key={tag} className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: '#F0EDFF', color: '#6A55F8' }}>
                            {tag}
                          </span>
                        ))}
                        {c.tags.length > 2 && <span className="text-xs text-gray-400">+{c.tags.length - 2}</span>}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
