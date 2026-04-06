'use client'

import { useState } from 'react'
import { currentUser, projects } from '@/lib/mock-data'

type Tab = 'profile' | 'domain' | 'integrations' | 'notifications'

const tabs: { id: Tab; label: string }[] = [
  { id: 'profile', label: 'Профиль' },
  { id: 'domain', label: 'Домен' },
  { id: 'integrations', label: 'Интеграции' },
  { id: 'notifications', label: 'Уведомления' },
]

export default function SettingsScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('profile')
  const [name, setName] = useState(currentUser.name)
  const [email, setEmail] = useState(currentUser.email)
  const [domain, setDomain] = useState(projects[0].domain)
  const [tgToken, setTgToken] = useState('7234567890:AAH...')
  const [prodamusKey, setProdamusKey] = useState('pk_live_...')
  const [emailNotif, setEmailNotif] = useState(true)
  const [tgNotif, setTgNotif] = useState(true)
  const [paymentNotif, setPaymentNotif] = useState(true)
  const [leadNotif, setLeadNotif] = useState(false)

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Настройки</h1>
        <p className="text-sm text-gray-500 mt-0.5">Управляйте профилем, доменом и интеграциями</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-100">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-[#6A55F8] text-[#6A55F8]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {activeTab === 'profile' && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5 max-w-lg">
          <h2 className="text-base font-semibold text-gray-900">Данные профиля</h2>

          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[#F0EDFF] flex items-center justify-center text-2xl font-bold text-[#6A55F8]">
              {name.charAt(0)}
            </div>
            <div>
              <button className="text-sm text-[#6A55F8] font-medium hover:underline">Загрузить фото</button>
              <p className="text-xs text-gray-400 mt-0.5">JPG, PNG до 2 МБ</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Имя</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-1 focus:ring-[#6A55F8] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-1 focus:ring-[#6A55F8] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Роль</label>
              <div className="px-3 py-2.5 rounded-lg border border-gray-100 bg-gray-50 text-sm text-gray-600">
                Владелец
              </div>
            </div>
          </div>

          <button className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors w-full">
            Сохранить изменения
          </button>
        </div>
      )}

      {/* Domain tab */}
      {activeTab === 'domain' && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5 max-w-lg">
          <h2 className="text-base font-semibold text-gray-900">Настройка домена</h2>

          <div className="bg-[#F0EDFF] rounded-lg px-4 py-3 flex items-center gap-3">
            <span className="text-lg">🌐</span>
            <div>
              <p className="text-xs text-gray-500">Текущий домен</p>
              <p className="text-sm font-semibold text-[#6A55F8]">{domain}</p>
            </div>
            <span className="ml-auto rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">Активен</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Изменить домен</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={domain ?? ''}
                onChange={e => setDomain(e.target.value)}
                placeholder="example.ru"
                className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-1 focus:ring-[#6A55F8] transition-colors"
              />
              <button className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap">
                Подтвердить
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">Добавьте CNAME-запись: studency.io → ваш домен</p>
          </div>

          <div className="border border-gray-100 rounded-lg p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-700">DNS-инструкция</p>
            <div className="font-mono text-xs bg-gray-50 rounded p-3 text-gray-600 space-y-1">
              <div>Тип: CNAME</div>
              <div>Имя: @</div>
              <div>Значение: proxy.studency.io</div>
              <div>TTL: 3600</div>
            </div>
          </div>
        </div>
      )}

      {/* Integrations tab */}
      {activeTab === 'integrations' && (
        <div className="space-y-4 max-w-lg">
          {/* Telegram */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-xl">✈️</div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Telegram Bot</p>
                  <p className="text-xs text-gray-500">Подключите бота через BotFather</p>
                </div>
              </div>
              <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">Подключён</span>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Bot Token</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={tgToken}
                  onChange={e => setTgToken(e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:border-[#6A55F8] focus:ring-1 focus:ring-[#6A55F8] transition-colors"
                />
                <button className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-gray-300 transition-colors">
                  Показать
                </button>
              </div>
            </div>
            <button className="text-sm text-[#6A55F8] font-medium hover:underline">Обновить токен</button>
          </div>

          {/* Prodamus */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-xl">💳</div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Prodamus</p>
                  <p className="text-xs text-gray-500">Платёжный провайдер для приёма оплат</p>
                </div>
              </div>
              <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">Подключён</span>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">API-ключ</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={prodamusKey}
                  onChange={e => setProdamusKey(e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:border-[#6A55F8] focus:ring-1 focus:ring-[#6A55F8] transition-colors"
                />
                <button className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-gray-300 transition-colors">
                  Показать
                </button>
              </div>
            </div>
            <button className="text-sm text-[#6A55F8] font-medium hover:underline">Обновить ключ</button>
          </div>

          {/* Other integrations placeholder */}
          <div className="bg-white rounded-xl border border-dashed border-gray-200 p-5 flex items-center justify-center cursor-pointer hover:border-[#6A55F8] transition-colors">
            <div className="text-center">
              <p className="text-sm font-medium text-gray-600">+ Добавить интеграцию</p>
              <p className="text-xs text-gray-400 mt-0.5">AmoCRM, GetCourse, ВКонтакте и другие</p>
            </div>
          </div>
        </div>
      )}

      {/* Notifications tab */}
      {activeTab === 'notifications' && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4 max-w-lg">
          <h2 className="text-base font-semibold text-gray-900">Уведомления</h2>
          <p className="text-xs text-gray-500">Выберите, о каких событиях вы хотите получать уведомления</p>

          {[
            { label: 'Email-уведомления', desc: 'Получать сводку на почту', value: emailNotif, set: setEmailNotif },
            { label: 'Telegram-уведомления', desc: 'Уведомления в ваш личный Telegram', value: tgNotif, set: setTgNotif },
            { label: 'Новые оплаты', desc: 'Мгновенно при каждой оплате', value: paymentNotif, set: setPaymentNotif },
            { label: 'Новые лиды', desc: 'При каждом новом подписчике бота', value: leadNotif, set: setLeadNotif },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-sm font-medium text-gray-900">{item.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
              </div>
              <button
                onClick={() => item.set(!item.value)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${item.value ? 'bg-[#6A55F8]' : 'bg-gray-200'}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${item.value ? 'translate-x-6' : 'translate-x-1'}`}
                />
              </button>
            </div>
          ))}

          <button className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors w-full mt-2">
            Сохранить
          </button>
        </div>
      )}
    </div>
  )
}
