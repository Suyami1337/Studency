'use client'

import { useState } from 'react'
import { products as mockProducts, clients } from '@/lib/mock-data'

type Product = typeof mockProducts[number]

const fakeTariffs = [
  { name: 'Базовый', price: 2990, course: 'Мини-курс "AI за 3 дня"', features: ['3 урока', 'Видеозаписи', 'PDF-материалы', 'Доступ 3 месяца'], orders: 89, paid: 89, revenue: 266110, conversion: 100 },
  { name: 'Стандарт', price: 29900, course: 'Наставничество "AI-маркетолог"', features: ['16 уроков', 'Куратор', 'Обратная связь', 'Доступ 6 месяцев', 'Сертификат'], orders: 24, paid: 18, revenue: 538200, conversion: 75 },
  { name: 'VIP', price: 89900, course: 'VIP-наставничество с разборами', features: ['16 уроков', 'Личный куратор', 'Разборы 1-на-1', 'Доступ навсегда', 'Сертификат', 'Закрытый чат'], orders: 5, paid: 3, revenue: 269700, conversion: 60 },
]

const fakeChatAI = [
  { from: 'ai', text: 'Привет! Расскажи про свой продукт — я помогу создать тарифную сетку с наполнением.' },
  { from: 'user', text: 'У меня курс по AI-маркетингу, нужно 3 тарифа' },
  { from: 'ai', text: 'Создал 3 тарифа: Базовый (2 990₽) — доступ к записям, Стандарт (29 900₽) — с куратором и ДЗ, VIP (89 900₽) — личные разборы и закрытый чат. Какой курс привязать к каждому?' },
]

const fakeTariffUsers: Record<string, { name: string; email: string; status: 'paid' | 'order'; date: string }[]> = {
  'Базовый': [
    { name: 'Сергей Морозов', email: 'sergey@gmail.com', status: 'paid', date: '05.04.2026' },
    { name: 'Наталья Белова', email: 'nata@inbox.ru', status: 'paid', date: '03.04.2026' },
  ],
  'Стандарт': [
    { name: 'Анна Петрова', email: 'anna@mail.ru', status: 'paid', date: '06.04.2026' },
    { name: 'Мария Сидорова', email: 'masha@yandex.ru', status: 'paid', date: '05.04.2026' },
    { name: 'Иван Федоров', email: 'ivan@mail.ru', status: 'paid', date: '04.04.2026' },
    { name: 'Ольга Кузнецова', email: 'olga@yandex.ru', status: 'order', date: '06.04.2026' },
  ],
  'VIP': [
    { name: 'Дмитрий Козлов', email: 'dima@gmail.com', status: 'order', date: '06.04.2026' },
  ],
}

