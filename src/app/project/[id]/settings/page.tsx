'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type TelegramBot = {
  id: string
  name: string
  token: string
  bot_username: string | null
  is_active: boolean
  created_at: string
}

export default function SettingsPage() {
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()

  const [activeTab, setActiveTab] = useState<'integrations' | 'profile' | 'domain'>('integrations')
  const [bots, setBots] = useState<TelegramBot[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newToken, setNewToken] = useState('')
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function loadBots() {
    const { data } = await supabase
      .from('telegram_bots')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at')
    setBots(data ?? [])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadBots() }, [projectId])

  async function addBot() {
    if (!newToken.trim()) return
    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/telegram/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: newToken.trim(), projectId, name: newName.trim() || undefined }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Ошибка подключения')
        setSaving(false)
        return
      }

      setNewToken('')
      setNewName('')
      setAdding(false)
      await loadBots()
    } catch {
      setError('Ошибка сети')
    }

    setSaving(false)
  }

  const tabs = [
    { id: 'integrations' as const, label: 'Интеграции' },
    { id: 'profile' as const, label: 'Профиль' },
    { id: 'domain' as const, label: 'Домен' },
  ]

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900">Настройки</h1>

      <div className="flex items-center gap-1 border-b border-gray-100">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${
              activeTab === tab.id ? 'border-[#6A55F8] text-[#6A55F8]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>{tab.label}</button>
        ))}
      </div>

      {activeTab === 'integrations' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Telegram-боты</h2>
              <p className="text-xs text-gray-500">Подключённые боты для сценариев и рассылок</p>
            </div>
            <button onClick={() => setAdding(true)} className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              + Подключить бота
            </button>
          </div>

          {adding && (
            <div className="bg-white rounded-xl border border-[#6A55F8]/30 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Подключить Telegram-бота</h3>
              {error && <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Название (необязательно)</label>
                  <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Мой бот" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Токен от @BotFather</label>
                  <input type="text" value={newToken} onChange={e => setNewToken(e.target.value)} placeholder="123456789:AABBccDDee..." className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:border-[#6A55F8]" />
                  <p className="text-[10px] text-gray-400 mt-1">Получите токен у @BotFather в Telegram → /newbot</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={addBot} disabled={saving} className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                    {saving ? 'Подключаю...' : 'Подключить'}
                  </button>
                  <button onClick={() => { setAdding(false); setError('') }} className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50">Отмена</button>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Загрузка...</div>
          ) : bots.length === 0 && !adding ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
              <div className="text-4xl mb-4">🤖</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Нет подключённых ботов</h3>
              <p className="text-sm text-gray-500 mb-6">Подключите Telegram-бота чтобы создавать сценарии и рассылки</p>
            </div>
          ) : (
            <div className="space-y-3">
              {bots.map(bot => (
                <div key={bot.id} className="bg-white rounded-xl border border-gray-100 p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-xl">🤖</div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{bot.name}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${bot.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {bot.is_active ? 'Активен' : 'Отключён'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">@{bot.bot_username || '...'} · подключён {new Date(bot.created_at).toLocaleDateString('ru')}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-4">👤</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Профиль</h3>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            В разработке
          </div>
        </div>
      )}

      {activeTab === 'domain' && (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-4">🌐</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Домен</h3>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            В разработке
          </div>
        </div>
      )}
    </div>
  )
}
