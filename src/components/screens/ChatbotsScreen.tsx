'use client'

import { useState } from 'react'
import { chatbots, botSteps, clients } from '@/lib/mock-data'

type Chatbot = typeof chatbots[number]

const stepTypeIcon: Record<string, string> = {
  message: '💬',
  button: '🔘',
  delay: '⏱',
  condition: '⚡',
}

const fakeFunnelSteps = [
  { step: 1, label: 'Старт', users: 487, next: 312 },
  { step: 2, label: 'Шаг 2: Видео', users: 312, next: 189 },
  { step: 3, label: 'Шаг 3: Кнопка', users: 189, next: 156 },
  { step: 4, label: 'Шаг 4: Дожим 1', users: 156, next: 84 },
  { step: 5, label: 'Шаг 5: Дожим 2', users: 84, next: 62 },
  { step: 6, label: 'Шаг 6: Оффер', users: 62, next: 0 },
]

const fakeChatAI = [
  { from: 'ai', text: 'Привет! Я помогу настроить сценарий бота. Что хочешь изменить?' },
  { from: 'user', text: 'Добавь дожим через 3 часа если не перешёл' },
  { from: 'ai', text: 'Добавил шаг "Дожим #3" с задержкой 3 часа после шага 5. Включить его?' },
  { from: 'user', text: 'Да, включи' },
  { from: 'ai', text: 'Готово! Шаг активирован. Хочешь посмотреть аналитику воронки?' },
]

