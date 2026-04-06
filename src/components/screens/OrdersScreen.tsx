'use client'

import { useState } from 'react'
import { orders, orderStatuses } from '@/lib/mock-data'

const allStatuses = Object.entries(orderStatuses)

const presets = [
  { name: 'Неоплаченные', statuses: ['new', 'in_progress'] },
  { name: 'Успешные', statuses: ['paid'] },
  { name: 'Проблемные', statuses: ['refund', 'cancelled'] },
]

export default function OrdersScreen() {
  const [search, setSearch] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [showStatusFilter, setShowStatusFilter] = useState(false)
  const [showPresets, setShowPresets] = useState(false)

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
                <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer">
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
