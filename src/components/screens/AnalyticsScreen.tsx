'use client'

import { useState } from 'react'
import { funnels, dashboardStats, chatbots, landings, courses, products } from '@/lib/mock-data'

const stageTypeIcon: Record<string, string> = {
  bot: '🤖', landing: '🌐', order: '📋', payment: '💳', learning: '🎓',
}

type AnalyticsView = { id: string; name: string; type: 'all' | 'funnel' | 'bot' | 'site' | 'course' | 'product'; icon: string }

const analyticsViews: AnalyticsView[] = [
  { id: 'all', name: 'Весь проект', type: 'all', icon: '📊' },
  ...funnels.map(f => ({ id: `funnel-${f.id}`, name: f.name, type: 'funnel' as const, icon: '🔀' })),
  ...chatbots.map(b => ({ id: `bot-${b.id}`, name: b.name, type: 'bot' as const, icon: '🤖' })),
  ...landings.map(l => ({ id: `site-${l.id}`, name: l.name, type: 'site' as const, icon: '🌐' })),
  ...courses.map(c => ({ id: `course-${c.id}`, name: c.name, type: 'course' as const, icon: '🎓' })),
  ...products.map(p => ({ id: `product-${p.id}`, name: p.name, type: 'product' as const, icon: '📦' })),
]

const typeLabels: Record<string, string> = {
  all: 'Общее', funnel: 'Воронки', bot: 'Чат-боты', site: 'Сайты', course: 'Обучение', product: 'Продукты',
}

