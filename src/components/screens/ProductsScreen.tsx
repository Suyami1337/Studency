'use client'

import { useState } from 'react'
import { products } from '@/lib/mock-data'

type Product = typeof products[number]

const fakeTariffs = [
  {
    name: 'Базовый',
    price: 2990,
    course: 'Мини-курс "AI за 3 дня"',
    features: ['3 урока', 'Видеозаписи', 'PDF-материалы', 'Доступ 3 месяца'],
    orders: 89,
    paid: 89,
    revenue: 266110,
    conversion: 100,
  },
  {
    name: 'Стандарт',
    price: 29900,
    course: 'Наставничество "AI-маркетолог"',
    features: ['16 уроков', 'Куратор', 'Обратная связь', 'Доступ 6 месяцев', 'Сертификат'],
    orders: 24,
    paid: 18,
    revenue: 538200,
    conversion: 75,
  },
  {
    name: 'VIP',
    price: 89900,
    course: 'VIP с разборами',
    features: ['Всё из Стандарт', '4 личных разбора', 'WhatsApp-доступ', 'Пожизненный доступ'],
    orders: 5,
    paid: 3,
    revenue: 269700,
    conversion: 60,
  },
]

function ProductDetail({ product, onBack }: { product: Product; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<'tariffs' | 'analytics' | 'settings'>('tariffs')
  const [name, setName] = useState(product.name)
  const [desc, setDesc] = useState('Полный курс по использованию нейросетей в маркетинге. Практические кейсы и обратная связь от куратора.')

  const totalRevenue = fakeTariffs.reduce((s, t) => s + t.revenue, 0)

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
        <div className="w-8 h-8 rounded-lg bg-[#F0EDFF] flex items-center justify-center text-base flex-shrink-0">📦</div>
        <h1 className="text-xl font-bold text-gray-900">{product.name}</h1>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-100 pb-0">
        {([['tariffs', 'Тарифы'], ['analytics', 'Аналитика'], ['settings', 'Настройки']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${
              activeTab === key
                ? 'border-[#6A55F8] text-[#6A55F8]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tariffs tab */}
      {activeTab === 'tariffs' && (
        <div className="grid grid-cols-3 gap-4">
          {fakeTariffs.map((tariff, i) => (
            <div key={tariff.name} className={`bg-white rounded-xl border p-5 relative ${i === 1 ? 'border-[#6A55F8] shadow-md' : 'border-gray-100'}`}>
              {i === 1 && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#6A55F8] text-white text-xs font-medium px-3 py-0.5 rounded-full">
                  Популярный
                </span>
              )}
              <p className="text-xs text-gray-500 mb-0.5">Тариф</p>
              <h3 className="text-lg font-bold text-gray-900">{tariff.name}</h3>
              <p className="text-2xl font-bold text-[#6A55F8] mt-2">{tariff.price.toLocaleString('ru')} ₽</p>
              <p className="text-xs text-gray-400 mt-0.5">открывает курс: {tariff.course}</p>
              <ul className="mt-4 space-y-2">
                {tariff.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
                    <span className="text-green-500 text-xs font-bold">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button className="mt-5 w-full text-xs text-[#6A55F8] font-medium border border-[#6A55F8] rounded-lg px-3 py-2 hover:bg-[#F0EDFF] transition-colors">
                Редактировать тариф
              </button>
            </div>
          ))}
          <div className="bg-white rounded-xl border border-dashed border-gray-200 p-5 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-[#6A55F8] transition-colors">
            <span className="text-3xl text-gray-300">+</span>
            <span className="text-sm text-gray-400">Добавить тариф</span>
          </div>
        </div>
      )}

      {/* Analytics tab */}
      {activeTab === 'analytics' && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[#F0EDFF] rounded-xl p-4">
              <p className="text-2xl font-bold text-[#6A55F8]">{totalRevenue.toLocaleString('ru')} ₽</p>
              <p className="text-xs text-gray-500 mt-0.5">Общая выручка</p>
            </div>
            <div className="bg-[#F0EDFF] rounded-xl p-4">
              <p className="text-2xl font-bold text-[#6A55F8]">{fakeTariffs.reduce((s, t) => s + t.paid, 0)}</p>
              <p className="text-xs text-gray-500 mt-0.5">Оплаченных заказов</p>
            </div>
            <div className="bg-[#F0EDFF] rounded-xl p-4">
              <p className="text-2xl font-bold text-[#6A55F8]">{fakeTariffs.reduce((s, t) => s + t.orders, 0)}</p>
              <p className="text-xs text-gray-500 mt-0.5">Всего заказов</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Тариф', 'Заказов', 'Оплачено', 'Конверсия', 'Выручка'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fakeTariffs.map(tariff => (
                  <tr key={tariff.name} className="border-b border-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{tariff.name} — {tariff.price.toLocaleString('ru')} ₽</td>
                    <td className="px-4 py-3 text-gray-700">{tariff.orders}</td>
                    <td className="px-4 py-3 text-gray-700">{tariff.paid}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-100 rounded-full h-1.5">
                          <div className="bg-[#6A55F8] h-1.5 rounded-full" style={{ width: `${tariff.conversion}%` }} />
                        </div>
                        <span className="text-[#6A55F8] font-semibold text-xs">{tariff.conversion}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{tariff.revenue.toLocaleString('ru')} ₽</td>
                  </tr>
                ))}
                <tr className="bg-gray-50">
                  <td className="px-4 py-3 font-bold text-gray-900" colSpan={4}>Итого</td>
                  <td className="px-4 py-3 font-bold text-[#6A55F8]">{totalRevenue.toLocaleString('ru')} ₽</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Settings tab */}
      {activeTab === 'settings' && (
        <div className="max-w-lg space-y-5">
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Название продукта</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-1 focus:ring-[#6A55F8]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Описание</label>
              <textarea
                value={desc}
                onChange={e => setDesc(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-1 focus:ring-[#6A55F8] resize-none"
              />
            </div>
            <button className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              Сохранить
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ProductsScreen() {
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const selectedProduct = products.find(p => p.id === selectedId)

  if (selectedProduct) {
    return <ProductDetail product={selectedProduct} onBack={() => setSelectedId(null)} />
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Продукты</h1>
          <p className="text-sm text-gray-500 mt-0.5">Управляйте курсами, тарифами и ценами</p>
        </div>
        <button className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Создать продукт
        </button>
      </div>

      {/* Products table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Название', 'Цена', 'Продано', 'Выручка', ''].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map(product => (
              <tr
                key={product.id}
                className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => setSelectedId(product.id)}
              >
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#F0EDFF] flex items-center justify-center text-base flex-shrink-0">📦</div>
                    <span className="font-medium text-gray-900">{product.name}</span>
                  </div>
                </td>
                <td className="px-4 py-4 text-gray-700 font-medium">{product.price.toLocaleString('ru')} ₽</td>
                <td className="px-4 py-4 text-gray-700">{product.sold}</td>
                <td className="px-4 py-4 font-semibold text-gray-900">{product.revenue.toLocaleString('ru')} ₽</td>
                <td className="px-4 py-4">
                  <button
                    onClick={e => { e.stopPropagation(); setSelectedId(product.id) }}
                    className="text-xs text-[#6A55F8] font-medium border border-[#6A55F8] rounded-lg px-3 py-1.5 hover:bg-[#F0EDFF] transition-colors"
                  >
                    Редактировать
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
