'use client'

import { useState } from 'react'
import { funnels } from '@/lib/mock-data'

const stageTypeIcon: Record<string, string> = {
  bot: '🤖',
  landing: '🌐',
  order: '📋',
  payment: '💳',
  learning: '🎓',
}

const templates = [
  { name: 'Автовебинар', desc: '6 этапов: бот → видео → оффер → оплата → обучение', icon: '🎥' },
  { name: 'Лид-магнит', desc: '3 этапа: бот → PDF → оффер мини-курса', icon: '🧲' },
  { name: 'Запуск курса', desc: '5 этапов: прогрев → регистрация → вебинар → оффер → оплата', icon: '🚀' },
]

export default function FunnelsScreen() {
  const [selectedFunnel, setSelectedFunnel] = useState<number | null>(null)

  const selected = funnels.find(f => f.id === selectedFunnel)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Воронки</h1>
          <p className="text-sm text-gray-500 mt-0.5">Настройте путь клиента от первого касания до оплаты</p>
        </div>
        <button className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Создать воронку
        </button>
      </div>

      {/* Funnel list */}
      <div className="grid grid-cols-1 gap-4">
        {funnels.map(funnel => (
          <div
            key={funnel.id}
            onClick={() => setSelectedFunnel(selectedFunnel === funnel.id ? null : funnel.id)}
            className="bg-white rounded-xl border border-gray-100 p-5 cursor-pointer hover:border-[#6A55F8] hover:shadow-sm transition-all"
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
              <div className="text-gray-400 text-sm">{selectedFunnel === funnel.id ? '▲' : '▼'}</div>
            </div>

            {/* Expanded: pipeline view */}
            {selectedFunnel === funnel.id && (
              <div className="mt-5 pt-5 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">Этапы воронки</p>
                <div className="flex items-stretch gap-0 overflow-x-auto pb-2">
                  {funnel.stagesList.map((stage, idx) => (
                    <div key={idx} className="flex items-center">
                      <div className="flex flex-col items-center min-w-[110px]">
                        <div className="bg-[#F0EDFF] rounded-lg px-3 py-2.5 text-center w-full">
                          <div className="text-base mb-1">{stageTypeIcon[stage.type] || '📌'}</div>
                          <div className="text-xs font-medium text-gray-800 leading-tight">{stage.name}</div>
                          <div className="text-xs text-[#6A55F8] font-semibold mt-1">{stage.clients} чел.</div>
                          {idx > 0 && (
                            <div className="text-[10px] text-gray-400">{stage.conversion}%</div>
                          )}
                        </div>
                      </div>
                      {idx < funnel.stagesList.length - 1 && (
                        <div className="flex items-center px-1">
                          <div className="w-6 h-[2px] bg-gray-200" />
                          <div className="text-gray-300 text-xs">›</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Templates */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Шаблоны</h2>
        <div className="grid grid-cols-3 gap-4">
          {templates.map(t => (
            <div key={t.name} className="bg-white rounded-xl border border-gray-100 p-4 hover:border-[#6A55F8] hover:shadow-sm transition-all cursor-pointer">
              <div className="text-2xl mb-2">{t.icon}</div>
              <h3 className="font-medium text-gray-900 text-sm">{t.name}</h3>
              <p className="text-xs text-gray-500 mt-1">{t.desc}</p>
              <button className="mt-3 text-xs text-[#6A55F8] font-medium hover:underline">Использовать →</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
