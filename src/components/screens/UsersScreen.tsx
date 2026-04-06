'use client'

import { useState } from 'react'
import { clients, crmStages } from '@/lib/mock-data'

type Role = 'пользователь' | 'клиент' | 'куратор' | 'админ' | 'владелец'

const roleConfig: Record<Role, { color: string }> = {
  пользователь: { color: 'bg-gray-100 text-gray-600' },
  клиент: { color: 'bg-blue-100 text-blue-700' },
  куратор: { color: 'bg-purple-100 text-purple-700' },
  админ: { color: 'bg-amber-100 text-amber-700' },
  владелец: { color: 'bg-green-100 text-green-700' },
}

// Assign fake roles to demo users
const rolesByIndex: Role[] = ['клиент', 'клиент', 'клиент', 'пользователь', 'пользователь', 'клиент', 'пользователь', 'клиент', 'пользователь', 'пользователь']

function stageLabel(stageId: string) {
  return crmStages.find(s => s.id === stageId)?.name ?? stageId
}
function stageColor(stageId: string) {
  return crmStages.find(s => s.id === stageId)?.color ?? '#94A3B8'
}

export default function UsersScreen() {
  const [search, setSearch] = useState('')

  const filtered = clients.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    c.telegram.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Пользователи</h1>
          <p className="text-sm text-gray-500 mt-0.5">{clients.length} человек в базе</p>
        </div>
        <button className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Добавить
        </button>
      </div>

      {/* Search & filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400 text-sm">🔍</div>
          <input
            type="text"
            placeholder="Поиск по имени, email, Telegram..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-1 focus:ring-[#6A55F8] transition-colors"
          />
        </div>
        <button className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-gray-300 transition-colors flex items-center gap-1.5">
          <span>⚙</span> Фильтры
        </button>
        <div className="flex gap-1">
          {(['все', 'клиент', 'пользователь'] as const).map(r => (
            <button key={r} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:border-[#6A55F8] hover:text-[#6A55F8] transition-colors capitalize">
              {r === 'все' ? 'Все роли' : r}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Имя', 'Email', 'Телефон', 'Telegram', 'Роль', 'Этап', 'Заказы', 'Выручка'].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((client, idx) => {
              const role = rolesByIndex[idx] ?? 'пользователь'
              const roleCfg = roleConfig[role]
              return (
                <tr key={client.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8] flex-shrink-0">
                        {client.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <span className="font-medium text-gray-900">{client.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{client.email}</td>
                  <td className="px-4 py-3 text-gray-500">{client.phone}</td>
                  <td className="px-4 py-3 text-gray-500">{client.telegram}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleCfg.color}`}>
                      {role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: stageColor(client.stage) }}
                    >
                      {stageLabel(client.stage)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{client.orders}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {client.revenue > 0 ? `${client.revenue.toLocaleString('ru')} ₽` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">Ничего не найдено</div>
        )}
      </div>
    </div>
  )
}