function BotDetail({ bot, onBack }: { bot: Chatbot; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<'scenario' | 'users' | 'analytics'>('scenario')
  const [chatInput, setChatInput] = useState('')
  const [aiMessages, setAiMessages] = useState(fakeChatAI)
  const [stageFilter, setStageFilter] = useState<number | null>(null)

  const botUsers = clients.slice(0, 6)

  function sendMessage() {
    if (!chatInput.trim()) return
    setAiMessages(prev => [
      ...prev,
      { from: 'user', text: chatInput },
      { from: 'ai', text: 'Понял! Обрабатываю запрос и обновляю сценарий...' },
    ])
    setChatInput('')
  }

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
        <div className="w-9 h-9 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-lg">🤖</div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{bot.name}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${bot.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {bot.active ? 'Активен' : 'Отключён'}
            </span>
          </div>
          <p className="text-xs text-gray-500">{bot.subscribers.toLocaleString('ru')} подписчиков</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-100 pb-0">
        {([['scenario', 'Сценарий'], ['users', 'Пользователи'], ['analytics', 'Аналитика']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${
              activeTab === key ? 'border-[#6A55F8] text-[#6A55F8]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Scenario tab */}
      {activeTab === 'scenario' && (
        <div className="flex gap-4">
          {/* LEFT: Steps list */}
          <div className="flex-1 space-y-2">
            {botSteps.map((step, idx) => (
              <div
                key={step.id}
                className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-start gap-3 hover:border-[#6A55F8]/30 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8] flex-shrink-0 mt-0.5">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-base">{stepTypeIcon[step.type] ?? '📌'}</span>
                    <span className="text-xs font-semibold text-[#6A55F8] bg-[#F0EDFF] rounded-full px-2 py-0.5">{step.condition}</span>
                    {step.delay && step.delay !== '0' && (
                      <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">⏱ {step.delay}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed line-clamp-2">{step.text}</p>
                </div>
                <button className="text-xs text-gray-400 hover:text-[#6A55F8] transition-colors flex-shrink-0">✏</button>
              </div>
            ))}
            <button className="w-full py-3 rounded-xl border border-dashed border-gray-200 text-sm text-gray-400 hover:border-[#6A55F8] hover:text-[#6A55F8] transition-colors">
              + Добавить шаг
            </button>
          </div>

          {/* RIGHT: AI Chat */}
          <div className="flex flex-col w-[300px] flex-shrink-0 bg-white rounded-xl border border-gray-100 overflow-hidden h-[600px]">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[#6A55F8] flex items-center justify-center text-white text-xs font-bold">AI</div>
              <span className="text-sm font-semibold text-gray-800">AI-помощник</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {aiMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    msg.from === 'user'
                      ? 'bg-[#6A55F8] text-white rounded-br-none'
                      : 'bg-gray-100 text-gray-800 rounded-bl-none'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-3 py-3 border-t border-gray-100 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="Настроить сценарий..."
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-1 focus:ring-[#6A55F8]"
              />
              <button
                onClick={sendMessage}
                className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-3 py-2 rounded-lg text-sm transition-colors"
              >
                →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Users tab */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-500">Фильтр по шагу:</span>
            <button
              onClick={() => setStageFilter(null)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${stageFilter === null ? 'bg-[#6A55F8] text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              Все
            </button>
            {fakeFunnelSteps.map(s => (
              <button
                key={s.step}
                onClick={() => setStageFilter(s.step)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${stageFilter === s.step ? 'bg-[#6A55F8] text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                Шаг {s.step}
              </button>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Пользователь', 'Telegram', 'Текущий шаг', 'Последнее действие'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {botUsers.map((u, i) => {
                  const stepNum = (i % fakeFunnelSteps.length) + 1
                  if (stageFilter !== null && stageFilter !== stepNum) return null
                  return (
                    <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8]">
                            {u.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <span className="font-medium text-gray-900">{u.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{u.telegram}</td>
                      <td className="px-4 py-3">
                        <span className="bg-[#F0EDFF] text-[#6A55F8] rounded-full px-2 py-0.5 text-xs font-medium">Шаг {stepNum}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{u.lastAction} · {u.lastActionTime}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Analytics tab */}
      {activeTab === 'analytics' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[#F0EDFF] rounded-xl p-4">
              <p className="text-2xl font-bold text-[#6A55F8]">{bot.subscribers.toLocaleString('ru')}</p>
              <p className="text-xs text-gray-500 mt-0.5">Всего подписчиков</p>
            </div>
            <div className="bg-[#F0EDFF] rounded-xl p-4">
              <p className="text-2xl font-bold text-[#6A55F8]">{bot.messages.toLocaleString('ru')}</p>
              <p className="text-xs text-gray-500 mt-0.5">Сообщений отправлено</p>
            </div>
            <div className="bg-[#F0EDFF] rounded-xl p-4">
              <p className="text-2xl font-bold text-[#6A55F8]">12.7%</p>
              <p className="text-xs text-gray-500 mt-0.5">Итоговая конверсия</p>
            </div>
          </div>

          <p className="text-sm font-semibold text-gray-800">Воронка по шагам</p>
          <div className="space-y-3">
            {fakeFunnelSteps.map((step, idx) => {
              const prevUsers = idx === 0 ? step.users : fakeFunnelSteps[idx - 1].users
              const conv = idx === 0 ? 100 : Math.round((step.users / prevUsers) * 100)
              const width = Math.round((step.users / fakeFunnelSteps[0].users) * 100)
              return (
                <div key={step.step} className="bg-white rounded-xl border border-gray-100 p-4 hover:border-[#6A55F8]/30 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#6A55F8] bg-[#F0EDFF] w-6 h-6 rounded-full flex items-center justify-center">{step.step}</span>
                      <span className="text-sm font-medium text-gray-800">{step.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-gray-900">{step.users} чел.</span>
                      {idx > 0 && (
                        <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${conv >= 70 ? 'bg-green-100 text-green-700' : conv >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                          {conv}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-[#6A55F8] h-2 rounded-full transition-all" style={{ width: `${width}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ChatbotsScreen() {
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const selectedBot = chatbots.find(b => b.id === selectedId)

  if (selectedBot) {
    return <BotDetail bot={selectedBot} onBack={() => setSelectedId(null)} />
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Чат-боты</h1>
          <p className="text-sm text-gray-500 mt-0.5">Управляйте Telegram-ботами и автосценариями</p>
        </div>
        <button className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Создать бота
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {chatbots.map(bot => (
          <div key={bot.id} className="bg-white rounded-xl border border-gray-100 p-5 flex items-center justify-between hover:border-[#6A55F8]/30 transition-all">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-xl">🤖</div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">{bot.name}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${bot.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {bot.active ? 'Активен' : 'Отключён'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {bot.subscribers.toLocaleString('ru')} подписчиков · {bot.messages.toLocaleString('ru')} сообщений · {bot.lastActivity}
                </p>
              </div>
            </div>
            <button
              onClick={() => setSelectedId(bot.id)}
              className="px-3 py-1.5 rounded-lg bg-[#6A55F8] text-white text-sm hover:bg-[#5040D6] transition-colors"
            >
              Редактировать
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