function ProductDetail({ product, onBack }: { product: Product; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<'tariffs' | 'analytics' | 'users' | 'settings'>('tariffs')
  const [showAI, setShowAI] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [aiMessages, setAiMessages] = useState(fakeChatAI)
  const [userTariffFilter, setUserTariffFilter] = useState<string>('all')
  const [userStatusFilter, setUserStatusFilter] = useState<string>('all')

  function sendMessage() {
    if (!chatInput.trim()) return
    setAiMessages(prev => [...prev, { from: 'user', text: chatInput }, { from: 'ai', text: 'Понял! Обновляю тарифы...' }])
    setChatInput('')
  }

  const allUsers = Object.entries(fakeTariffUsers).flatMap(([tariff, users]) => users.map(u => ({ ...u, tariff })))
  const filteredUsers = allUsers.filter(u => {
    if (userTariffFilter !== 'all' && u.tariff !== userTariffFilter) return false
    if (userStatusFilter !== 'all' && u.status !== userStatusFilter) return false
    return true
  })

  const tabs = [
    { id: 'tariffs' as const, label: 'Тарифы' },
    { id: 'analytics' as const, label: 'Аналитика' },
    { id: 'users' as const, label: 'Пользователи' },
    { id: 'settings' as const, label: 'Настройки' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">← Назад</button>
          <div className="w-9 h-9 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-lg">📦</div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{product.name}</h1>
            <p className="text-xs text-gray-500">{product.sold} продаж · {product.revenue.toLocaleString('ru')} ₽</p>
          </div>
        </div>
        {activeTab === 'tariffs' && (
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

      <div className="flex items-center gap-1 border-b border-gray-100">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${
              activeTab === tab.id ? 'border-[#6A55F8] text-[#6A55F8]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>{tab.label}</button>
        ))}
      </div>

      {/* TAB: Тарифы */}
      {activeTab === 'tariffs' && (
        <div className="flex gap-4">
          <div className={`${showAI ? 'flex-1' : 'w-full'} transition-all`}>
            <div className="grid grid-cols-1 gap-3">
              {fakeTariffs.map((t, idx) => (
                <div key={idx} className="bg-white rounded-xl border border-gray-100 p-5 hover:border-[#6A55F8]/30 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{t.name}</h3>
                        <span className="text-lg font-bold text-[#6A55F8]">{t.price.toLocaleString('ru')} ₽</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">Открывает: {t.course}</p>
                    </div>
                    <button className="text-xs text-[#6A55F8] font-medium border border-[#6A55F8]/30 rounded-lg px-2.5 py-1 hover:bg-[#F0EDFF]">Редактировать</button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {t.features.map(f => (
                      <span key={f} className="text-xs bg-gray-50 border border-gray-100 rounded-full px-2.5 py-1 text-gray-600">✓ {f}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50 text-xs text-gray-500">
                    <span>{t.orders} заказов</span>
                    <span>{t.paid} оплат</span>
                    <span className="font-semibold text-gray-900">{t.revenue.toLocaleString('ru')} ₽</span>
                    <span className={`font-medium ${t.conversion >= 80 ? 'text-green-600' : t.conversion >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                      {t.conversion}% конверсия
                    </span>
                  </div>
                </div>
              ))}
              <button className="w-full py-3.5 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-[#6A55F8] hover:text-[#6A55F8] transition-colors">
                + Добавить тариф
              </button>
            </div>
          </div>

          {showAI && (
            <div className="flex flex-col w-[380px] flex-shrink-0 bg-white rounded-xl border border-gray-100 overflow-hidden h-[500px]">
              <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-[#6A55F8] to-[#8B7BFA] flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold">AI</div>
                <span className="text-sm font-semibold text-white">AI-помощник</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {aiMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      msg.from === 'user' ? 'bg-[#6A55F8] text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'
                    }`}>{msg.text}</div>
                  </div>
                ))}
              </div>
              <div className="px-3 py-3 border-t border-gray-100 flex gap-2">
                <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  placeholder="Описать продукт и тарифы..." className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
                <button onClick={sendMessage} className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2.5 rounded-lg text-sm transition-colors">→</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: Аналитика */}
      {activeTab === 'analytics' && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-500 mb-1">Всего заказов</p>
              <p className="text-2xl font-bold text-gray-900">{fakeTariffs.reduce((s, t) => s + t.orders, 0)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-500 mb-1">Оплачено</p>
              <p className="text-2xl font-bold text-green-600">{fakeTariffs.reduce((s, t) => s + t.paid, 0)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-500 mb-1">Общая выручка</p>
              <p className="text-2xl font-bold text-[#6A55F8]">{fakeTariffs.reduce((s, t) => s + t.revenue, 0).toLocaleString('ru')} ₽</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-500 mb-1">Средняя конверсия</p>
              <p className="text-2xl font-bold text-gray-900">{Math.round(fakeTariffs.reduce((s, t) => s + t.conversion, 0) / fakeTariffs.length)}%</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">По тарифам</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Тариф', 'Цена', 'Заказов', 'Оплат', 'Конверсия', 'Выручка'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 pb-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fakeTariffs.map((t, idx) => (
                  <tr key={idx} className="border-b border-gray-50">
                    <td className="py-3 font-medium text-gray-900">{t.name}</td>
                    <td className="py-3 text-gray-700">{t.price.toLocaleString('ru')} ₽</td>
                    <td className="py-3 text-gray-700">{t.orders}</td>
                    <td className="py-3 text-gray-700">{t.paid}</td>
                    <td className="py-3">
                      <span className={`text-xs font-medium ${t.conversion >= 80 ? 'text-green-600' : t.conversion >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                        {t.conversion}%
                      </span>
                    </td>
                    <td className="py-3 font-semibold text-gray-900">{t.revenue.toLocaleString('ru')} ₽</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: Пользователи */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-500">Тариф:</span>
            {['all', ...fakeTariffs.map(t => t.name)].map(t => (
              <button key={t} onClick={() => setUserTariffFilter(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  userTariffFilter === t ? 'bg-[#6A55F8] text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                {t === 'all' ? 'Все' : t}
              </button>
            ))}

            <span className="text-sm text-gray-500 ml-4">Статус:</span>
            {[
              { value: 'all', label: 'Все' },
              { value: 'paid', label: 'Оплатил' },
              { value: 'order', label: 'Создал заказ' },
            ].map(s => (
              <button key={s.value} onClick={() => setUserStatusFilter(s.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  userStatusFilter === s.value ? 'bg-[#6A55F8] text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                {s.label}
              </button>
            ))}
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-500 mb-1">Найдено</p>
              <p className="text-xl font-bold text-gray-900">{filteredUsers.length} чел.</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-500 mb-1">Оплатили</p>
              <p className="text-xl font-bold text-green-600">{filteredUsers.filter(u => u.status === 'paid').length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-500 mb-1">Создали заказ</p>
              <p className="text-xl font-bold text-amber-600">{filteredUsers.filter(u => u.status === 'order').length}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Имя', 'Email', 'Тариф', 'Статус', 'Дата'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user, idx) => (
                  <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8]">
                          {user.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span className="font-medium text-gray-900">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{user.email}</td>
                    <td className="px-4 py-3"><span className="text-xs bg-[#F0EDFF] text-[#6A55F8] rounded-full px-2 py-0.5 font-medium">{user.tariff}</span></td>
                    <td className="px-4 py-3">
                      <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${user.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {user.status === 'paid' ? 'Оплатил' : 'Заказ'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{user.date}</td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-gray-400 text-sm">Нет пользователей по выбранным фильтрам</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: Настройки */}
      {activeTab === 'settings' && (
        <div className="max-w-2xl space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Основные</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Название продукта</label>
                <input type="text" defaultValue={product.name} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Описание</label>
                <textarea defaultValue="Комплексное обучение AI-маркетингу с нуля до продвинутого уровня" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] h-20 resize-none" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-red-100 p-5">
            <h3 className="text-sm font-semibold text-red-600 mb-3">Опасная зона</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-800">Удалить продукт</p>
                <p className="text-xs text-gray-500">Все тарифы и связи будут удалены</p>
              </div>
              <button className="px-3 py-1.5 rounded-lg border border-red-300 text-sm text-red-600 hover:bg-red-50 transition-colors">Удалить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ProductsScreen() {
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null)
  const selectedProduct = mockProducts.find(p => p.id === selectedProductId)

  if (selectedProduct) {
    return <ProductDetail product={selectedProduct} onBack={() => setSelectedProductId(null)} />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Продукты</h1>
          <p className="text-sm text-gray-500 mt-0.5">Продукты и тарифные сетки</p>
        </div>
        <button className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">+ Создать продукт</button>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {mockProducts.map(p => (
          <button key={p.id} onClick={() => setSelectedProductId(p.id)}
            className="w-full bg-white rounded-xl border border-gray-100 p-5 flex items-center justify-between hover:border-[#6A55F8]/30 hover:shadow-sm transition-all text-left">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-xl">📦</div>
              <div>
                <h3 className="font-semibold text-gray-900">{p.name}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{p.price.toLocaleString('ru')} ₽ · {p.sold} продаж · {p.revenue.toLocaleString('ru')} ₽ выручка</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        ))}
      </div>
    </div>
  )
}
