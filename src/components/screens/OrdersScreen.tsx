'use client'

import { useState } from 'react'
import { orders, orderStatuses } from '@/lib/mock-data'

type FilterTab = 'all' | 'new' | 'paid' | 'refund'

const tabs: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'new', label: 'Новые' },
  { id: 'paid', label: 'Оплаченные' },
  { id: 'refund', label: 'Возвраты' },
]

export default function OrdersScreen() {
  const [activeTab, setActiveTab] = useState<FilterTab>('all')

  const filtered = activeTab === 'all' ? orders : orders.filter(o => o.status === activeTab)

  const totalRevenue = filtered
    .filter(o => o.status === 'paid')
    .reduce((sum, o) => sum + o.amount, 0)

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Заказы</h1>
          <p className="text-sm text-gray-500 mt-0.5">{orders.length} заказов · выручка {totalRevenue.toLocaleString('ru')} ₽</p>
        </div>
        <button className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Создать заказ
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map(tab => {
          const count = tab.id === 'all' ? orders.length : orders.filter(o => o.status === tab.id).length
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {tab.label}
              <span className={`text-xs rounded-full px-1.5 py-0.5 ${activeTab === tab.id ? 'bg-[#F0EDFF] text-[#6A55F8]' : 'bg-gray-200 text-gray-500'}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Orders table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['№', 'Клиент', 'Продукт', 'Тариф', 'Сумма', 'Статус', 'Дата', ''].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(order => {
              const statusConf = orderStatuses[order.status] ?? { label: order.status, color: '#94A3B8' }
              return (
                <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer">
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">#{order.id}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{order.client}</div>
                    <div className="text-xs text-gray-400">{order.email}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{order.product}</td>
                  <td className="px-4 py-3 text-gray-500">{order.tariff}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{order.amount.toLocaleString('ru')} ₽</td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: statusConf.color }}
                    >
                      {statusConf.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{order.date}</td>
                  <td className="px-4 py-3">
                    <button className="text-xs text-gray-400 hover:text-[#6A55F8] transition-colors">···</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">Нет заказов в этой категории</div>
        )}
      </div>
    </div>
  )
}
