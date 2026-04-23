'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { SkeletonList } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'

type Order = {
  id: string
  customer_name: string
  customer_email: string | null
  product_name: string | null
  tariff_name: string | null
  amount: number
  paid_amount: number
  status: string
  created_at: string
  product_id: string | null
  tariff_id: string | null
  customer_id: string | null
}

type Payment = {
  id: string
  amount: number
  created_at: string
  note: string | null
}

type OrderNote = {
  id: string
  text: string
  created_at: string
}

type Customer = { id: string; name: string; email: string | null }
type Product = { id: string; name: string }
type Tariff = { id: string; name: string; price: number; product_id: string }

const STATUS_CONFIG: Record<string, { label: string; color: string; textColor: string }> = {
  new:         { label: 'Новый',     color: '#EDE9FF', textColor: '#6A55F8' },
  in_progress: { label: 'В работе', color: '#FEF3C7', textColor: '#F59E0B' },
  paid:        { label: 'Оплачен',  color: '#D1FAE5', textColor: '#10B981' },
  partial:     { label: 'Частично', color: '#CFFAFE', textColor: '#06B6D4' },
  refund:      { label: 'Возврат',  color: '#FEE2E2', textColor: '#EF4444' },
  cancelled:   { label: 'Отменён', color: '#F1F5F9', textColor: '#94A3B8' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: '#F1F5F9', textColor: '#64748B' }
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: cfg.color, color: cfg.textColor }}
    >
      {cfg.label}
    </span>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatMoney(n: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n)
}

// ─── Detail View ─────────────────────────────────────────────────────────────

