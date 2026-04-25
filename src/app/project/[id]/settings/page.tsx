'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { validateSubdomain, ROOT_DOMAIN } from '@/lib/subdomain'

type TelegramBot = {
  id: string
  name: string
  token: string
  bot_username: string | null
  is_active: boolean
  created_at: string
  channel_id: string | null
  channel_username: string | null
}

function BotCard({ bot, projectId, onReload }: { bot: TelegramBot; projectId: string; onReload: () => void }) {
  const supabase = createClient()
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [channelId, setChannelId] = useState(bot.channel_id ?? '')
  const [channelUsername, setChannelUsername] = useState(bot.channel_username ?? '')
  const [channelDirty, setChannelDirty] = useState(false)
  const [savingChannel, setSavingChannel] = useState(false)

  async function toggleActive() {
    const newActive = !bot.is_active
    await supabase.from('telegram_bots').update({ is_active: newActive }).eq('id', bot.id)

    if (newActive) {
      // Переустановить webhook с обновлённым allowed_updates
      await fetch('/api/telegram/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: bot.token, projectId, name: bot.name, botId: bot.id }),
      })
    } else {
      // Удалить webhook
      await fetch(`https://api.telegram.org/bot${bot.token}/deleteWebhook`, { method: 'POST' })
    }
    onReload()
  }

  async function handleDelete() {
    // Удалить webhook
    await fetch(`https://api.telegram.org/bot${bot.token}/deleteWebhook`, { method: 'POST' }).catch(() => {})
    await supabase.from('telegram_bots').delete().eq('id', bot.id)
    onReload()
  }

  async function saveChannel() {
    setSavingChannel(true)
    await supabase.from('telegram_bots').update({
      channel_id: channelId.trim() || null,
      channel_username: channelUsername.trim() || null,
    }).eq('id', bot.id)
    setChannelDirty(false)
    setSavingChannel(false)
    onReload()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="p-5 flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-xl">🤖</div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900">{bot.name}</h3>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${bot.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {bot.is_active ? 'Активен' : 'Отключён'}
              </span>
              {bot.channel_id && (
                <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-600">
                  📢 Канал привязан
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">@{bot.bot_username || '...'} · подключён {new Date(bot.created_at).toLocaleDateString('ru')}</p>
          </div>
        </div>
        <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded settings */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4">
          {/* Включить/выключить */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-700">Бот активен</p>
              <p className="text-[10px] text-gray-400">Отключение удалит webhook, бот перестанет отвечать</p>
            </div>
            <button onClick={toggleActive}
              className={`w-10 h-5 rounded-full transition-colors relative ${bot.is_active ? 'bg-[#6A55F8]' : 'bg-gray-200'}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${bot.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* Канал — привязывается автоматически */}
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1">Telegram-канал</p>
            {bot.channel_id ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <span className="text-green-600 text-sm">✓</span>
                  <div>
                    <p className="text-sm font-medium text-green-800">Канал привязан: {bot.channel_username || bot.channel_id}</p>
                    <p className="text-[10px] text-green-600 mt-0.5">Подписки и отписки фиксируются автоматически</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-600 mb-1">Канал не привязан</p>
                <p className="text-[10px] text-gray-400">Добавьте этого бота как <strong>администратора</strong> в ваш Telegram-канал — канал привяжется автоматически. Ничего вводить не нужно.</p>
              </div>
            )}
          </div>

          {/* Токен */}
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1">Токен</p>
            <code className="block bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs text-gray-600 break-all">{bot.token}</code>
          </div>

          {/* Удалить */}
          <div className="pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700">Удалить бота</p>
              {!confirmDelete ? (
                <button onClick={() => setConfirmDelete(true)} className="px-3 py-1.5 rounded-lg border border-red-300 text-sm text-red-600 hover:bg-red-50">Удалить</button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={handleDelete} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">Да, удалить</button>
                  <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-50">Отмена</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()

  const [activeTab, setActiveTab] = useState<'integrations' | 'profile' | 'domain' | 'fields'>('integrations')
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
      // Refresh list to pick up newly inserted bot with server-filled fields
      loadBots()
    } catch {
      setError('Ошибка сети')
    }

    setSaving(false)
  }

  const tabs = [
    { id: 'integrations' as const, label: 'Интеграции' },
    { id: 'fields' as const, label: 'Поля клиента' },
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
                <BotCard key={bot.id} bot={bot} projectId={projectId} onReload={loadBots} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'fields' && <CustomFieldsTab projectId={projectId} />}

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

      {activeTab === 'domain' && <DomainTab projectId={projectId} />}
    </div>
  )
}

// =============================================================================
// CUSTOM FIELDS TAB — управление кастомными полями клиента
// =============================================================================
type CustomField = {
  id: string
  field_key: string
  field_label: string
  field_type: string
  field_options: unknown
  order_index: number
}

function CustomFieldsTab({ projectId }: { projectId: string }) {
  const [fields, setFields] = useState<CustomField[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newType, setNewType] = useState<'text' | 'number' | 'boolean' | 'date'>('text')

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/customers/custom-fields?project_id=${projectId}`)
    const json = await res.json()
    setFields(json.fields ?? [])
    setLoading(false)
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId])

  async function handleAdd() {
    if (!newKey.trim() || !newLabel.trim()) return
    await fetch('/api/customers/custom-fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        field_key: newKey.trim().toLowerCase().replace(/\s+/g, '_'),
        field_label: newLabel.trim(),
        field_type: newType,
      }),
    })
    setNewKey('')
    setNewLabel('')
    setNewType('text')
    setAdding(false)
    await load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Удалить поле? Все значения этого поля у клиентов будут потеряны.')) return
    await fetch(`/api/customers/custom-fields?id=${id}`, { method: 'DELETE' })
    await load()
  }

  const typeLabel = (t: string) => {
    switch (t) {
      case 'text': return 'Текст'
      case 'number': return 'Число'
      case 'boolean': return 'Да/Нет'
      case 'date': return 'Дата'
      default: return t
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Кастомные поля клиента</h2>
          <p className="text-xs text-gray-500">Добавь дополнительные поля для карточек клиентов</p>
        </div>
        <button onClick={() => setAdding(true)}
          className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium">
          + Добавить поле
        </button>
      </div>

      {adding && (
        <div className="bg-white rounded-xl border border-[#6A55F8]/30 p-5 shadow-sm space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Название (отображается)</label>
              <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
                placeholder="Например: Компания"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ключ (машинное имя)</label>
              <input type="text" value={newKey} onChange={e => setNewKey(e.target.value)}
                placeholder="company"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:border-[#6A55F8]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Тип</label>
            <select value={newType}
              onChange={e => setNewType(e.target.value as 'text' | 'number' | 'boolean' | 'date')}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
              <option value="text">Текст</option>
              <option value="number">Число</option>
              <option value="boolean">Да/Нет</option>
              <option value="date">Дата</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd}
              className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium">
              Создать
            </button>
            <button onClick={() => setAdding(false)}
              className="px-4 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100">
              Отмена
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-sm text-gray-400">Загрузка…</div>
      ) : fields.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-2">📋</div>
          <p className="text-sm text-gray-500">Нет кастомных полей</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {fields.map(f => (
            <div key={f.id} className="flex items-center justify-between px-5 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{f.field_label}</p>
                <p className="text-xs text-gray-500">
                  <code className="bg-gray-100 px-1 rounded">{f.field_key}</code>
                  <span className="ml-2">· {typeLabel(f.field_type)}</span>
                </p>
              </div>
              <button onClick={() => handleDelete(f.id)}
                className="text-xs text-gray-400 hover:text-red-500">
                Удалить
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// DOMAIN TAB — управление поддоменом и кастомным доменом проекта
// =============================================================================
function DomainTab({ projectId }: { projectId: string }) {
  const supabase = createClient()
  const [project, setProject] = useState<{
    subdomain: string
    custom_domain: string | null
    custom_domain_status: string | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingSub, setEditingSub] = useState(false)
  const [subInput, setSubInput] = useState('')
  const [subSaving, setSubSaving] = useState(false)
  const [subError, setSubError] = useState('')
  const [domainInput, setDomainInput] = useState('')
  const [domainSaving, setDomainSaving] = useState(false)
  const [domainError, setDomainError] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [verification, setVerification] = useState<any>(null)
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('projects')
      .select('subdomain, custom_domain, custom_domain_status')
      .eq('id', projectId)
      .single()
    setProject(data)
    setSubInput(data?.subdomain ?? '')
    // Если есть кастомный домен — подтягиваем актуальный статус из Vercel
    if (data?.custom_domain) {
      try {
        const res = await fetch(`/api/projects/${projectId}/domain`)
        const j = await res.json()
        if (j.verification) setVerification(j.verification)
        if (j.status && j.status !== data.custom_domain_status) {
          setProject(p => p ? { ...p, custom_domain_status: j.status } : p)
        }
      } catch { /* ignore */ }
    }
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId])

  async function saveSubdomain() {
    const sub = subInput.toLowerCase().trim()
    const err = validateSubdomain(sub)
    if (err) { setSubError(err); return }
    setSubSaving(true); setSubError('')
    const res = await fetch(`/api/projects/${projectId}/domain`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subdomain: sub }),
    })
    const j = await res.json()
    if (!res.ok) { setSubError(j.error || 'Не удалось сохранить'); setSubSaving(false); return }
    setEditingSub(false)
    setSubSaving(false)
    await load()
  }

  async function attachDomain() {
    const d = domainInput.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!d) { setDomainError('Укажи домен'); return }
    setDomainSaving(true); setDomainError(''); setVerification(null)
    const res = await fetch(`/api/projects/${projectId}/domain`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ custom_domain: d }),
    })
    const j = await res.json()
    if (!res.ok) { setDomainError(j.error || 'Не удалось добавить домен'); setDomainSaving(false); return }
    setDomainInput('')
    if (j.verification) setVerification(j.verification)
    setDomainSaving(false)
    await load()
  }

  async function refreshDomainStatus() {
    setRefreshing(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/domain`)
      const j = await res.json()
      if (j.verification) setVerification(j.verification)
      else setVerification(null)
      if (j.status) setProject(p => p ? { ...p, custom_domain_status: j.status } : p)
    } catch { /* ignore */ }
    setRefreshing(false)
  }

  async function detachDomain() {
    if (!confirm('Отключить кастомный домен? Сайт станет доступен только по поддомену.')) return
    await fetch(`/api/projects/${projectId}/domain`, { method: 'DELETE' })
    setVerification(null)
    await load()
  }

  if (loading) return <div className="text-sm text-gray-400 py-12 text-center">Загрузка...</div>
  if (!project) return <div className="text-sm text-red-500 py-12 text-center">Проект не найден</div>

  const status = project.custom_domain_status
  const statusLabel = status === 'verified' ? 'Подключён' : status === 'failed' ? 'Ошибка' : 'Ожидает DNS'
  const statusClass = status === 'verified' ? 'bg-green-50 text-green-700 border-green-200' : status === 'failed' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'

  return (
    <div className="space-y-5">
      {/* Поддомен */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Поддомен платформы</h2>
            <p className="text-xs text-gray-500 mt-0.5">Бесплатный адрес твоей школы. Доступен сразу.</p>
          </div>
          {!editingSub && (
            <button onClick={() => setEditingSub(true)} className="text-sm text-[#6A55F8] hover:underline">Изменить</button>
          )}
        </div>
        {editingSub ? (
          <div>
            <div className="flex items-center gap-1 mb-2">
              <input value={subInput} onChange={e => { setSubInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setSubError('') }}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8]" />
              <span className="text-sm text-gray-500 font-mono whitespace-nowrap">.{ROOT_DOMAIN}</span>
            </div>
            {subError && <p className="text-sm text-red-500 mb-2">{subError}</p>}
            <div className="flex gap-2">
              <button onClick={saveSubdomain} disabled={subSaving} className="px-4 py-2 bg-[#6A55F8] text-white rounded-lg text-sm font-medium hover:bg-[#5040D6] disabled:opacity-50">
                {subSaving ? 'Сохраняем...' : 'Сохранить'}
              </button>
              <button onClick={() => { setEditingSub(false); setSubInput(project.subdomain); setSubError('') }} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg">Отмена</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 rounded-lg">
            <code className="text-sm font-mono text-gray-900">{project.subdomain}.{ROOT_DOMAIN}</code>
            <a href={`https://${project.subdomain}.${ROOT_DOMAIN}`} target="_blank" rel="noopener" className="text-xs text-[#6A55F8] hover:underline ml-auto">Открыть ↗</a>
          </div>
        )}
      </div>

      {/* Кастомный домен */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Свой домен</h2>
        <p className="text-xs text-gray-500 mb-4">Подключи свой домен (например, shkola.com) — клиенты будут видеть только его.</p>

        {!project.custom_domain ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <input value={domainInput} onChange={e => { setDomainInput(e.target.value); setDomainError('') }}
                placeholder="shkola.com"
                className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8]" />
              <button onClick={attachDomain} disabled={domainSaving || !domainInput.trim()}
                className="px-4 py-2 bg-[#6A55F8] text-white rounded-lg text-sm font-medium hover:bg-[#5040D6] disabled:opacity-50 whitespace-nowrap">
                {domainSaving ? 'Подключаем...' : 'Подключить'}
              </button>
            </div>
            {domainError && <p className="text-sm text-red-500">{domainError}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono text-gray-900 px-3 py-2 bg-gray-50 rounded-lg flex-1">{project.custom_domain}</code>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusClass}`}>{statusLabel}</span>
            </div>
            {verification && Array.isArray(verification) && verification.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-blue-900 mb-2">Настрой DNS у регистратора:</p>
                <div className="space-y-1.5 font-mono text-xs">
                  {verification.map((v, i) => (
                    <div key={i} className="flex flex-wrap gap-2 text-gray-700">
                      <span className="font-bold text-blue-700">{v.type}</span>
                      <span>{v.domain}</span>
                      <span>→</span>
                      <span className="break-all">{v.value}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-blue-700 mt-3">После настройки DNS — нажми «Проверить». Vercel сам выдаст SSL.</p>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={refreshDomainStatus} disabled={refreshing} className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
                {refreshing ? 'Проверяем...' : 'Проверить статус'}
              </button>
              <button onClick={detachDomain} className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">Отключить</button>
            </div>
          </div>
        )}

        <details className="mt-5">
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">Как настроить DNS у регистратора</summary>
          <div className="mt-3 text-xs text-gray-600 space-y-1.5 leading-relaxed">
            <p>1. Подключи домен через эту форму — мы покажем тебе CNAME/A-записи которые надо добавить.</p>
            <p>2. Зайди в DNS-настройки у регистратора (РУЦЕНТР, REG.RU, Namecheap, GoDaddy и т.п.)</p>
            <p>3. Добавь записи как мы показали (обычно <code className="bg-gray-100 px-1 rounded">CNAME</code> на <code className="bg-gray-100 px-1 rounded">cname.vercel-dns.com</code>).</p>
            <p>4. Подожди 5-30 минут пока DNS распространится, нажми «Проверить статус».</p>
            <p>5. SSL-сертификат Vercel выдаст сам автоматически.</p>
          </div>
        </details>
      </div>
    </div>
  )
}
