'use client'

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
  const mainFunnel = funnels[0]
  const stages = mainFunnel.stagesList
  const maxClients = stages[0]?.clients ?? 1

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Аналитика</h1>
        <p className="text-sm text-gray-500 mt-0.5">Воронка и ключевые метрики школы</p>
      </div>

      {/* Funnel visualization */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">{mainFunnel.name}</h2>
        <p className="text-xs text-gray-500 mb-6">Прохождение клиентов по этапам</p>

        {/* Pipeline bars */}
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
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-800">{stage.name}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="font-semibold text-gray-900">{stage.clients} чел.</span>
                        {idx > 0 && (
                          <span className="text-gray-400">(-{dropOff}%)</span>
                        )}
                        {idx === 0 && (
                          <span className="text-[#6A55F8] font-medium">Старт</span>
                        )}
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-6 relative overflow-hidden">
                      <div
                        className="h-6 rounded-full flex items-center px-3 transition-all"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: idx === 0 ? '#6A55F8' : idx === stages.length - 1 ? '#10B981' : '#8B7BFA',
                        }}
                      >
                        <span className="text-white text-xs font-medium whitespace-nowrap">
                          {barWidth >= 20 ? `${stage.clients} чел.` : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Arrow between stages */}
                {idx < stages.length - 1 && (
                  <div className="flex items-center gap-3 pl-10 py-0.5">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <div className="w-px h-4 bg-gray-200 ml-3" />
                      <span className="text-[10px]">
                        конверсия {stage.clients > 0 && stages[idx + 1].clients > 0 ? `${Math.round((stages[idx + 1].clients / stage.clients) * 100)}%` : '—'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Key metrics */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Ключевые метрики</h2>
        <div className="grid grid-cols-4 gap-4">
          {keyMetrics.map(metric => (
            <div key={metric.label} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg mb-3 ${metric.color}`}>
                {metric.icon}
              </div>
              <p className="text-xl font-bold text-gray-900">{metric.value}</p>
              <p className="text-xs text-gray-500 mt-1">{metric.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue breakdown */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Выручка по дням (текущий месяц)</h2>
        <div className="flex items-end gap-1 h-32">
          {[29900, 59800, 0, 89700, 29900, 149500, 0, 29900, 59800, 89700, 0, 29900, 119600, 29900, 0].map((val, i) => {
            const maxVal = 149500
            const heightPct = val > 0 ? Math.max(6, Math.round((val / maxVal) * 100)) : 3
            return (
              <div key={i} className="flex flex-col items-center flex-1 gap-1">
                <div
                  className="w-full rounded-t-sm transition-all"
                  style={{ height: `${heightPct}%`, backgroundColor: val > 0 ? '#6A55F8' : '#E5E7EB' }}
                />
                <span className="text-[9px] text-gray-400">{i + 1}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
