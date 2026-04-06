'use client'

import { useState } from 'react'
import { landings, clients } from '@/lib/mock-data'

type Landing = typeof landings[number]

const fakeChatMessages = [
  { from: 'ai', text: 'Привет! Я помогу отредактировать сайт. Что нужно изменить?' },
  { from: 'user', text: 'Поменяй заголовок на "Как AI делает маркетинг за тебя"' },
  { from: 'ai', text: 'Готово! Заголовок обновлён. Хочешь изменить подзаголовок тоже?' },
  { from: 'user', text: 'Добавь кнопку "Смотреть видео" фиолетового цвета' },
  { from: 'ai', text: 'Кнопка добавлена, цвет #6A55F8. Предпросмотр обновлён.' },
]

const fakeButtonAnalytics = [
  { name: 'Кнопка "Смотреть видео"', clicks: 156, conversion: 45 },
  { name: 'Кнопка "Купить"', clicks: 84, conversion: 12 },
  { name: 'Кнопка "Подробнее"', clicks: 43, conversion: 28 },
]

const fakeSiteUsers = clients.slice(0, 6)

function SiteDetail({ site, onBack }: { site: Landing; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<'editor' | 'analytics' | 'users' | 'settings'>('editor')
  const [showAI, setShowAI] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [aiMessages, setAiMessages] = useState(fakeChatMessages)

  function sendMessage() {
    if (!chatInput.trim()) return
    setAiMessages(prev => [...prev, { from: 'user', text: chatInput }, { from: 'ai', text: 'Понял! Обновляю сайт...' }])
    setChatInput('')
  }

  const tabs = [
    { id: 'editor' as const, label: 'Редактор' },
    { id: 'analytics' as const, label: 'Аналитика' },
    { id: 'users' as const, label: 'Пользователи' },
    { id: 'settings' as const, label: 'Настройки' },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">← Назад</button>
          <div className="w-9 h-9 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-lg">🌐</div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{site.name}</h1>
            <p className="text-xs text-gray-500">{site.url} · {site.visits} посещений</p>
          </div>
        </div>
        {activeTab === 'editor' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAI(!showAI)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                showAI ? 'bg-[#6A55F8] text-white' : 'border border-[#6A55F8] text-[#6A55F8] hover:bg-[#F0EDFF]'
              }`}
            >
              <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">AI</div>
              {showAI ? 'Скрыть AI' : 'AI-помощник'}
            </button>
            <button className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              Опубликовать
            </button>
          </div>
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

      {/* TAB: Редактор */}
      {activeTab === 'editor' && (
        <div className="flex gap-4">
          {/* Site preview */}
          <div className={`${showAI ? 'flex-1' : 'w-full'} transition-all`}>
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="bg-gray-100 px-4 py-2 flex items-center gap-2 border-b border-gray-200">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="flex-1 bg-white rounded px-3 py-1 text-xs text-gray-500 ml-2">{site.url}</div>
              </div>
              <div className="p-8 min-h-[500px]">
                <div className="bg-gradient-to-br from-[#6A55F8] to-[#8B7BFA] rounded-2xl p-10 text-center text-white mb-6">
                  <h2 className="text-3xl font-bold mb-3">Как AI делает маркетинг за тебя</h2>
                  <p className="text-white/80 mb-6">Смотри видео и узнай 3 кейса, где нейросети заменили целый отдел</p>
                  <button className="bg-white text-[#6A55F8] px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors">
                    Смотреть видео →
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  {['✅ 3 реальных кейса', '✅ Пошаговая стратегия', '✅ Бонус: чек-лист'].map(t => (
                    <div key={t} className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700">{t}</div>
                  ))}
                </div>
                <div className="bg-gray-50 rounded-xl p-6 text-center">
                  <p className="text-lg font-bold text-gray-900 mb-2">Готов начать?</p>
                  <button className="bg-[#6A55F8] text-white px-8 py-3 rounded-lg font-semibold">Купить курс</button>
                </div>
              </div>
            </div>
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

      {/* TAB: Аналитика */}
      {activeTab === 'analytics' && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Посещения', value: site.visits.toString() },
              { label: 'Конверсии', value: site.conversions.toString() },
              { label: 'Конверсия %', value: site.visits > 0 ? `${((site.conversions / site.visits) * 100).toFixed(1)}%` : '—' },
              { label: 'Средний отказ', value: '34%' },
            ].map(m => (
              <div key={m.label} className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-xs text-gray-500 mb-1">{m.label}</p>
                <p className="text-xl font-bold text-gray-900">{m.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Конверсия по кнопкам</h3>
            <div className="space-y-3">
              {fakeButtonAnalytics.map(btn => (
                <div key={btn.name} className="flex items-center gap-3">
                  <div className="w-48 flex-shrink-0 text-sm text-gray-700">{btn.name}</div>
                  <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                    <div className="h-5 rounded-full bg-[#8B7BFA] flex items-center px-2" style={{ width: `${btn.conversion}%` }}>
                      {btn.conversion >= 15 && <span className="text-white text-[10px] font-medium">{btn.conversion}%</span>}
                    </div>
                  </div>
                  <div className="w-20 text-right text-xs text-gray-500">{btn.clicks} кликов</div>
                  <div className="w-12 text-right text-xs font-semibold text-[#6A55F8]">{btn.conversion}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB: Пользователи */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Посетители сайта · {fakeSiteUsers.length} человек</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Показаны зарегистрированные</span>
            </div>
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
              {fakeSiteUsers.map(user => (
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
                  <td className="px-4 py-3 text-xs text-gray-500">{user.lastAction}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {user.revenue > 0 ? `${user.revenue.toLocaleString('ru')} ₽` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB: Настройки */}
      {activeTab === 'settings' && (
        <div className="max-w-2xl space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Основные</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Название сайта</label>
                <input type="text" defaultValue={site.name} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">URL / Slug</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">ai-marketing.pro/</span>
                  <input type="text" defaultValue={site.url.split('/').pop()} className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">SEO</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Meta Title</label>
                <input type="text" defaultValue="Как AI делает маркетинг за тебя" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Meta Description</label>
                <textarea defaultValue="Смотри видео и узнай 3 кейса, где нейросети заменили целый отдел маркетинга" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] h-20 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Favicon</label>
                <button className="px-3 py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-400 hover:border-[#6A55F8] hover:text-[#6A55F8] transition-colors">
                  Загрузить иконку
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Трекинг</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-gray-800">Отслеживание посещений</p>
                  <p className="text-xs text-gray-500">Записывать визиты в карточку клиента</p>
                </div>
                <div className="w-11 h-6 rounded-full relative cursor-pointer bg-[#6A55F8]">
                  <div className="absolute top-1 right-1 w-4 h-4 bg-white rounded-full shadow" />
                </div>
              </div>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-gray-800">Отслеживание кнопок</p>
                  <p className="text-xs text-gray-500">Считать клики по каждой кнопке</p>
                </div>
                <div className="w-11 h-6 rounded-full relative cursor-pointer bg-[#6A55F8]">
                  <div className="absolute top-1 right-1 w-4 h-4 bg-white rounded-full shadow" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Внешний трекинг (Pixel / GTM)</label>
                <textarea placeholder="Вставьте код трекинга..." className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:border-[#6A55F8] h-16 resize-none" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Привязка к воронке</h3>
            <select className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700">
              <option>Автовебинар AI-маркетинг</option>
              <option>Лид-магнит: чек-лист</option>
              <option>Не привязан</option>
            </select>
          </div>

          <div className="bg-white rounded-xl border border-red-100 p-5">
            <h3 className="text-sm font-semibold text-red-600 mb-3">Опасная зона</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-800">Удалить сайт</p>
                <p className="text-xs text-gray-500">Сайт станет недоступен, данные потеряны</p>
              </div>
              <button className="px-3 py-1.5 rounded-lg border border-red-300 text-sm text-red-600 hover:bg-red-50 transition-colors">Удалить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SitesScreen() {
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null)

  const selectedSite = landings.find(l => l.id === selectedSiteId)

  if (selectedSite) {
    return <SiteDetail site={selectedSite} onBack={() => setSelectedSiteId(null)} />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Сайты</h1>
          <p className="text-sm text-gray-500 mt-0.5">Лендинги и страницы вашего проекта</p>
        </div>
        <button className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Создать сайт
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {landings.map(site => (
          <button
            key={site.id}
            onClick={() => setSelectedSiteId(site.id)}
            className="w-full bg-white rounded-xl border border-gray-100 p-5 flex items-center justify-between hover:border-[#6A55F8]/30 hover:shadow-sm transition-all text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-xl">🌐</div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">{site.name}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${site.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {site.status === 'published' ? 'Опубликован' : 'Черновик'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{site.url} · {site.visits} посещений · {site.conversions} конверсий</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        ))}
      </div>
    </div>
  )
}
