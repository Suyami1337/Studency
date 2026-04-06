'use client'

import { useState } from 'react'
import { funnels, dashboardStats } from '@/lib/mock-data'

const stageTypeIcon: Record<string, string> = {
  bot: '🤖',
  landing: '🌐',
  order: '📋',
  payment: '💳',
  learning: '🎓',
}

const keyMetrics = [
  { label: 'Подписчиков всего', value: dashboardStats.activeSubscribers.toLocaleString('ru'), icon: '👥', color: 'bg-purple-50 text-purple-700' },
  { label: 'Конверсия в оплату', value: `${dashboardStats.conversionRate}%`, icon: '📈', color: 'bg-green-50 text-green-700' },
  { label: 'Заказов за месяц', value: dashboardStats.ordersMonth.toString(), icon: '📋', color: 'bg-blue-50 text-blue-700' },
  { label: 'Новых за месяц', value: dashboardStats.newUsersMonth.toString(), icon: '🆕', color: 'bg-amber-50 text-amber-700' },
]

export default function AnalyticsScreen() {
  const [selectedFunnelId, setSelectedFunnelId] = useState<number | null>(null)

  const selectedFunnel = funnels.find(f => f.id === selectedFunnelId)

  // If no funnel selected — show funnel picker
  if (!selectedFunnel) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Аналитика</h1>
          <p className="text-sm text-gray-500 mt-0.5">Выберите воронку для просмотра аналитики</p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {funnels.map(f => (
            <button
              key={f.id}
              onClick={() => setSelectedFunnelId(f.id)}
              className="bg-white rounded-xl border border-gray-100 p-5 flex items-center justify-between hover:border-[#6A55F8]/30 hover:shadow-sm transition-all text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-2xl">📈</div>
                <div>
                  <h3 className="font-semibold text-gray-900">{f.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{f.stages} этапов · {f.clients} клиентов · конверсия {f.conversion}%</p>
                </div>
              </div>
              <div className={`rounded-full px-2 py-0.5 text-xs font-medium ${f.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {f.status === 'active' ? 'Активна' : 'Черновик'}
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const stages = selectedFunnel.stagesList
  const maxClients = stages[0]?.clients ?? 1

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSelectedFunnelId(null)}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Аналитика: {selectedFunnel.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{selectedFunnel.clients} клиентов · конверсия {selectedFunnel.conversion}%</p>
        </div>
      </div>

      {/* Funnel visualization */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-5">Прохождение по этапам</h2>
        <div className="space-y-3">
          {stages.map((stage, idx) => {
            const barWidth = maxClients > 0 ? Math.max(8, Math.round((stage.clients / maxClients) * 100)) : 8
            const dropOff = idx > 0 && stages[idx - 1].clients > 0
              ? Math.round(((stages[idx - 1].clients - stage.clients) / stages[idx - 1].clients) * 100)
              : 0

            return (
              <div key={idx}>
                <div className="flex items-center gap-3 mb-1.5">
                  <div className="w-7 h-7 rounded-lg bg-[#F0EDFF] flex items-center justify-center text-sm flex-shrink-0">
                    {stageTypeIcon[stage.type] ?? '📌'}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-800">{stage.name}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="font-semibold text-gray-900">{stage.clients} чел.</span>
                        {idx > 0 && <span className="text-gray-400">(-{dropOff}%)</span>}
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-6 overflow-hidden">
                      <div
                        className="h-6 rounded-full flex items-center px-3"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: idx === 0 ? '#6A55F8' : idx === stages.length - 1 ? '#10B981' : '#8B7BFA',
                        }}
                      >
                        {barWidth >= 20 && <span className="text-white text-xs font-medium">{stage.clients} чел.</span>}
                      </div>
                    </div>
                  </div>
                </div>
                {idx < stages.length - 1 && (
                  <div className="pl-10 py-0.5 flex items-center gap-1.5 text-[10px] text-gray-400">
                    <div className="w-px h-4 bg-gray-200 ml-3" />
                    конверсия {stages[idx + 1].clients > 0 ? `${Math.round((stages[idx + 1].clients / stage.clients) * 100)}%` : '—'}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-4 gap-4">
        {keyMetrics.map(metric => (
          <div key={metric.label} className="bg-white rounded-xl border border-gray-100 p-4">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg mb-3 ${metric.color}`}>{metric.icon}</div>
            <p className="text-xl font-bold text-gray-900">{metric.value}</p>
            <p className="text-xs text-gray-500 mt-1">{metric.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