export default function AnalyticsScreen() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('all-types')

  const selected = analyticsViews.find(v => v.id === selectedId)

  const filteredViews = typeFilter === 'all-types' ? analyticsViews : analyticsViews.filter(v => v.type === typeFilter)

  // Detail view for a selected entity
  if (selected) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedId(null)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">← Назад</button>
          <div className="w-9 h-9 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-lg">{selected.icon}</div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Аналитика: {selected.name}</h1>
            <p className="text-xs text-gray-500">{typeLabels[selected.type]}</p>
          </div>
        </div>

        {/* All project analytics */}
        {selected.type === 'all' && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Пользователей всего', value: '1 247', accent: true },
                { label: 'Заказов за месяц', value: dashboardStats.ordersMonth.toString() },
                { label: 'Выручка за месяц', value: `${dashboardStats.revenueMonth.toLocaleString('ru')} ₽` },
                { label: 'Новых за месяц', value: dashboardStats.newUsersMonth.toString() },
              ].map(m => (
                <div key={m.label} className={`rounded-xl p-4 ${m.accent ? 'bg-gradient-to-br from-[#6A55F8] to-[#8B7BFA] text-white' : 'bg-white border border-gray-100'}`}>
                  <p className={`text-xs mb-1 ${m.accent ? 'text-white/70' : 'text-gray-500'}`}>{m.label}</p>
                  <p className={`text-2xl font-bold ${m.accent ? 'text-white' : 'text-gray-900'}`}>{m.value}</p>
                </div>
              ))}
            </div>

            {/* Per-type breakdown */}
            <div className="grid grid-cols-2 gap-4">
              {/* Chatbots */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">🤖 Чат-боты</h3>
                <div className="space-y-2">
                  {chatbots.map(b => (
                    <div key={b.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-gray-700">{b.name}</span>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{b.subscribers} подп.</span>
                        <span>{b.messages} сообщ.</span>
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 flex items-center justify-between text-sm font-semibold">
                    <span className="text-gray-900">Всего</span>
                    <span className="text-[#6A55F8]">{chatbots.reduce((s, b) => s + b.subscribers, 0)} подписчиков</span>
                  </div>
                </div>
              </div>

              {/* Sites */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">🌐 Сайты</h3>
                <div className="space-y-2">
                  {landings.map(l => (
                    <div key={l.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-gray-700">{l.name}</span>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{l.visits} визитов</span>
                        <span>{l.conversions} конв.</span>
                        <span className="font-medium text-[#6A55F8]">{l.visits > 0 ? `${((l.conversions / l.visits) * 100).toFixed(1)}%` : '—'}</span>
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 flex items-center justify-between text-sm font-semibold">
                    <span className="text-gray-900">Всего</span>
                    <span className="text-[#6A55F8]">{landings.reduce((s, l) => s + l.visits, 0)} визитов</span>
                  </div>
                </div>
              </div>

              {/* Courses */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">🎓 Обучение</h3>
                <div className="space-y-2">
                  {courses.map(c => (
                    <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-gray-700">{c.name}</span>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{c.students} студ.</span>
                        <span className="font-medium text-[#6A55F8]">{c.completion}% прогресс</span>
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 flex items-center justify-between text-sm font-semibold">
                    <span className="text-gray-900">Всего</span>
                    <span className="text-[#6A55F8]">{courses.reduce((s, c) => s + c.students, 0)} студентов</span>
                  </div>
                </div>
              </div>

              {/* Products */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">📦 Продукты</h3>
                <div className="space-y-2">
                  {products.map(p => (
                    <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-gray-700">{p.name}</span>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{p.sold} продаж</span>
                        <span className="font-medium text-[#6A55F8]">{p.revenue.toLocaleString('ru')} ₽</span>
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 flex items-center justify-between text-sm font-semibold">
                    <span className="text-gray-900">Всего</span>
                    <span className="text-[#6A55F8]">{products.reduce((s, p) => s + p.revenue, 0).toLocaleString('ru')} ₽</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Overall conversion funnel */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Общая воронка проекта</h3>
              <div className="space-y-2">
                {[
                  { label: 'Подписчики ботов', value: 1987, pct: 100 },
                  { label: 'Посетители сайтов', value: 501, pct: 25 },
                  { label: 'Создали заказ', value: 118, pct: 24 },
                  { label: 'Оплатили', value: 110, pct: 93 },
                  { label: 'Проходят обучение', value: 89, pct: 81 },
                ].map((s, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-40 flex-shrink-0 text-sm text-gray-700">{s.label}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                      <div className="h-5 rounded-full flex items-center px-2" style={{
                        width: `${Math.max(8, Math.round((s.value / 1987) * 100))}%`,
                        backgroundColor: idx === 0 ? '#6A55F8' : idx >= 3 ? '#10B981' : '#8B7BFA',
                      }}>
                        {Math.round((s.value / 1987) * 100) >= 10 && <span className="text-white text-[10px] font-medium">{s.value}</span>}
                      </div>
                    </div>
                    <div className="w-14 text-right text-xs font-semibold text-gray-700">{s.value}</div>
                    {idx > 0 && (
                      <div className={`w-10 text-right text-xs font-medium ${s.pct >= 70 ? 'text-green-600' : s.pct >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                        {s.pct}%
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Funnel analytics */}
        {selected.type === 'funnel' && (() => {
          const funnel = funnels.find(f => `funnel-${f.id}` === selected.id)
          if (!funnel) return null
          const stages = funnel.stagesList
          const maxClients = stages[0]?.clients ?? 1
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-gray-100 p-4"><p className="text-xs text-gray-500 mb-1">Вошли</p><p className="text-2xl font-bold text-gray-900">{maxClients}</p></div>
                <div className="bg-white rounded-xl border border-gray-100 p-4"><p className="text-xs text-gray-500 mb-1">Дошли</p><p className="text-2xl font-bold text-[#6A55F8]">{stages[stages.length - 1]?.clients ?? 0}</p></div>
                <div className="bg-white rounded-xl border border-gray-100 p-4"><p className="text-xs text-gray-500 mb-1">Конверсия</p><p className="text-2xl font-bold text-green-600">{funnel.conversion}%</p></div>
                <div className="bg-white rounded-xl border border-gray-100 p-4"><p className="text-xs text-gray-500 mb-1">Этапов</p><p className="text-2xl font-bold text-gray-900">{stages.length}</p></div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Конверсия по этапам</h3>
                <div className="space-y-2">
                  {stages.map((stage, idx) => {
                    const barW = maxClients > 0 ? Math.max(8, Math.round((stage.clients / maxClients) * 100)) : 8
                    const prev = idx === 0 ? stage.clients : stages[idx - 1].clients
                    const conv = idx === 0 ? 100 : (prev > 0 ? Math.round((stage.clients / prev) * 100) : 0)
                    return (
                      <div key={idx} className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-[#F0EDFF] flex items-center justify-center text-sm">{stageTypeIcon[stage.type] ?? '📌'}</div>
                        <div className="w-28 flex-shrink-0 text-xs text-gray-700 truncate">{stage.name}</div>
                        <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                          <div className="h-5 rounded-full bg-[#8B7BFA] flex items-center px-2" style={{ width: `${barW}%` }}>
                            {barW >= 15 && <span className="text-white text-[10px] font-medium">{stage.clients}</span>}
                          </div>
                        </div>
                        <div className="w-14 text-right text-xs font-semibold text-gray-700">{stage.clients}</div>
                        {idx > 0 && <div className={`w-10 text-right text-xs font-medium ${conv >= 70 ? 'text-green-600' : conv >= 40 ? 'text-amber-600' : 'text-red-500'}`}>{conv}%</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })()}

        {/* Bot / Site / Course / Product analytics - simplified */}
        {['bot', 'site', 'course', 'product'].includes(selected.type) && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              {(selected.type === 'bot' ? [
                { label: 'Подписчиков', value: '487' }, { label: 'Сообщений', value: '3 240' }, { label: 'Конверсия', value: '12.7%' }, { label: 'Активных', value: '342' },
              ] : selected.type === 'site' ? [
                { label: 'Посещения', value: '312' }, { label: 'Конверсии', value: '189' }, { label: 'Конверсия %', value: '60.6%' }, { label: 'Отказы', value: '34%' },
              ] : selected.type === 'course' ? [
                { label: 'Студентов', value: '58' }, { label: 'Прогресс', value: '67%' }, { label: 'Завершили', value: '12' }, { label: 'Сдали ДЗ', value: '34' },
              ] : [
                { label: 'Заказов', value: '118' }, { label: 'Оплат', value: '110' }, { label: 'Выручка', value: '1 074 010 ₽' }, { label: 'Конверсия', value: '93%' },
              ]).map(m => (
                <div key={m.label} className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-xs text-gray-500 mb-1">{m.label}</p>
                  <p className="text-xl font-bold text-gray-900">{m.value}</p>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
              Детальная аналитика доступна внутри самого модуля
            </div>
          </div>
        )}
      </div>
    )
  }

  // List view
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Аналитика</h1>
        <p className="text-sm text-gray-500 mt-0.5">Выберите что анализировать</p>
      </div>

      {/* Type filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { value: 'all-types', label: 'Все' },
          { value: 'all', label: '📊 Общее' },
          { value: 'funnel', label: '🔀 Воронки' },
          { value: 'bot', label: '🤖 Боты' },
          { value: 'site', label: '🌐 Сайты' },
          { value: 'course', label: '🎓 Обучение' },
          { value: 'product', label: '📦 Продукты' },
        ].map(f => (
          <button key={f.value} onClick={() => setTypeFilter(f.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              typeFilter === f.value ? 'bg-[#6A55F8] text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>{f.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3">
        {filteredViews.map(view => (
          <button key={view.id} onClick={() => setSelectedId(view.id)}
            className={`w-full rounded-xl border p-5 flex items-center justify-between hover:shadow-sm transition-all text-left ${
              view.type === 'all' ? 'bg-gradient-to-r from-[#6A55F8] to-[#8B7BFA] border-transparent text-white' : 'bg-white border-gray-100 hover:border-[#6A55F8]/30'
            }`}>
            <div className="flex items-center gap-4">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${view.type === 'all' ? 'bg-white/20' : 'bg-[#F0EDFF]'}`}>{view.icon}</div>
              <div>
                <h3 className={`font-semibold ${view.type === 'all' ? 'text-white' : 'text-gray-900'}`}>{view.name}</h3>
                <p className={`text-xs mt-0.5 ${view.type === 'all' ? 'text-white/70' : 'text-gray-500'}`}>{typeLabels[view.type]}</p>
              </div>
            </div>
            <svg className={`w-5 h-5 ${view.type === 'all' ? 'text-white/50' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        ))}
      </div>
    </div>
  )
}
