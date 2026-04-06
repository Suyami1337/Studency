'use client'

import { chatbots } from '@/lib/mock-data'

export default function ChatbotsScreen() {
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
            <button className="px-3 py-1.5 rounded-lg bg-[#6A55F8] text-white text-sm hover:bg-[#5040D6] transition-colors">
              Редактировать
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
