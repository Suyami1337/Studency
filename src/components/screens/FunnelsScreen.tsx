'use client'

import { useState } from 'react'
import { funnels } from '@/lib/mock-data'

type Funnel = typeof funnels[number]

const stageTypeIcon: Record<string, string> = {
  bot: '🤖',
  landing: '🌐',
  order: '📋',
  payment: '💳',
  learning: '🎓',
}

const stageActionButtons: Record<string, string[]> = {
  bot: ['Создать чат-бот', 'Настроить сообщения'],
  landing: ['Создать сайт', 'Привязать домен'],
  order: ['Привязать CRM', 'Настроить форму'],
  payment: ['Привязать оплату', 'Настроить тарифы'],
  learning: ['Привязать курс', 'Настроить доступ'],
}

function FunnelDetail({ funnel, onBack }: { funnel: Funnel; onBack: () => void }) {
  const [stages, setStages] = useState(funnel.stagesList)

  const totalClients = funnel.stagesList[0]?.clients ?? 0

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            ← Назад
          </button>
          <div className="w-9 h-9 rounded-lg bg-[#F0EDFF] flex items-center justify-center text-lg">🔀</div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{funnel.name}</h1>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${funnel.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {funnel.status === 'active' ? 'Активна' : 'Черновик'}
              </span>
            </div>
            <p className="text-xs text-gray-500">{stages.length} этапов · {funnel.clients} клиентов</p>
          </div>
        </div>
      </div>

      <div className="flex gap-5">
        {/* LEFT: Stage editor */}
        <div className="flex-1 space-y-3">
          {stages.map((stage, idx) => {
            const prevClients = idx === 0 ? stage.clients : stages[idx - 1].clients
            const convPct = idx === 0 ? 100 : (prevClients > 0 ? Math.round((stage.clients / prevClients) * 100) : 0)
            const actions = stageActionButtons[stage.type] ?? ['Настроить']

            return (
              <div key={idx}>
                {/* Connector arrow */}
                {idx > 0 && (
                  <div className="flex flex-col items-center py-1">
                    <div className="w-[2px] h-4 bg-gray-200" />
                    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3 py-0.5 text-xs text-gray-500">
                      <span className={`font-medium ${convPct >= 70 ? 'text-green-600' : convPct >= 40 ? 'text-amber-600' : 'text-red-500'}`}>{convPct}% конверсия</span>
                      <span>→ {stage.clients} чел.</span>
                    </div>
                    <div className="w-[2px] h-4 bg-gray-200" />
                  </div>
                )}

                <div className="bg-white rounded-xl border border-gray-100 p-4 hover:border-[#6A55F8]/30 transition-colors">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#F0EDFF] flex items-center justify-center text-base flex-shrink-0">
                        {stageTypeIcon[stage.type] ?? '📌'}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{stage.name}</p>
                        <p className="text-xs text-gray-400 capitalize">{stage.type}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <div>
                        <p className="text-base font-bold text-[#6A55F8]">{stage.clients}</p>
                        <p className="text-[10px] text-gray-400">человек</p>
                      </div>
                      <button className="text-gray-300 hover:text-gray-500 transition-colors text-lg">⋮</button>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {actions.map(action => (
                      <button
                        key={action}
                        className="text-xs text-[#6A55F8] font-medium border border-[#6A55F8]/30 rounded-lg px-2.5 py-1 hover:bg-[#F0EDFF] transition-colors"
                      >
                        {action}
                      </button>
                    ))}
                    <button className="text-xs text-gray-400 font-medium border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50 transition-colors">
                      Привязать CRM
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Add stage button */}
          <div className="flex flex-col items-center pt-1">
            <div className="w-[2px] h-4 bg-gray-200" />
          </div>
          <button
            onClick={() => setStages(prev => [...prev, { name: 'Новый этап', type: 'landing', clients: 0, conversion: 0 }])}
            className="w-full py-4 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-[#6A55F8] hover:text-[#6A55F8] transition-colors font-medium"
          >
            + Добавить этап
          </button>
        </div>

        {/* RIGHT: Analytics sidebar */}
        <div className="w-[280px] flex-shrink-0 space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-sm font-semibold text-gray-800 mb-3">Аналитика воронки</p>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Вошли в воронку</span>
                <span className="text-sm font-bold text-gray-900">{totalClients}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Итоговая конверсия</span>
                <span className="text-sm font-bold text-[#6A55F8]">{funnel.conversion}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Этапов</span>
                <span className="text-sm font-bold text-gray-900">{stages.length}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-sm font-semibold text-gray-800 mb-3">Конверсия по этапам</p>
            <div className="space-y-3">
              {stages.map((stage, idx) => {
                if (idx === 0) return null
                const prevClients = stages[idx - 1].clients
                const conv = prevClients > 0 ? Math.round((stage.clients / prevClients) * 100) : 0
                return (
                  <div key={idx}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600 truncate flex-1 pr-2">{stage.name}</span>
                      <span className={`text-xs font-semibold ${conv >= 70 ? 'text-green-600' : conv >= 40 ? 'text-amber-600' : 'text-red-500'}`}>{conv}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${conv >= 70 ? 'bg-green-500' : conv >= 40 ? 'bg-amber-500' : 'bg-red-400'}`}
                        style={{ width: `${conv}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-[#F0EDFF] rounded-xl p-4">
            <p className="text-xs text-[#6A55F8] font-medium mb-1">Потеря клиентов</p>
            <p className="text-2xl font-bold text-[#6A55F8]">
              {totalClients > 0 ? totalClients - (stages[stages.length - 1]?.clients ?? 0) : 0}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">человек не дошли до конца</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function FunnelsScreen() {
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const selectedFunnel = funnels.find(f => f.id === selectedId)

  if (selectedFunnel) {
    return <FunnelDetail funnel={selectedFunnel} onBack={() => setSelectedId(null)} />
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Воронки</h1>
          <p className="text-sm text-gray-500 mt-0.5">Настройте путь клиента от первого касания до оплаты</p>
        </div>
        <button className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Создать воронку
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {funnels.map(funnel => (
          <div
            key={funnel.id}
            className="bg-white rounded-xl border border-gray-100 p-5 hover:border-[#6A55F8]/30 transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#F0EDFF] flex items-center justify-center text-lg">🔀</div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{funnel.name}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${funnel.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {funnel.status === 'active' ? 'Активна' : 'Черновик'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {funnel.stages} этапов · {funnel.clients} клиентов · конверсия {funnel.conversion}%
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedId(funnel.id)}
                  className="px-3 py-1.5 rounded-lg bg-[#6A55F8] text-white text-sm hover:bg-[#5040D6] transition-colors"
                >
                  Редактировать
                </button>
              </div>
            </div>

            {/* Mini preview of stages */}
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {funnel.stagesList.map((stage, idx) => (
                  <div key={idx} className="flex items-center gap-1 flex-shrink-0">
                    <div className="flex items-center gap-1.5 bg-[#F0EDFF] rounded-lg px-2.5 py-1.5">
                      <span className="text-sm">{stageTypeIcon[stage.type] ?? '📌'}</span>
                      <span className="text-xs font-medium text-gray-700">{stage.name}</span>
                      {stage.clients > 0 && <span className="text-xs text-[#6A55F8] font-semibold">{stage.clients}</span>}
                    </div>
                    {idx < funnel.stagesList.length - 1 && (
                      <span className="text-gray-300 text-sm">›</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
