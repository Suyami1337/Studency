'use client'

import { useState } from 'react'
import { chatbots, botSteps, clients } from '@/lib/mock-data'

type Chatbot = typeof chatbots[number]

const stepTypeIcon: Record<string, string> = {
  message: '💬', button: '🔘', delay: '⏱', condition: '⚡',
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
  { from: 'ai', text: 'Готово! Шаг активирован.' },
]

function BotDetail({ bot, onBack }: { bot: Chatbot; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<'scenario' | 'users' | 'analytics' | 'settings'>('scenario')
  const [showAI, setShowAI] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [aiMessages, setAiMessages] = useState(fakeChatAI)
  const [stageFilter, setStageFilter] = useState<number | null>(null)

  const botUsers = clients.slice(0, 6)

  function sendMessage() {
    if (!chatInput.trim()) return
    setAiMessages(prev => [...prev, { from: 'user', text: chatInput }, { from: 'ai', text: 'Понял! Обновляю сценарий...' }])
    setChatInput('')
  }

  const tabs = [
    { id: 'scenario' as const, label: 'Сценарий' },
    { id: 'users' as const, label: 'Пользователи' },
    { id: 'analytics' as const, label: 'Аналитика' },
    { id: 'settings' as const, label: 'Настройки' },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">← Назад</button>
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
        {activeTab === 'scenario' && (
          <button
            onClick={() => setShowAI(!showAI)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              showAI ? 'bg-[#6A55F8] text-white' : 'border border-[#6A55F8] text-[#6A55F8] hover:bg-[#F0EDFF]'
            }`}
          >
            <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">AI</div>
            {showAI ? 'Скрыть AI' : 'AI-помощник'}
          </button>
        )}
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

      {/* TAB: Сценарий */}
      {activeTab === 'scenario' && (
        <div className="flex gap-4">
          {/* Steps list */}
          <div className={`${showAI ? 'flex-1' : 'w-full'} space-y-2 transition-all`}>
            {botSteps.map((step, idx) => (
              <div key={step.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-start gap-3 hover:border-[#6A55F8]/30 transition-colors cursor-pointer group">
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
                <button className="text-xs text-gray-400 hover:text-[#6A55F8] transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100">✏</button>
              </div>
            ))}
            <button className="w-full py-3 rounded-xl border border-dashed border-gray-200 text-sm text-gray-400 hover:border-[#6A55F8] hover:text-[#6A55F8] transition-colors">
              + Добавить шаг
            </button>
          </div>

          {/* AI Chat panel */}
          {showAI && (
            <div className="flex flex-col w-[380px] flex-shrink-0 bg-white rounded-xl border border-gray-100 overflow-hidden h-[600px]">
              <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-[#6A55F8] to-[#8B7BFA] flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold">AI</div>
                <span className="text-sm font-semibold text-white">AI-помощник</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {aiMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
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
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  placeholder="Описать изменение..."
                  className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]"
                />
                <button onClick={sendMessage} className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2.5 rounded-lg text-sm transition-colors">→</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: Пользователи */}
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
                {s.label} ({s.users})
              </button>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Имя', 'Email', 'Telegram', 'Этап', 'Последнее действие'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {botUsers.map(user => (
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
                    <td className="px-4 py-3"><span className="text-xs bg-[#F0EDFF] text-[#6A55F8] rounded-full px-2 py-0.5 font-medium">Шаг 3</span></td>
                    <td className="px-4 py-3 text-xs text-gray-500">{user.lastAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: Аналитика */}
      {activeTab === 'analytics' && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Подписчиков', value: bot.subscribers.toLocaleString('ru'), color: 'bg-purple-50 text-purple-700' },
              { label: 'Сообщений', value: bot.messages.toLocaleString('ru'), color: 'bg-blue-50 text-blue-700' },
              { label: 'Конверсия', value: '12.7%', color: 'bg-green-50 text-green-700' },
              { label: 'Активных', value: '342', color: 'bg-amber-50 text-amber-700' },
            ].map(m => (
              <div key={m.label} className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-xs text-gray-500 mb-1">{m.label}</p>
                <p className="text-xl font-bold text-gray-900">{m.value}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Воронка по шагам</h3>
            <div className="space-y-2">
              {fakeFunnelSteps.map((s, idx) => {
                const maxUsers = fakeFunnelSteps[0].users
                const barW = Math.max(8, Math.round((s.users / maxUsers) * 100))
                const conv = idx > 0 ? Math.round((s.users / fakeFunnelSteps[idx - 1].users) * 100) : 100
                return (
                  <div key={s.step} className="flex items-center gap-3">
                    <div className="w-24 flex-shrink-0 text-xs text-gray-600 truncate">{s.label}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                      <div className="h-5 rounded-full bg-[#8B7BFA] flex items-center px-2" style={{ width: `${barW}%` }}>
                        {barW >= 15 && <span className="text-white text-[10px] font-medium">{s.users}</span>}
                      </div>
                    </div>
                    <div className="w-12 text-right text-xs font-semibold text-gray-700">{s.users}</div>
                    {idx > 0 && (
                      <div className={`w-10 text-right text-xs font-medium ${conv >= 70 ? 'text-green-600' : conv >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                        {conv}%
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB: Настройки */}
      {activeTab === 'settings' && (
        <div className="max-w-2xl space-y-4">
          {/* General */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Основные</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Название бота</label>
                <input type="text" defaultValue={bot.name} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Telegram Bot Token</label>
                <input type="text" defaultValue="6281934:AAHk7..." className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono text-gray-500 focus:outline-none focus:border-[#6A55F8]" />
                <p className="text-[10px] text-gray-400 mt-1">Получите токен у @BotFather в Telegram</p>
              </div>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-gray-800">Статус бота</p>
                  <p className="text-xs text-gray-500">Включён — бот отвечает на сообщения</p>
                </div>
                <div className={`w-11 h-6 rounded-full relative cursor-pointer transition-colors ${bot.active ? 'bg-[#6A55F8]' : 'bg-gray-300'}`}>
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${bot.active ? 'right-1' : 'left-1'}`} />
                </div>
              </div>
            </div>
          </div>

          {/* Behaviour */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Поведение</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-gray-800">Приветственное сообщение</p>
                  <p className="text-xs text-gray-500">Отправлять при первом запуске бота</p>
                </div>
                <div className="w-11 h-6 rounded-full relative cursor-pointer bg-[#6A55F8]">
                  <div className="absolute top-1 right-1 w-4 h-4 bg-white rounded-full shadow" />
                </div>
              </div>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-gray-800">Дожимы по расписанию</p>
                  <p className="text-xs text-gray-500">Автоматические напоминания по таймеру</p>
                </div>
                <div className="w-11 h-6 rounded-full relative cursor-pointer bg-[#6A55F8]">
                  <div className="absolute top-1 right-1 w-4 h-4 bg-white rounded-full shadow" />
                </div>
              </div>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-gray-800">Уведомления админу</p>
                  <p className="text-xs text-gray-500">Отправлять в бот при новом лиде/оплате</p>
                </div>
                <div className="w-11 h-6 rounded-full relative cursor-pointer bg-[#6A55F8]">
                  <div className="absolute top-1 right-1 w-4 h-4 bg-white rounded-full shadow" />
                </div>
              </div>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-gray-800">Сбор данных</p>
                  <p className="text-xs text-gray-500">Запрашивать email/телефон у пользователя</p>
                </div>
                <div className="w-11 h-6 rounded-full relative cursor-pointer bg-gray-300">
                  <div className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow" />
                </div>
              </div>
            </div>
          </div>

          {/* Linked funnel */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Привязка к воронке</h3>
            <select className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700">
              <option>Автовебинар AI-маркетинг</option>
              <option>Лид-магнит: чек-лист</option>
              <option>Не привязан</option>
            </select>
          </div>

          {/* Danger zone */}
          <div className="bg-white rounded-xl border border-red-100 p-5">
            <h3 className="text-sm font-semibold text-red-600 mb-3">Опасная зона</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-800">Удалить бота</p>
                <p className="text-xs text-gray-500">Все данные будут потеряны безвозвратно</p>
              </div>
              <button className="px-3 py-1.5 rounded-lg border border-red-300 text-sm text-red-600 hover:bg-red-50 transition-colors">Удалить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ChatbotsScreen() {
  const [selectedBotId, setSelectedBotId] = useState<number | null>(null)

  const selectedBot = chatbots.find(b => b.id === selectedBotId)

  if (selectedBot) {
    return <BotDetail bot={selectedBot} onBack={() => setSelectedBotId(null)} />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Чат-боты</h1>
          <p className="text-sm text-gray-500 mt-0.5">Управляйте Telegram-ботами и автосценариями</p>
        </div>
        <button className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Создать бота
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {chatbots.map(bot => (
          <button
            key={bot.id}
            onClick={() => setSelectedBotId(bot.id)}
            className="w-full bg-white rounded-xl border border-gray-100 p-5 flex items-center justify-between hover:border-[#6A55F8]/30 hover:shadow-sm transition-all text-left"
          >
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
            <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        ))}
      </div>
    </div>
  )
}
