'use client'

import { chatbots, botSteps } from '@/lib/mock-data'

const stepTypeConfig: Record<string, { icon: string; color: string; label: string }> = {
  message: { icon: '💬', color: 'bg-blue-50 border-blue-100', label: 'Сообщение' },
  button: { icon: '🔘', color: 'bg-purple-50 border-purple-100', label: 'Кнопка' },
  delay: { icon: '⏱', color: 'bg-amber-50 border-amber-100', label: 'Задержка' },
}

const templates = [
  { name: 'Проверка подписки', desc: 'Проверяет подписку на канал перед выдачей материала', icon: '✅' },
  { name: 'Автовебинар', desc: 'Регистрация, напоминания, дожим после вебинара', icon: '🎥' },
  { name: 'Дожим после оплаты', desc: 'Приветствие, доступ к курсу, первые шаги', icon: '🔥' },
]

export default function ChatbotsScreen() {
  const firstBot = chatbots[0]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Чат-боты</h1>
          <p className="text-sm text-gray-500 mt-0.5">Управляйте Telegram-ботами и автосценариями</p>
        </div>
        <button className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Создать бота
        </button>
      </div>

      {/* Bot list */}
      <div className="grid grid-cols-1 gap-3">
        {chatbots.map(bot => (
          <div key={bot.id} className="bg-white rounded-xl border border-gray-100 p-5 flex items-center justify-between hover:shadow-sm transition-shadow">
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
            <div className="flex items-center gap-2">
              <button className="text-xs text-[#6A55F8] font-medium border border-[#6A55F8] rounded-lg px-3 py-1.5 hover:bg-[#F0EDFF] transition-colors">
                Редактировать
              </button>
            </div>
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

      {/* Bot scenario inside first bot */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-base font-semibold text-gray-900">Сценарий: {firstBot.name}</h2>
          <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{botSteps.length} шагов</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
          {botSteps.map((step, idx) => {
            const conf = stepTypeConfig[step.type] ?? { icon: '📌', color: 'bg-gray-50 border-gray-100', label: step.type }
            return (
              <div key={step.id} className="flex items-start gap-4 px-5 py-4">
                {/* Step number */}
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 mt-0.5">
                  {idx + 1}
                </div>
                {/* Type badge */}
                <div className={`flex-shrink-0 border rounded-lg px-2 py-1 text-xs font-medium flex items-center gap-1 ${conf.color}`}>
                  <span>{conf.icon}</span>
                  <span className="text-gray-700">{conf.label}</span>
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 leading-snug">{step.text}</p>
                  {step.condition && step.condition !== 'Старт' && (
                    <p className="text-xs text-gray-400 mt-1">Условие: {step.condition}</p>
                  )}
                </div>
                {/* Delay */}
                {step.delay && step.delay !== '0' && (
                  <div className="flex-shrink-0 text-xs font-medium text-amber-600 bg-amber-50 rounded-lg px-2 py-1 whitespace-nowrap">
                    ⏱ {step.delay}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