function OrderDetail({ order, onBack, onUpdated }: { order: Order; onBack: () => void; onUpdated: (o: Order) => void }) {
  const supabase = createClient()
  const [current, setCurrent] = useState<Order>(order)
  const [payments, setPayments] = useState<Payment[]>([])
  const [notes, setNotes] = useState<OrderNote[]>([])
  const [newNote, setNewNote] = useState('')
  const [newPayAmount, setNewPayAmount] = useState('')
  const [newPayNote, setNewPayNote] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)
  const [addingPay, setAddingPay] = useState(false)
  const [addingNote, setAddingNote] = useState(false)
  const [showPayForm, setShowPayForm] = useState(false)

  async function load() {
    const [pRes, nRes] = await Promise.all([
      supabase.from('payments').select('*').eq('order_id', order.id).order('created_at'),
      supabase.from('order_notes').select('*').eq('order_id', order.id).order('created_at'),
    ])
    if (pRes.data) setPayments(pRes.data as Payment[])
    if (nRes.data) setNotes(nRes.data as OrderNote[])
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [order.id])

  async function changeStatus(status: string) {
    setSavingStatus(true)
    const { data } = await supabase.from('orders').update({ status }).eq('id', order.id).select().single()
    if (data) { setCurrent(data as Order); onUpdated(data as Order) }
    setSavingStatus(false)
  }

  async function addPayment() {
    const amt = parseFloat(newPayAmount)
    if (!amt) return
    setAddingPay(true)
    await supabase.from('payments').insert({ order_id: order.id, amount: amt, note: newPayNote || null })
    setNewPayAmount(''); setNewPayNote(''); setShowPayForm(false)
    load()
    setAddingPay(false)
  }

  async function addNote() {
    if (!newNote.trim()) return
    setAddingNote(true)
    await supabase.from('order_notes').insert({ order_id: order.id, text: newNote.trim() })
    setNewNote('')
    load()
    setAddingNote(false)
  }

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Назад к заказам
        </button>
      </div>

      {/* Info card */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{current.customer_name}</h2>
            {current.customer_email && <p className="text-sm text-gray-500 mt-0.5">{current.customer_email}</p>}
          </div>
          <StatusBadge status={current.status} />
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-400 mb-0.5">Продукт</p>
            <p className="font-medium text-gray-800">{current.product_name ?? '—'}</p>
          </div>
          <div>
            <p className="text-gray-400 mb-0.5">Тариф</p>
            <p className="font-medium text-gray-800">{current.tariff_name ?? '—'}</p>
          </div>
          <div>
            <p className="text-gray-400 mb-0.5">Сумма заказа</p>
            <p className="font-medium text-gray-800">{formatMoney(current.amount)}</p>
          </div>
          <div>
            <p className="text-gray-400 mb-0.5">Оплачено</p>
            <p className="font-medium text-gray-800">{formatMoney(totalPaid)}</p>
          </div>
          <div>
            <p className="text-gray-400 mb-0.5">Дата</p>
            <p className="font-medium text-gray-800">{formatDate(current.created_at)}</p>
          </div>
        </div>

        {/* Status change */}
        <div>
          <p className="text-xs text-gray-400 mb-1.5">Изменить статус</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <button
                key={key}
                disabled={savingStatus || current.status === key}
                onClick={() => changeStatus(key)}
                className="rounded-full px-3 py-1 text-xs font-medium border transition-all disabled:opacity-60"
                style={{
                  backgroundColor: current.status === key ? cfg.color : 'white',
                  color: current.status === key ? cfg.textColor : '#64748B',
                  borderColor: current.status === key ? cfg.textColor : '#E2E8F0',
                }}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Payments */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Платежи</h3>
          <button
            onClick={() => setShowPayForm(true)}
            className="text-sm font-medium px-3 py-1.5 rounded-lg text-white"
            style={{ backgroundColor: '#6A55F8' }}
          >
            + Добавить платёж
          </button>
        </div>

        <Modal
          isOpen={showPayForm}
          onClose={() => { setShowPayForm(false); setNewPayAmount(''); setNewPayNote('') }}
          title="Новый платёж"
          maxWidth="md"
          footer={
            <>
              <button onClick={() => { setShowPayForm(false); setNewPayAmount(''); setNewPayNote('') }}
                className="px-3 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100">Отмена</button>
              <button onClick={addPayment} disabled={addingPay || !newPayAmount}
                className="px-4 py-2 text-sm font-semibold bg-[#6A55F8] text-white rounded-lg hover:bg-[#5845e0] disabled:opacity-50">
                {addingPay ? 'Сохраняю...' : 'Сохранить платёж'}
              </button>
            </>
          }
        >
          <div className="p-5 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Сумма, ₽</label>
              <input
                type="number"
                placeholder="0"
                value={newPayAmount}
                onChange={e => setNewPayAmount(e.target.value)}
                autoFocus
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Примечание</label>
              <input
                type="text"
                placeholder="Например, «оплата по QR»"
                value={newPayNote}
                onChange={e => setNewPayNote(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10"
              />
            </div>
          </div>
        </Modal>

        {payments.length === 0 ? (
          <p className="text-sm text-gray-400">Платежей пока нет</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-2 font-medium">Сумма</th>
                <th className="pb-2 font-medium">Примечание</th>
                <th className="pb-2 font-medium">Дата</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 font-medium text-gray-900">{formatMoney(p.amount)}</td>
                  <td className="py-2 text-gray-500">{p.note ?? '—'}</td>
                  <td className="py-2 text-gray-400">{formatDate(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

// ─── Create Order Form ────────────────────────────────────────────────────────

function CreateOrderForm({
  projectId,
  customers,
  products,
  tariffs,
  onCreated,
  onCancel,
}: {
  projectId: string
  customers: Customer[]
  products: Product[]
  tariffs: Tariff[]
  onCreated: (order: Order) => void
  onCancel: () => void
}) {
  const supabase = createClient()
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [useExisting, setUseExisting] = useState(true)
  const [productId, setProductId] = useState('')
  const [tariffId, setTariffId] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const filteredTariffs = tariffs.filter(t => t.product_id === productId)

  useEffect(() => {
    if (tariffId) {
      const t = tariffs.find(t => t.id === tariffId)
      if (t) setAmount(String(t.price))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tariffId])

  async function submit() {
    setError('')
    const product = products.find(p => p.id === productId)
    const tariff = tariffs.find(t => t.id === tariffId)
    const cName = useExisting ? customers.find(c => c.id === customerId)?.name ?? '' : customerName
    const cEmail = useExisting ? customers.find(c => c.id === customerId)?.email ?? null : customerEmail || null

    if (!cName) return setError('Выберите или введите клиента')
    if (!amount) return setError('Введите сумму')

    const tempOrder: Order = {
      id: 'temp-' + Date.now(),
      customer_id: useExisting && customerId ? customerId : null,
      customer_name: cName,
      customer_email: cEmail,
      product_id: productId || null,
      product_name: product?.name ?? null,
      tariff_id: tariffId || null,
      tariff_name: tariff?.name ?? null,
      amount: parseFloat(amount),
      paid_amount: 0,
      status: 'new',
      created_at: new Date().toISOString(),
    }
    onCreated(tempOrder)

    setSaving(true)
    const { data, error: err } = await supabase.from('orders').insert({
      project_id: projectId,
      customer_id: tempOrder.customer_id,
      customer_name: tempOrder.customer_name,
      customer_email: tempOrder.customer_email,
      product_id: tempOrder.product_id,
      product_name: tempOrder.product_name,
      tariff_id: tempOrder.tariff_id,
      tariff_name: tempOrder.tariff_name,
      amount: tempOrder.amount,
      paid_amount: 0,
      status: 'new',
    }).select().single()
    setSaving(false)
    if (err) return setError(err.message)
    if (data) onCreated(data as Order)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
      <h3 className="font-semibold text-gray-900">Новый заказ</h3>

      {/* Customer */}
      <div>
        <div className="flex gap-3 mb-2">
          <button
            onClick={() => setUseExisting(true)}
            className={`text-sm px-3 py-1.5 rounded-lg font-medium border ${useExisting ? 'text-white border-transparent' : 'text-gray-600 border-gray-200'}`}
            style={useExisting ? { backgroundColor: '#6A55F8' } : {}}
          >
            Выбрать клиента
          </button>
          <button
            onClick={() => setUseExisting(false)}
            className={`text-sm px-3 py-1.5 rounded-lg font-medium border ${!useExisting ? 'text-white border-transparent' : 'text-gray-600 border-gray-200'}`}
            style={!useExisting ? { backgroundColor: '#6A55F8' } : {}}
          >
            Новый клиент
          </button>
        </div>
        {useExisting ? (
          <select
            value={customerId}
            onChange={e => setCustomerId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6A55F8]"
          >
            <option value="">— Клиент —</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}{c.email ? ` (${c.email})` : ''}</option>
            ))}
          </select>
        ) : (
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Имя клиента"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6A55F8]"
            />
            <input
              type="email"
              placeholder="Email (необязательно)"
              value={customerEmail}
              onChange={e => setCustomerEmail(e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6A55F8]"
            />
          </div>
        )}
      </div>

      {/* Product + Tariff */}
      <div className="flex gap-3">
        <select
          value={productId}
          onChange={e => { setProductId(e.target.value); setTariffId('') }}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6A55F8]"
        >
          <option value="">— Продукт —</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          value={tariffId}
          onChange={e => setTariffId(e.target.value)}
          disabled={!productId}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6A55F8] disabled:opacity-50"
        >
          <option value="">— Тариф —</option>
          {filteredTariffs.map(t => <option key={t.id} value={t.id}>{t.name} — {formatMoney(t.price)}</option>)}
        </select>
      </div>

      {/* Amount */}
      <input
        type="number"
        placeholder="Сумма, ₽"
        value={amount}
        onChange={e => setAmount(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6A55F8]"
      />

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={saving}
          className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: '#6A55F8' }}
        >
          {saving ? 'Создаю...' : 'Создать заказ'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-700">
          Отмена
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const projectId = params.id as string
  const supabase = createClient()

  const [orders, setOrders] = useState<Order[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [tariffs, setTariffs] = useState<Tariff[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [showCreate, setShowCreate] = useState(false)

  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null)
  const urlOrderId = searchParams.get('open')
  const openOrderId = localSelectedId ?? urlOrderId
  const selected = openOrderId ? orders.find(o => o.id === openOrderId) ?? null : null

  function selectOrder(id: string) {
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

  async function loadAll() {
    const [oRes, cRes, pRes, tRes] = await Promise.all([
      supabase.from('orders').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('customers').select('id, name, email').eq('project_id', projectId).order('name'),
      supabase.from('products').select('id, name').eq('project_id', projectId).order('name'),
      supabase.from('tariffs').select('id, name, price, product_id').order('name'),
    ])
    if (oRes.data) setOrders(oRes.data as Order[])
    if (cRes.data) setCustomers(cRes.data as Customer[])
    if (pRes.data) setProducts(pRes.data as Product[])
    if (tRes.data) setTariffs(tRes.data as Tariff[])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAll() }, [projectId])

  function toggleStatus(s: string) {
    setStatusFilter(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  function updateOrder(updated: Order) {
    setOrders(prev => prev.map(o => o.id === updated.id ? updated : o))
  }

  const filtered = orders.filter(o => {
    const q = search.toLowerCase()
    const matchSearch = !q || o.customer_name.toLowerCase().includes(q) || (o.customer_email ?? '').toLowerCase().includes(q)
    const matchStatus = statusFilter.length === 0 || statusFilter.includes(o.status)
    return matchSearch && matchStatus
  })

  if (selected) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <OrderDetail order={selected} onBack={clearSelection} onUpdated={updateOrder} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Заказы</h1>
          <p className="text-sm text-gray-500 mt-0.5">{orders.length} заказ{orders.length === 1 ? '' : orders.length < 5 ? 'а' : 'ов'}</p>
        </div>
        <button
          onClick={() => setShowCreate(v => !v)}
          className="px-4 py-2.5 rounded-xl text-sm font-medium text-white shadow-sm"
          style={{ backgroundColor: '#6A55F8' }}
        >
          + Создать заказ
        </button>
      </div>

      {showCreate && (
        <CreateOrderForm
          projectId={projectId}
          customers={customers}
          products={products}
          tariffs={tariffs}
          onCreated={(order) => {
            setShowCreate(false)
            setOrders(prev => {
              const existing = prev.find(o => o.id === order.id)
              if (existing) return prev.map(o => o.id === order.id ? order : o)
              // Replace temp if present, else prepend
              const tempIdx = prev.findIndex(o => o.id.startsWith('temp-'))
              if (tempIdx !== -1) return prev.map((o, i) => i === tempIdx ? order : o)
              return [order, ...prev]
            })
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Filters */}
      <div className="space-y-3">
        <input
          type="text"
          placeholder="Поиск по клиенту или email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-md border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#6A55F8]"
        />
        <div className="flex flex-wrap gap-2">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
            const active = statusFilter.includes(key)
            return (
              <button
                key={key}
                onClick={() => toggleStatus(key)}
                className="rounded-full px-3 py-1 text-xs font-medium border transition-all"
                style={{
                  backgroundColor: active ? cfg.color : 'white',
                  color: active ? cfg.textColor : '#64748B',
                  borderColor: active ? cfg.textColor : '#E2E8F0',
                }}
              >
                {cfg.label}
              </button>
            )
          })}
          {statusFilter.length > 0 && (
            <button onClick={() => setStatusFilter([])} className="rounded-full px-3 py-1 text-xs text-gray-400 hover:text-gray-600 border border-gray-200">
              Сбросить
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <SkeletonList count={3} />
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-3">🧾</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            {orders.length === 0 ? 'Заказов пока нет' : 'Ничего не найдено'}
          </h3>
          <p className="text-sm text-gray-500">
            {orders.length === 0 ? 'Создайте первый заказ, нажав кнопку выше' : 'Попробуйте изменить фильтры'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-left text-xs text-gray-400">
                <th className="px-4 py-3 font-medium">№</th>
                <th className="px-4 py-3 font-medium">Клиент</th>
                <th className="px-4 py-3 font-medium">Продукт</th>
                <th className="px-4 py-3 font-medium">Тариф</th>
                <th className="px-4 py-3 font-medium">Сумма</th>
                <th className="px-4 py-3 font-medium">Оплачено</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Дата</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o, i) => (
                <tr
                  key={o.id}
                  onClick={() => selectOrder(o.id)}
                  className="border-b border-gray-50 last:border-0 hover:bg-[#F0EDFF] cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 text-gray-400">{filtered.length - i}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{o.customer_name}</div>
                    {o.customer_email && <div className="text-xs text-gray-400">{o.customer_email}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{o.product_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{o.tariff_name ?? '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{formatMoney(o.amount)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatMoney(o.paid_amount)}</td>
                  <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
