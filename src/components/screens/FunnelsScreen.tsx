'use client'

import { useState } from 'react'
import { funnels, clients } from '@/lib/mock-data'

type Funnel = typeof funnels[number]

const stageTypeIcon: Record<string, string> = {
  bot: '🤖', landing: '🌐', order: '📋', payment: '💳', learning: '🎓',
}
const stageTypeLabel: Record<string, string> = {
  bot: 'Чат-бот', landing: 'Сайт', order: 'Заказ', payment: 'Оплата', learning: 'Обучение',
}

const stageTypes = [
  { type: 'bot', icon: '🤖', label: 'Чат-бот' },
  { type: 'landing', icon: '🌐', label: 'Сайт / Лендинг' },
  { type: 'order', icon: '📋', label: 'Заказ' },
  { type: 'payment', icon: '💳', label: 'Оплата' },
  { type: 'learning', icon: '🎓', label: 'Обучение' },
]

// Fake users per stage
const fakeStageUsers: Record<string, typeof clients> = {
  'Telegram-бот': clients.slice(0, 5),
  'VSL Видео': clients.slice(1, 4),
  'Оффер': clients.slice(2, 4),
  'Заказ создан': [clients[1], clients[6]],
  'Оплата': [clients[0], clients[2], clients[5], clients[7]],
  'Обучение': [clients[2], clients[7]],
}

