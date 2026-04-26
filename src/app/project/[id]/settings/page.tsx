'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ROOT_DOMAIN } from '@/lib/subdomain'

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

  const [activeTab, setActiveTab] = useState<'integrations' | 'profile' | 'fields' | 'danger'>('integrations')
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
    { id: 'danger' as const, label: 'Опасная зона' },
  ]

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900">Настройки проекта</h1>

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

      {activeTab === 'danger' && <DangerTab projectId={projectId} />}
    </div>
  )
}

// =============================================================================
// DANGER TAB — удаление проекта
// =============================================================================
function DangerTab({ projectId }: { projectId: string }) {
  const [projectName, setProjectName] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  useEffect(() => {
    supabase.from('projects').select('name').eq('id', projectId).single().then(({ data }) => {
      setProjectName(data?.name ?? '')
    })
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [projectId])

  async function handleDelete() {
    setDeleting(true)
    setError('')
    const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error || 'Не удалось удалить проект')
      setDeleting(false)
      return
    }
    // На субдомене удалённого проекта оставаться нельзя — отправляем на главную с проектами
    window.location.assign(`https://${ROOT_DOMAIN}/projects`)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-red-200 p-5">
        <h2 className="text-base font-semibold text-red-700 mb-1">Удалить проект</h2>
        <p className="text-sm text-gray-600 mb-4">
          Будут удалены все данные проекта: клиенты, лендинги, боты, заказы, рассылки,
          подключённые домены. Действие необратимо.
        </p>

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
          >
            Удалить проект
          </button>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Введите название проекта <code className="bg-gray-100 px-1 rounded font-mono">{projectName}</code> для подтверждения
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                autoFocus
                placeholder={projectName}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={confirmText !== projectName || deleting}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Удаляем...' : 'Подтвердить удаление'}
              </button>
              <button
                onClick={() => { setConfirming(false); setConfirmText(''); setError('') }}
                className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Настройки аккаунта</h2>
        <p className="text-sm text-gray-600 mb-3">
          Управление аккаунтом и удаление аккаунта целиком — на странице настроек аккаунта.
        </p>
        <a
          href="/account/settings"
          className="inline-block px-4 py-2 rounded-lg bg-white border border-gray-200 hover:border-[#6A55F8]/30 text-sm font-medium text-gray-700 hover:text-[#6A55F8] transition-colors"
        >
          Перейти в настройки аккаунта →
        </a>
      </div>
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

