'use client'

import { landings } from '@/lib/mock-data'

const templates = [
  { name: 'Вебинар', desc: 'Регистрация на вебинар с таймером и программой', icon: '🎥' },
  { name: 'Оффер', desc: 'Страница продажи с тарифами и кнопкой оплаты', icon: '💰' },
  { name: 'Лид-магнит', desc: 'Выдача бесплатного материала в обмен на контакт', icon: '🧲' },
]

function conversionRate(visits: number, conversions: number) {
  if (!visits) return '—'
  return `${((conversions / visits) * 100).toFixed(1)}%`
}

export default function SitesScreen() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Сайты</h1>
          <p className="text-sm text-gray-500 mt-0.5">Лендинги, офферы и страницы для вашей школы</p>
        </div>
        <button className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Создать сайт
        </button>
      </div>

      {/* Landing list */}
      <div className="grid grid-cols-1 gap-4">
        {landings.map(landing => (
          <div key={landing.id} className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-xl">🌐</div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{landing.name}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${landing.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {landing.status === 'published' ? 'Опубликован' : 'Черновик'}
                    </span>
                  </div>
                  <a className="text-xs text-[#6A55F8] mt-0.5 hover:underline" href={`https://${landing.url}`} target="_blank" rel="noopener noreferrer">
                    {landing.url}
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-8">
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900">{landing.visits.toLocaleString('ru')}</p>
                  <p className="text-xs text-gray-500">Визиты</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900">{landing.conversions.toLocaleString('ru')}</p>
                  <p className="text-xs text-gray-500">Конверсии</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-[#6A55F8]">{conversionRate(landing.visits, landing.conversions)}</p>
                  <p className="text-xs text-gray-500">Конверсия</p>
                </div>
                <div className="flex items-center gap-2">
                  <button className="text-xs text-[#6A55F8] font-medium border border-[#6A55F8] rounded-lg px-3 py-1.5 hover:bg-[#F0EDFF] transition-colors">
                    Редактировать
                  </button>
                  <button className="text-xs text-gray-500 font-medium border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
                    Статистика
                  </button>
                </div>
              </div>
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
    </div>
  )
}
