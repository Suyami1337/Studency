'use client'

import { useState } from 'react'
import { landings } from '@/lib/mock-data'

function conversionRate(visits: number, conversions: number) {
  if (!visits) return '—'
  return `${((conversions / visits) * 100).toFixed(1)}%`
}

const fakeChatMessages = [
  { from: 'user', text: 'Поменяй заголовок на "Как AI делает маркетинг за тебя"' },
  { from: 'ai', text: 'Готово! Заголовок обновлён. Хочешь изменить подзаголовок тоже?' },
  { from: 'user', text: 'Да, напиши "Смотри видео и узнай 3 кейса"' },
  { from: 'ai', text: 'Подзаголовок обновлён. Предлагаю также добавить кнопку CTA — сделать?' },
  { from: 'user', text: 'Добавь кнопку "Смотреть видео" фиолетового цвета' },
  { from: 'ai', text: 'Кнопка добавлена, цвет #6A55F8. Предпросмотр обновлён.' },
]

const fakeButtonAnalytics = [
  { name: 'Кнопка "Смотреть видео"', clicks: 156, conversion: 45 },
  { name: 'Кнопка "Купить"', clicks: 84, conversion: 12 },
  { name: 'Кнопка "Подробнее"', clicks: 43, conversion: 28 },
]

type Landing = typeof landings[number]

function SiteDetail({ site, onBack }: { site: Landing; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<'analytics'>('analytics')
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState(fakeChatMessages)

  function sendMessage() {
    if (!chatInput.trim()) return
    setChatMessages(prev => [
      ...prev,
      { from: 'user', text: chatInput },
      { from: 'ai', text: 'Принято! Обновляю страницу...' },
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
        <h1 className="text-xl font-bold text-gray-900">{site.name}</h1>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${site.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {site.status === 'published' ? 'Опубликован' : 'Черновик'}
        </span>
      </div>

      {/* Main split: AI chat + preview */}
      <div className="flex gap-4 h-[480px]">
        {/* LEFT: AI Chat */}
        <div className="flex flex-col w-[360px] flex-shrink-0 bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-[#6A55F8] flex items-center justify-center text-white text-xs">AI</div>
            <span className="text-sm font-semibold text-gray-800">AI-редактор сайта</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
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
              placeholder="Напишите команду..."
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-1 focus:ring-[#6A55F8]"
            />
            <button
              onClick={sendMessage}
              className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              →
            </button>
          </div>
        </div>

        {/* RIGHT: Fake site preview */}
        <div className="flex-1 bg-white rounded-xl border border-gray-100 overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-yellow-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
            </div>
            <div className="flex-1 bg-white rounded border border-gray-200 px-3 py-1 text-xs text-gray-500 mx-2">{site.url}</div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {/* Fake landing content */}
            <div className="bg-gradient-to-br from-[#6A55F8] to-[#8B7BFA] text-white p-10 text-center">
              <p className="text-xs uppercase tracking-widest opacity-70 mb-2">Превью сайта: {site.name}</p>
              <h2 className="text-3xl font-bold mb-4 leading-tight">Как AI делает маркетинг за тебя</h2>
              <p className="text-base opacity-80 mb-6">Смотри видео и узнай 3 кейса, где нейросети заменили целый отдел маркетинга</p>
              <button className="bg-white text-[#6A55F8] font-bold px-6 py-3 rounded-xl text-sm">Смотреть видео →</button>
            </div>
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-3 gap-4">
                {['Кейс 1: +300% трафик', 'Кейс 2: -80% затрат', 'Кейс 3: x5 конверсия'].map(c => (
                  <div key={c} className="bg-[#F0EDFF] rounded-xl p-4 text-center">
                    <div className="text-2xl mb-2">📈</div>
                    <p className="text-xs font-semibold text-gray-800">{c}</p>
                  </div>
                ))}
              </div>
              <div className="text-center">
                <button className="bg-[#6A55F8] text-white font-bold px-8 py-3 rounded-xl text-sm">Получить доступ</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Analytics tabs */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center gap-1 mb-4">
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'analytics' ? 'bg-[#F0EDFF] text-[#6A55F8]' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            Аналитика
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-5">
          <div className="bg-[#F0EDFF] rounded-xl p-4">
            <p className="text-2xl font-bold text-[#6A55F8]">{site.visits}</p>
            <p className="text-xs text-gray-500 mt-0.5">Визиты</p>
          </div>
          <div className="bg-[#F0EDFF] rounded-xl p-4">
            <p className="text-2xl font-bold text-[#6A55F8]">{site.conversions}</p>
            <p className="text-xs text-gray-500 mt-0.5">Конверсии</p>
          </div>
          <div className="bg-[#F0EDFF] rounded-xl p-4">
            <p className="text-2xl font-bold text-[#6A55F8]">{conversionRate(site.visits, site.conversions)}</p>
            <p className="text-xs text-gray-500 mt-0.5">Конверсия</p>
          </div>
        </div>

        <p className="text-sm font-semibold text-gray-800 mb-3">Конверсия по кнопкам</p>
        <div className="space-y-3">
          {fakeButtonAnalytics.map(btn => (
            <div key={btn.name} className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700">{btn.name}</span>
                  <span className="text-sm font-semibold text-[#6A55F8]">{btn.clicks} кликов · {btn.conversion}% конверсия</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="bg-[#6A55F8] h-2 rounded-full" style={{ width: `${btn.conversion}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function SitesScreen() {
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const selectedSite = landings.find(l => l.id === selectedId)

  if (selectedSite) {
    return <SiteDetail site={selectedSite} onBack={() => setSelectedId(null)} />
  }

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
                <button
                  onClick={() => setSelectedId(landing.id)}
                  className="text-xs text-[#6A55F8] font-medium border border-[#6A55F8] rounded-lg px-3 py-1.5 hover:bg-[#F0EDFF] transition-colors"
                >
                  Редактировать
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
