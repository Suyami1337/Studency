'use client'

import { dashboardStats, revenueByDay, leadsByDay, products } from '@/lib/mock-data'

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-5 ${accent ? 'bg-gradient-to-br from-[#6A55F8] to-[#8B7BFA] text-white' : 'bg-white border border-gray-100'}`}>
      <p className={`text-xs font-medium mb-1 ${accent ? 'text-white/70' : 'text-gray-500'}`}>{label}</p>
      <p className={`text-2xl font-bold ${accent ? 'text-white' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${accent ? 'text-white/60' : 'text-gray-400'}`}>{sub}</p>}
    </div>
  )
}

function MiniChart({ data, color, height = 100 }: { data: { day: string; value: number }[]; color: string; height?: number }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d, i) => (
        <div
          key={i}
          className="flex-1 rounded-t transition-all hover:opacity-80"
          style={{
            height: `${Math.max((d.value / max) * 100, 4)}%`,
            background: d.value > 0 ? color : '#E5E7EB',
          }}
          title={`${d.day} апр: ${d.value.toLocaleString('ru')}`}
        />
      ))}
    </div>
  )
}

export default function DashboardScreen() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">Апрель 2026 · AI-Маркетинг Школа</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard accent label="Выручка за месяц" value={`${dashboardStats.revenueMonth.toLocaleString('ru')} ₽`} sub={`Сегодня: ${dashboardStats.revenueToday.toLocaleString('ru')} ₽`} />
        <StatCard label="Новые пользователи" value={dashboardStats.newUsersMonth.toString()} sub={`Сегодня: +${dashboardStats.newUsersToday}`} />
        <StatCard label="Заказы" value={dashboardStats.ordersMonth.toString()} sub={`Сегодня: +${dashboardStats.ordersToday}`} />
        <StatCard label="Конверсия воронки" value={`${dashboardStats.conversionRate}%`} sub={`${dashboardStats.activeSubscribers} подписчиков`} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Выручка по дням</h3>
          <MiniChart data={revenueByDay} color="#6A55F8" height={120} />
          <div className="flex justify-between mt-2">
            <span className="text-xs text-gray-400">1 апр</span>
            <span className="text-xs text-gray-400">15 апр</span>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Лиды по дням</h3>
          <MiniChart data={leadsByDay} color="#8B7BFA" height={120} />
          <div className="flex justify-between mt-2">
            <span className="text-xs text-gray-400">1 апр</span>
            <span className="text-xs text-gray-400">15 апр</span>
          </div>
        </div>
      </div>

      {/* Products */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Продажи по продуктам</h3>
        <div className="space-y-3">
          {products.map(p => (
            <div key={p.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-[#6A55F8]" />
                <span className="text-sm text-gray-700">{p.name}</span>
              </div>
              <div className="flex items-center gap-6">
                <span className="text-sm text-gray-500">{p.sold} продаж</span>
                <span className="text-sm font-semibold text-gray-900 w-28 text-right">{p.revenue.toLocaleString('ru')} ₽</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
