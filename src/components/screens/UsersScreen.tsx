'use client'

import { useState } from 'react'
import { clients, crmStages, orders, orderStatuses } from '@/lib/mock-data'

type Role = 'пользователь' | 'клиент' | 'куратор' | 'админ' | 'владелец'
type Client = typeof clients[number]

const roleConfig: Record<Role, { color: string }> = {
  пользователь: { color: 'bg-gray-100 text-gray-600' },
  клиент: { color: 'bg-blue-100 text-blue-700' },
  куратор: { color: 'bg-purple-100 text-purple-700' },
  админ: { color: 'bg-amber-100 text-amber-700' },
  владелец: { color: 'bg-green-100 text-green-700' },
}

const rolesByIndex: Role[] = ['клиент', 'клиент', 'клиент', 'пользователь', 'пользователь', 'клиент', 'пользователь', 'клиент', 'пользователь', 'пользователь']

function stageLabel(stageId: string) {
  return crmStages.find(s => s.id === stageId)?.name ?? stageId
}
function stageColor(stageId: string) {
  return crmStages.find(s => s.id === stageId)?.color ?? '#94A3B8'
}

function UserDetail({ client, role, onBack }: { client: Client; role: Role; onBack: () => void }) {
  const [email, setEmail] = useState(client.email)
  const roleCfg = roleConfig[role]

  const userOrders = orders.filter(o => o.client === client.name)
  const totalRevenue = client.revenue

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          ← Назад
        </button>
        <h1 className="text-xl font-bold text-gray-900">Профиль пользователя</h1>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* LEFT: User info */}
        <div className="col-span-2 space-y-4">
          {/* Profile card */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-16 h-16 rounded-2xl bg-[#F0EDFF] flex items-center justify-center text-2xl font-bold text-[#6A55F8] flex-shrink-0">
                {client.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-gray-900">{client.name}</h2>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleCfg.color}`}>{role}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: stageColor(client.stage) }}
                  >
                    {stageLabel(client.stage)}
                  </span>
                  <span className="text-xs text-gray-500">{client.lastAction} · {client.lastActionTime}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-1 focus:ring-[#6A55F8]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Телефон</label>
                <p className="px-3 py-2 rounded-lg border border-gray-100 bg-gray-50 text-sm text-gray-700">{client.phone}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Telegram</label>
                <a
                  href={`https://t.me/${client.telegram.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 bg-gray-50 text-sm text-[#6A55F8] hover:underline"
                >
                  {client.telegram} →
                </a>
              </div>
            </div>
          </div>

          {/* Orders */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Заказы</h3>
            {userOrders.length === 0 ? (
              <p className="text-sm text-gray-400">Заказов нет</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['№', 'Продукт', 'Тариф', 'Сумма', 'Статус', 'Дата'].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-500 pb-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {userOrders.map(o => {
                    const sc = orderStatuses[o.status] ?? { label: o.status, color: '#94A3B8' }
                    return (
                      <tr key={o.id} className="border-b border-gray-50">
                        <td className="py-2.5 text-gray-400 text-xs font-mono">#{o.id}</td>
                        <td className="py-2.5 text-gray-700">{o.product}</td>
                        <td className="py-2.5 text-gray-500">{o.tariff}</td>
                        <td className="py-2.5 font-semibold text-gray-900">{o.amount.toLocaleString('ru')} ₽</td>
                        <td className="py-2.5">
                          <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: sc.color }}>{sc.label}</span>
                        </td>
                        <td className="py-2.5 text-gray-400 text-xs">{o.date}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Revenue */}
          <div className="bg-[#F0EDFF] rounded-xl p-5">
            <p className="text-xs text-[#6A55F8] font-medium mb-1">Выручка от пользователя</p>
            <p className="text-3xl font-bold text-[#6A55F8]">{totalRevenue > 0 ? `${totalRevenue.toLocaleString('ru')} ₽` : '—'}</p>
            <p className="text-xs text-gray-500 mt-1">{client.orders} заказ(ов) всего</p>
          </div>
        </div>

        {/* RIGHT: Actions */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Действия</h3>
            <button className="w-full text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2.5 hover:bg-gray-50 transition-colors text-left">
              🔑 Сбросить пароль
            </button>
            <button className="w-full text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2.5 hover:bg-gray-50 transition-colors text-left">
              👤 Войти от его лица
            </button>
            <button className="w-full text-sm text-[#6A55F8] border border-[#6A55F8] rounded-lg px-3 py-2.5 hover:bg-[#F0EDFF] transition-colors text-left font-medium">
              🎭 Изменить роль
            </button>
          </div>

          {client.tags.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Теги</h3>
              <div className="flex flex-wrap gap-2">
                {client.tags.map(tag => (
                  <span key={tag} className="bg-[#F0EDFF] text-[#6A55F8] rounded-full px-2.5 py-0.5 text-xs font-medium">{tag}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function UsersScreen() {
  const [search, setSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)

  const filtered = clients.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    c.telegram.toLowerCase().includes(search.toLowerCase())
  )

  if (selectedUserId !== null) {
    const client = clients.find(c => c.id === selectedUserId)
    const idx = clients.findIndex(c => c.id === selectedUserId)
    const role = rolesByIndex[idx] ?? 'пользователь'
    if (client) {
      return <UserDetail client={client} role={role} onBack={() => setSelectedUserId(null)} />
    }
  }

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
                <tr
                  key={client.id}
                  className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => setSelectedUserId(client.id)}
                >
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
