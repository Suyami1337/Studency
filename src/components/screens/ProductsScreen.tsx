'use client'

import { products } from '@/lib/mock-data'

const fakeTariffs: Record<number, { name: string; price: number; features: string[] }[]> = {
  1: [
    { name: 'Базовый', price: 2990, features: ['3 урока', 'Видеозаписи', 'PDF-материалы'] },
    { name: 'С поддержкой', price: 4990, features: ['3 урока', 'Видеозаписи', 'Чат с куратором'] },
  ],
  2: [
    { name: 'Стандарт', price: 29900, features: ['16 уроков', 'Куратор', 'Обратная связь', '3 месяца'] },
    { name: 'VIP', price: 49900, features: ['16 уроков', 'Личные разборы', 'Прямой эфир', '6 месяцев'] },
  ],
  3: [
    { name: 'VIP', price: 89900, features: ['Всё из Стандарт', '4 личных разбора', 'WhatsApp-доступ'] },
  ],
}

export default function ProductsScreen() {
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
              <tr key={product.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
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
                  <button className="text-xs text-[#6A55F8] font-medium border border-[#6A55F8] rounded-lg px-3 py-1.5 hover:bg-[#F0EDFF] transition-colors">
                    Редактировать
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tariffs section per product */}
      <div className="space-y-5">
        {products.map(product => (
          <div key={product.id} className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Тарифы: {product.name}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(fakeTariffs[product.id] ?? []).map(tariff => (
                <div key={tariff.name} className="border border-gray-100 rounded-xl p-4 bg-gray-50 hover:border-[#6A55F8] transition-colors cursor-pointer">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-900 text-sm">{tariff.name}</span>
                    <span className="font-bold text-[#6A55F8] text-sm">{tariff.price.toLocaleString('ru')} ₽</span>
                  </div>
                  <ul className="space-y-1">
                    {tariff.features.map(f => (
                      <li key={f} className="text-xs text-gray-500 flex items-center gap-1.5">
                        <span className="text-green-500 text-[10px]">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="border border-dashed border-gray-200 rounded-xl p-4 flex items-center justify-center cursor-pointer hover:border-[#6A55F8] transition-colors">
                <span className="text-sm text-gray-400">+ Добавить тариф</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
