'use client'

import { useState } from 'react'
import { orders, orderStatuses } from '@/lib/mock-data'

type Order = typeof orders[number]

const allStatuses = Object.entries(orderStatuses)

const presets = [
  { name: 'Неоплаченные', statuses: ['new', 'in_progress'] },
  { name: 'Успешные', statuses: ['paid'] },
  { name: 'Проблемные', statuses: ['refund', 'cancelled'] },
]

const fakePaymentHistory = [
  { date: '06.04', amount: 29900, method: 'Продамус', id: 1 },
  { date: '01.04', amount: 2990, method: 'Продамус', id: 2 },
]

const fakeOrderNotes = [
  { id: 1, date: '06.04', author: 'Хасан', text: 'Клиент обещал доплатить до конца недели' },
  { id: 2, date: '04.04', author: 'Менеджер Анна', text: 'Связалась, обсудили рассрочку' },
]

const totalPaid = fakePaymentHistory.reduce((sum, p) => sum + p.amount, 0)

function OrderDetail({ order, onBack }: { order: Order; onBack: () => void }) {
  const [currentStatus, setCurrentStatus] = useState(order.status)
  const [isEditing, setIsEditing] = useState(false)
  const [clientName, setClientName] = useState(order.client)
  const [clientEmail, setClientEmail] = useState(order.email)
  const [product, setProduct] = useState(order.product)
  const [tariff, setTariff] = useState(order.tariff)
  const [orderNotes, setOrderNotes] = useState(fakeOrderNotes)
  const [newNote, setNewNote] = useState('')

  const statusConf = orderStatuses[currentStatus] ?? { label: currentStatus, color: '#94A3B8' }
  const isInstallment = fakePaymentHistory.length > 1
  const remaining = order.amount - totalPaid

  const displayStatus = isInstallment
    ? 'Частично оплачен (рассрочка)'
    : statusConf.label

  const fieldClass = isEditing
    ? 'w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-1 focus:ring-[#6A55F8] bg-white font-medium text-gray-900'
    : ''

  function handleAddNote() {
    if (!newNote.trim()) return
    const today = new Date()
    const dateStr = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}`
    setOrderNotes(prev => [...prev, { id: Date.now(), date: dateStr, author: 'Хасан', text: newNote.trim() }])
    setNewNote('')
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            ← Назад
          </button>
          <h1 className="text-xl font-bold text-gray-900">Заказ #{order.id}</h1>
          <span className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: isInstallment ? '#F59E0B' : statusConf.color }}>
            {displayStatus}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Go to user button */}
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            👤 Перейти к пользователю
          </button>
          <button
            onClick={() => setIsEditing(e => !e)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
              isEditing
                ? 'bg-[#6A55F8] text-white border-[#6A55F8] hover:bg-[#5040D6]'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {isEditing ? '✓ Сохранить' : '✏ Редактировать'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Order info */}
        <div className="col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Информация о заказе</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-400 text-xs mb-0.5">Клиент</p>
                {isEditing ? (
                  <input
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    className={fieldClass}
                  />
                ) : (
                  <p className="font-medium text-gray-900">{clientName}</p>
                )}
                {isEditing ? (
                  <input
                    value={clientEmail}
                    onChange={e => setClientEmail(e.target.value)}
                    className="mt-1 w-full px-3 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-[#6A55F8] text-gray-500 bg-white"
                  />
                ) : (
                  <p className="text-gray-500 text-xs">{clientEmail}</p>
                )}
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-0.5">Продукт</p>
                {isEditing ? (
                  <input
                    value={product}
                    onChange={e => setProduct(e.target.value)}
                    className={fieldClass}
                  />
                ) : (
                  <p className="font-medium text-gray-900">{product}</p>
                )}
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-0.5">Тариф</p>
                {isEditing ? (
                  <input
                    value={tariff}
                    onChange={e => setTariff(e.target.value)}
                    className={fieldClass}
                  />
                ) : (
                  <p className="font-medium text-gray-900">{tariff}</p>
                )}
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-0.5">Сумма</p>
                <p className="font-bold text-[#6A55F8] text-lg">{order.amount.toLocaleString('ru')} ₽</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-0.5">Дата создания</p>
                <p className="font-medium text-gray-900">{order.date}</p>
              </div>
            </div>
          </div>

          {/* Payment history */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">История платежей</h2>
              <button className="text-xs text-[#6A55F8] font-medium border border-[#6A55F8] rounded-lg px-3 py-1.5 hover:bg-[#F0EDFF] transition-colors">
                + Добавить платёж вручную
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Дата', 'Сумма', 'Метод'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 pb-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fakePaymentHistory.map(p => (
                  <tr key={p.id} className="border-b border-gray-50">
                    <td className="py-3 text-gray-700">{p.date}</td>
                    <td className="py-3 font-semibold text-gray-900">{p.amount.toLocaleString('ru')} ₽</td>
                    <td className="py-3 text-gray-500">{p.method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {isInstallment && remaining > 0 && (
              <div className="mt-3 flex items-center justify-between px-3 py-2.5 bg-amber-50 rounded-lg border border-amber-100">
                <span className="text-xs font-medium text-amber-700">Осталось внести:</span>
                <span className="text-sm font-bold text-amber-700">{remaining.toLocaleString('ru')} ₽</span>
              </div>
            )}
          </div>

          {/* Order notes */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Заметки к заказу</h3>
            <div className="space-y-3 mb-4">
              {orderNotes.map(note => (
                <div key={note.id} className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8] flex-shrink-0 mt-0.5">
                    {note.author[0]}
                  </div>
                  <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-400 mb-0.5">
                      <span className="font-medium text-gray-600">{note.author}</span> · {note.date}
                    </p>
                    <p className="text-sm text-gray-700">{note.text}</p>
                  </div>
                </div>
              ))}
              {orderNotes.length === 0 && (
                <p className="text-sm text-gray-400">Заметок пока нет</p>
              )}
            </div>
            <div className="flex gap-2">
              <textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                placeholder="Добавить заметку к заказу..."
                rows={2}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-1 focus:ring-[#6A55F8] resize-none"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddNote() } }}
              />
              <button
                onClick={handleAddNote}
                className="self-end px-4 py-2 bg-[#6A55F8] hover:bg-[#5040D6] text-white rounded-lg text-sm font-medium transition-colors"
              >
                Добавить
              </button>
            </div>
          </div>
        </div>

        {/* Status change */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Изменить статус</h2>
            <div className="space-y-2">
              {allStatuses.map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setCurrentStatus(key as Order['status'])}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
                    currentStatus === key ? 'bg-[#F0EDFF] text-[#6A55F8] font-medium' : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: val.color }} />
                  {val.label}
                  {currentStatus === key && <span className="ml-auto text-[#6A55F8] text-xs">✓</span>}
                </button>
              ))}
            </div>
            <button className="mt-4 w-full bg-[#6A55F8] hover:bg-[#5040D6] text-white py-2 rounded-lg text-sm font-medium transition-colors">
              Сохранить статус
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function OrdersScreen() {
  const [search, setSearch] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [showStatusFilter, setShowStatusFilter] = useState(false)
  const [showPresets, setShowPresets] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null)

  const toggleStatus = (s: string) => {
    setSelectedStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  const applyPreset = (statuses: string[]) => {
    setSelectedStatuses(statuses)
    setShowPresets(false)
  }

  const filtered = orders.filter(o => {
    const matchSearch = search === '' ||
      o.client.toLowerCase().includes(search.toLowerCase()) ||
      o.email.toLowerCase().includes(search.toLowerCase()) ||
      o.product.toLowerCase().includes(search.toLowerCase())
    const matchStatus = selectedStatuses.length === 0 || selectedStatuses.includes(o.status)
    return matchSearch && matchStatus
  })

  const totalRevenue = filtered.filter(o => o.status === 'paid').reduce((sum, o) => sum + o.amount, 0)

  const selectedOrder = orders.find(o => o.id === selectedOrderId)

  if (selectedOrder) {
    return (
      <div className="p-6">
        <OrderDetail order={selectedOrder} onBack={() => setSelectedOrderId(null)} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Заказы</h1>
          <p className="text-sm text-gray-500 mt-0.5">{orders.length} заказов · выручка {totalRevenue.toLocaleString('ru')} ₽</p>
        </div>
        <button className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Создать заказ
        </button>
      </div>

      {/* Filters bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            type="text"
            placeholder="Поиск по клиенту, email, продукту..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8]"
          />
        </div>

        {/* Status filter */}
        <div className="relative">
          <button
            onClick={() => { setShowStatusFilter(!showStatusFilter); setShowPresets(false) }}
            className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors flex items-center gap-1.5 ${
              selectedStatuses.length > 0 ? 'border-[#6A55F8] bg-[#F0EDFF] text-[#6A55F8]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Статус
            {selectedStatuses.length > 0 && (
              <span className="bg-[#6A55F8] text-white rounded-full w-4.5 h-4.5 text-[10px] flex items-center justify-center">{selectedStatuses.length}</span>
            )}
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {showStatusFilter && (
            <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 z-50 p-2 min-w-[180px]">
              {allStatuses.map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => toggleStatus(key)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedStatuses.includes(key) ? 'bg-[#F0EDFF] text-[#6A55F8]' : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: val.color }} />
                  {val.label}
                  {selectedStatuses.includes(key) && <span className="ml-auto text-[#6A55F8]">✓</span>}
                </button>
              ))}
              {selectedStatuses.length > 0 && (
                <button
                  onClick={() => setSelectedStatuses([])}
                  className="w-full text-xs text-gray-400 hover:text-gray-600 mt-1 py-1"
                >
                  Сбросить
                </button>
              )}
            </div>
          )}
        </div>

        {/* Presets */}
        <div className="relative">
          <button
            onClick={() => { setShowPresets(!showPresets); setShowStatusFilter(false) }}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
          >
            Пресеты
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {showPresets && (
            <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 z-50 p-2 min-w-[180px]">
              {presets.map(p => (
                <button
                  key={p.name}
                  onClick={() => applyPreset(p.statuses)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-50 text-gray-700 transition-colors"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Date range (visual placeholder) */}
        <input
          type="date"
          defaultValue="2026-04-01"
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600"
        />
        <span className="text-gray-400 text-sm">—</span>
        <input
          type="date"
          defaultValue="2026-04-06"
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600"
        />
      </div>

      {/* Active filters display */}
      {selectedStatuses.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">Фильтры:</span>
          {selectedStatuses.map(s => {
            const conf = orderStatuses[s]
            return (
              <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: conf?.color }}>
                {conf?.label}
                <button onClick={() => toggleStatus(s)} className="hover:opacity-75">×</button>
              </span>
            )
          })}
          <button onClick={() => setSelectedStatuses([])} className="text-xs text-gray-400 hover:text-gray-600">Сбросить все</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 w-[70px]">№</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Клиент</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Продукт</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 w-[100px]">Тариф</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 w-[110px]">Сумма</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 w-[100px]">Статус</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 w-[140px]">Дата</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(order => {
              const statusConf = orderStatuses[order.status] ?? { label: order.status, color: '#94A3B8' }
              return (
                <tr
                  key={order.id}
                  className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => setSelectedOrderId(order.id)}
                >
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">#{order.id}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 truncate">{order.client}</div>
                    <div className="text-xs text-gray-400 truncate">{order.email}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700 truncate">{order.product}</td>
                  <td className="px-4 py-3 text-gray-500 truncate">{order.tariff}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{order.amount.toLocaleString('ru')} ₽</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: statusConf.color }}>
                      {statusConf.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{order.date}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">Нет заказов по выбранным фильтрам</div>
        )}
      </div>
    </div>
  )
}