function FunnelDetail({ funnel, onBack }: { funnel: Funnel; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<'settings' | 'analytics' | 'users'>('settings')
  const [stages, setStages] = useState(funnel.stagesList)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [aiInput, setAiInput] = useState('')
  const [aiMessages, setAiMessages] = useState([
    { from: 'ai', text: 'Привет! Я помогу настроить воронку. Опиши что нужно изменить.' },
  ])
  const [selectedStageIdx, setSelectedStageIdx] = useState<number | null>(null)

  const totalClients = stages[0]?.clients ?? 0

  function addStage(type: string) {
    setStages(prev => [...prev, { name: `Новый: ${stageTypeLabel[type]}`, type, clients: 0, conversion: 0 }])
    setShowAddMenu(false)
  }

  function sendAI() {
    if (!aiInput.trim()) return
    setAiMessages(prev => [...prev, { from: 'user', text: aiInput }, { from: 'ai', text: 'Понял! Обновляю воронку...' }])
    setAiInput('')
  }

  const tabs = [
    { id: 'settings' as const, label: 'Настройка воронки' },
    { id: 'analytics' as const, label: 'Аналитика' },
    { id: 'users' as const, label: 'Пользователи' },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">← Назад</button>
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

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-100">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${
              activeTab === tab.id ? 'border-[#6A55F8] text-[#6A55F8]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB: Настройка воронки */}
      {activeTab === 'settings' && (
        <div className="flex gap-4">
          {/* Left: Stage list */}
          <div className="flex-1">
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {stages.map((stage, idx) => {
                const prevClients = idx === 0 ? stage.clients : stages[idx - 1].clients
                const convPct = idx === 0 ? null : (prevClients > 0 ? Math.round((stage.clients / prevClients) * 100) : 0)

                return (
                  <div key={idx} className="flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors cursor-pointer group">
                    {/* Number */}
                    <div className="w-8 h-8 rounded-lg bg-[#F0EDFF] flex items-center justify-center text-sm font-bold text-[#6A55F8] flex-shrink-0">
                      {idx + 1}
                    </div>
                    {/* Icon */}
                    <div className="text-lg flex-shrink-0">{stageTypeIcon[stage.type] ?? '📌'}</div>
                    {/* Name + type */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{stage.name}</p>
                      <p className="text-xs text-gray-400">{stageTypeLabel[stage.type] ?? stage.type}</p>
                    </div>
                    {/* Stats */}
                    <div className="flex items-center gap-4 flex-shrink-0">
                      {convPct !== null && (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          convPct >= 70 ? 'bg-green-100 text-green-700' : convPct >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
                        }`}>
                          {convPct}%
                        </span>
                      )}
                      <span className="text-sm font-bold text-[#6A55F8]">{stage.clients}</span>
                      <span className="text-xs text-gray-400">чел.</span>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button className="text-xs text-[#6A55F8] font-medium border border-[#6A55F8]/30 rounded-lg px-2 py-1 hover:bg-[#F0EDFF]">
                        Настроить
                      </button>
                      <button className="text-xs text-gray-400 hover:text-red-500 px-1">✕</button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Add stage */}
            <div className="relative mt-3">
              <button
                onClick={() => setShowAddMenu(!showAddMenu)}
                className="w-full py-3.5 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-[#6A55F8] hover:text-[#6A55F8] transition-colors font-medium"
              >
                + Добавить этап
              </button>
              {showAddMenu && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 z-50 p-2">
                  <p className="text-xs text-gray-400 px-3 py-1.5 font-medium">Выберите тип этапа:</p>
                  {stageTypes.map(st => (
                    <button
                      key={st.type}
                      onClick={() => addStage(st.type)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#F0EDFF] transition-colors text-left"
                    >
                      <span className="text-lg">{st.icon}</span>
                      <span className="text-sm font-medium text-gray-800">{st.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: AI assistant */}
          <div className="flex flex-col w-[300px] flex-shrink-0 bg-white rounded-xl border border-gray-100 overflow-hidden h-[500px]">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[#6A55F8] flex items-center justify-center text-white text-xs font-bold">AI</div>
              <span className="text-sm font-semibold text-gray-800">AI-помощник</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {aiMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    msg.from === 'user' ? 'bg-[#6A55F8] text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-3 py-3 border-t border-gray-100 flex gap-2">
              <input
                type="text"
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendAI()}
                placeholder="Настроить воронку..."
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]"
              />
              <button onClick={sendAI} className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-3 py-2 rounded-lg text-sm transition-colors">→</button>
            </div>
          </div>
        </div>
      )}

      {/* TAB: Аналитика */}
      {activeTab === 'analytics' && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-500 mb-1">Вошли в воронку</p>
              <p className="text-2xl font-bold text-gray-900">{totalClients}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-500 mb-1">Дошли до конца</p>
              <p className="text-2xl font-bold text-[#6A55F8]">{stages[stages.length - 1]?.clients ?? 0}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-500 mb-1">Итоговая конверсия</p>
              <p className="text-2xl font-bold text-green-600">{funnel.conversion}%</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-500 mb-1">Этапов</p>
              <p className="text-2xl font-bold text-gray-900">{stages.length}</p>
            </div>
          </div>

          {/* Funnel bars */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Конверсия по этапам</h3>
            <div className="space-y-3">
              {stages.map((stage, idx) => {
                const barWidth = totalClients > 0 ? Math.max(8, Math.round((stage.clients / totalClients) * 100)) : 8
                const prevClients = idx === 0 ? stage.clients : stages[idx - 1].clients
                const convPct = idx === 0 ? 100 : (prevClients > 0 ? Math.round((stage.clients / prevClients) * 100) : 0)

                return (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-[#F0EDFF] flex items-center justify-center text-sm flex-shrink-0">
                      {stageTypeIcon[stage.type] ?? '📌'}
                    </div>
                    <div className="w-32 flex-shrink-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{stage.name}</p>
                    </div>
                    <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                      <div
                        className="h-5 rounded-full flex items-center px-2"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: idx === 0 ? '#6A55F8' : idx === stages.length - 1 ? '#10B981' : '#8B7BFA',
                        }}
                      >
                        {barWidth >= 15 && <span className="text-white text-[10px] font-medium">{stage.clients}</span>}
                      </div>
                    </div>
                    <div className="w-16 text-right flex-shrink-0">
                      <span className="text-xs font-semibold text-gray-700">{stage.clients} чел.</span>
                    </div>
                    <div className="w-12 text-right flex-shrink-0">
                      {idx > 0 && (
                        <span className={`text-xs font-medium ${convPct >= 70 ? 'text-green-600' : convPct >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                          {convPct}%
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB: Пользователи */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Stage selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-500">Этап:</span>
            {stages.map((stage, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedStageIdx(selectedStageIdx === idx ? null : idx)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  selectedStageIdx === idx ? 'bg-[#6A55F8] text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {stageTypeIcon[stage.type]} {stage.name}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${selectedStageIdx === idx ? 'bg-white/20' : 'bg-gray-100'}`}>
                  {stage.clients}
                </span>
              </button>
            ))}
          </div>

          {/* User list */}
          {selectedStageIdx !== null ? (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                <p className="text-sm font-semibold text-gray-700">
                  {stageTypeIcon[stages[selectedStageIdx].type]} {stages[selectedStageIdx].name} — {stages[selectedStageIdx].clients} человек
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Имя', 'Email', 'Telegram', 'Последнее действие', 'Выручка'].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(fakeStageUsers[stages[selectedStageIdx].name] ?? clients.slice(0, 3)).map(user => (
                    <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8]">
                            {user.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <span className="font-medium text-gray-900">{user.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{user.email}</td>
                      <td className="px-4 py-3 text-gray-500">{user.telegram}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{user.lastAction}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {user.revenue > 0 ? `${user.revenue.toLocaleString('ru')} ₽` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400 text-sm">
              Выберите этап воронки, чтобы увидеть пользователей
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function FunnelsScreen() {
  const [selectedFunnelId, setSelectedFunnelId] = useState<number | null>(null)

  const selectedFunnel = funnels.find(f => f.id === selectedFunnelId)

  if (selectedFunnel) {
    return <FunnelDetail funnel={selectedFunnel} onBack={() => setSelectedFunnelId(null)} />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Воронки</h1>
          <p className="text-sm text-gray-500 mt-0.5">Настройте путь клиента от первого касания до оплаты</p>
        </div>
        <button className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Создать воронку
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {funnels.map(funnel => (
          <button
            key={funnel.id}
            onClick={() => setSelectedFunnelId(funnel.id)}
            className="w-full bg-white rounded-xl border border-gray-100 p-5 flex items-center justify-between hover:border-[#6A55F8]/30 hover:shadow-sm transition-all text-left"
          >
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
            <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        ))}
      </div>
    </div>
  )
}
