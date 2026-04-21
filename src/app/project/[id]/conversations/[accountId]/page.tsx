'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

type ManagerAccount = {
  id: string
  project_id: string
  title: string | null
  telegram_user_id: number | null
  telegram_username: string | null
  telegram_first_name: string | null
  telegram_phone: string | null
  status: 'active' | 'error' | 'disabled'
  last_error: string | null
  initial_import_done: boolean
  last_sync_at: string | null
  connected_at: string
  description: string | null
}

type Conversation = {
  id: string
  peer_telegram_id: number
  peer_username: string | null
  peer_first_name: string | null
  customer_id: string | null
  status: 'open' | 'closed'
  last_message_at: string | null
  unread_count: number
}

type Msg = {
  id: string
  telegram_message_id: number
  direction: 'incoming' | 'outgoing'
  text: string | null
  media_type: string | null
  sent_at: string
}

export default function ManagerAccountPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const accountId = params.accountId as string
  const supabase = createClient()

  const [account, setAccount] = useState<ManagerAccount | null>(null)
  const [tab, setTab] = useState<'dialogs' | 'settings'>('dialogs')
  const [loading, setLoading] = useState(true)

  async function loadAccount() {
    setLoading(true)
    const { data } = await supabase.from('manager_accounts').select('*').eq('id', accountId).maybeSingle()
    setAccount(data as ManagerAccount | null)
    setLoading(false)
    if (typeof window !== 'undefined') localStorage.setItem(`conversations_last_${projectId}`, accountId)
  }

  useEffect(() => { loadAccount() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [accountId])

  function goBack() {
    if (typeof window !== 'undefined') localStorage.removeItem(`conversations_last_${projectId}`)
    router.push(`/project/${projectId}/conversations`)
  }

  if (loading) return <div className="text-center py-10 text-sm text-gray-400">Загрузка…</div>

  if (!account) return (
    <div className="max-w-3xl">
      <Link href={`/project/${projectId}/conversations`} className="text-sm text-[#6A55F8] hover:underline">← Все аккаунты</Link>
      <div className="bg-white rounded-xl border border-gray-100 p-12 text-center mt-4">
        <p className="text-gray-500">Аккаунт не найден</p>
      </div>
    </div>
  )

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Хедер */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={goBack} className="text-sm text-gray-500 hover:text-gray-700">← Аккаунты</button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {account.title ?? account.telegram_first_name ?? account.telegram_username ?? 'Аккаунт'}
            </h1>
            {account.telegram_username && (
              <p className="text-xs text-gray-400">@{account.telegram_username.replace(/^@/, '')} · id {account.telegram_user_id}</p>
            )}
          </div>
          {account.status === 'error' && (
            <span className="text-[10px] uppercase bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded font-semibold" title={account.last_error ?? ''}>Ошибка</span>
          )}
          {!account.initial_import_done && account.status === 'active' && (
            <span className="text-[10px] uppercase bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-semibold">Импорт</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-100 mb-4">
        {([
          { k: 'dialogs', l: 'Диалоги' },
          { k: 'settings', l: 'Настройки' },
        ] as const).map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === t.k ? 'border-[#6A55F8] text-[#6A55F8]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'dialogs' ? (
        <DialogsTab accountId={accountId} projectId={projectId} />
      ) : (
        <SettingsTab account={account} onDone={goBack} onReload={loadAccount} />
      )}
    </div>
  )
}

// ==================== DIALOGS TAB ====================
function DialogsTab({ accountId, projectId }: { accountId: string; projectId: string }) {
  const supabase = createClient()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const msgEndRef = useRef<HTMLDivElement>(null)

  async function loadConversations() {
    const { data } = await supabase
      .from('manager_conversations')
      .select('id, peer_telegram_id, peer_username, peer_first_name, customer_id, status, last_message_at, unread_count')
      .eq('manager_account_id', accountId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(200)
    setConversations((data ?? []) as Conversation[])
  }

  async function loadMessages() {
    if (!activeConvId) { setMessages([]); return }
    const { data } = await supabase
      .from('manager_messages')
      .select('id, telegram_message_id, direction, text, media_type, sent_at')
      .eq('conversation_id', activeConvId)
      .order('sent_at', { ascending: true })
      .limit(500)
    setMessages((data ?? []) as Msg[])
    await supabase.from('manager_conversations').update({ unread_count: 0 }).eq('id', activeConvId)
    setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  useEffect(() => { loadConversations() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [accountId])
  useEffect(() => { loadMessages() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeConvId])

  useEffect(() => {
    const t = setInterval(() => { loadConversations(); if (activeConvId) loadMessages() }, 30_000)
    return () => clearInterval(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConvId])

  async function sendReply() {
    const text = input.trim()
    if (!text || !activeConvId || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/social/telegram/manager/reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeConvId, text }),
      })
      const json = await res.json()
      if (json.error) { alert('Ошибка: ' + json.error); return }
      setInput('')
      await loadMessages()
      await loadConversations()
    } finally { setSending(false) }
  }

  const activeConv = conversations.find(c => c.id === activeConvId) ?? null
  const unreadTotal = conversations.filter(c => c.unread_count > 0).length

  return (
    <div className="flex-1 flex gap-4 min-h-0">
      {/* Список диалогов */}
      <div className="w-80 bg-white rounded-xl border border-gray-100 overflow-hidden flex flex-col">
        <div className="p-3 border-b border-gray-100">
          <p className="text-xs text-gray-500">
            {conversations.length} {conversations.length === 1 ? 'диалог' : 'диалогов'}
            {unreadTotal > 0 && <span className="ml-2 bg-rose-500 text-white px-1.5 py-0.5 rounded-full text-[10px] font-bold">{unreadTotal} новых</span>}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-400 px-4">
              Диалогов пока нет. Как только кто-то напишет менеджеру в ЛС — появится здесь.
            </div>
          ) : conversations.map(c => (
            <button key={c.id} onClick={() => setActiveConvId(c.id)}
              className={`w-full text-left px-3 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${activeConvId === c.id ? 'bg-[#F0EDFF]' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-gray-900 text-sm truncate">
                  {c.peer_first_name ?? '—'}
                  {c.peer_username ? <span className="text-gray-400 font-normal"> · @{c.peer_username.replace(/^@/, '')}</span> : null}
                </p>
                {c.unread_count > 0 && (
                  <span className="bg-rose-500 text-white px-1.5 py-0.5 rounded-full text-[10px] font-bold">{c.unread_count}</span>
                )}
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {c.last_message_at ? new Date(c.last_message_at).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                {c.customer_id && <span className="ml-2 text-[#6A55F8]">· в CRM</span>}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Чат */}
      <div className="flex-1 bg-white rounded-xl border border-gray-100 overflow-hidden flex flex-col">
        {!activeConv ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Выбери диалог слева</div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">
                  {activeConv.peer_first_name ?? '—'}
                  {activeConv.peer_username && <span className="text-gray-400 font-normal"> · @{activeConv.peer_username.replace(/^@/, '')}</span>}
                </p>
                <p className="text-[11px] text-gray-400">Telegram ID: {activeConv.peer_telegram_id}</p>
              </div>
              {activeConv.customer_id && (
                <Link href={`/project/${projectId}/users?open=${activeConv.customer_id}`} className="text-xs text-[#6A55F8] hover:underline">
                  Карточка клиента →
                </Link>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.length === 0 ? (
                <div className="text-center text-xs text-gray-400 py-10">Нет сообщений</div>
              ) : messages.map(m => (
                <div key={m.id} className={`flex ${m.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] rounded-xl px-3 py-2 text-sm ${m.direction === 'outgoing' ? 'bg-[#6A55F8] text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
                    {m.text
                      ? <p className="whitespace-pre-wrap">{m.text}</p>
                      : <p className="italic opacity-60">[{m.media_type ?? 'медиа'}]</p>}
                    <p className={`text-[10px] mt-1 ${m.direction === 'outgoing' ? 'text-white/60' : 'text-gray-400'}`}>
                      {new Date(m.sent_at).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={msgEndRef} />
            </div>
            <div className="p-3 border-t border-gray-100 flex gap-2">
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                placeholder="Сообщение…" disabled={sending}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
              <button onClick={sendReply} disabled={sending || !input.trim()}
                className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                {sending ? '…' : 'Отправить'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ==================== SETTINGS TAB ====================
type Grant = { id: string; user_id: string; granted_at: string; email?: string | null; full_name?: string | null }
type ProjectMember = { user_id: string; role: string; email?: string | null; full_name?: string | null }

function SettingsTab({ account, onDone, onReload }: {
  account: ManagerAccount
  onDone: () => void
  onReload: () => void
}) {
  const supabase = createClient()
  const [title, setTitle] = useState(account.title ?? '')
  const [description, setDescription] = useState(account.description ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [grants, setGrants] = useState<Grant[]>([])
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [resyncing, setResyncing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  async function loadGrants() {
    // Каждая grant-запись + email из profiles
    const { data: gs } = await supabase
      .from('manager_account_grants')
      .select('id, user_id, granted_at')
      .eq('manager_account_id', account.id)
    const userIds = (gs ?? []).map(g => g.user_id)
    let profiles: Record<string, { email?: string; full_name?: string }> = {}
    if (userIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, email, full_name').in('id', userIds)
      profiles = Object.fromEntries((profs ?? []).map(p => [p.id, p]))
    }
    setGrants((gs ?? []).map(g => ({ ...g, email: profiles[g.user_id]?.email ?? null, full_name: profiles[g.user_id]?.full_name ?? null })))

    // Members проекта — для выдачи доступа
    const { data: ms } = await supabase.from('project_members').select('user_id, role').eq('project_id', account.project_id)
    const memberIds = (ms ?? []).map(m => m.user_id)
    let memberProfiles: Record<string, { email?: string; full_name?: string }> = {}
    if (memberIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, email, full_name').in('id', memberIds)
      memberProfiles = Object.fromEntries((profs ?? []).map(p => [p.id, p]))
    }
    setMembers((ms ?? []).map(m => ({ ...m, email: memberProfiles[m.user_id]?.email ?? null, full_name: memberProfiles[m.user_id]?.full_name ?? null })))
  }

  useEffect(() => { loadGrants() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [account.id])

  async function saveMeta() {
    setSaving(true)
    await supabase.from('manager_accounts').update({
      title: title.trim() || null,
      description: description.trim() || null,
    }).eq('id', account.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    onReload()
  }

  async function toggleGrant(userId: string, hasIt: boolean) {
    if (hasIt) {
      await supabase.from('manager_account_grants').delete().eq('manager_account_id', account.id).eq('user_id', userId)
    } else {
      await supabase.from('manager_account_grants').insert({ manager_account_id: account.id, user_id: userId })
    }
    await loadGrants()
  }

  async function resyncNow() {
    setResyncing(true)
    try {
      await fetch('/api/cron/manager-sync').catch(() => null)
    } finally {
      setResyncing(false)
      onReload()
    }
  }

  async function disconnectAccount() {
    if (!confirm('Отвязать аккаунт? Session будет отозвана в Telegram, диалоги и сообщения в БД останутся.')) return
    setDisconnecting(true)
    try {
      const res = await fetch('/api/social/telegram/manager/logout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: account.id }),
      })
      if (!res.ok) { alert('Не удалось отвязать'); return }
      onDone()
    } finally { setDisconnecting(false) }
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-4 max-w-3xl">
      {/* Основные данные */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <h3 className="font-semibold text-gray-900">Параметры аккаунта</h3>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Название</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Хасан (продажи)"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Описание / заметка</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Например: отвечает с 9 до 18, профиль отдела продаж"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
        </div>
        <div className="text-xs text-gray-500 space-y-1 bg-gray-50 rounded-lg p-3">
          <p>Telegram: <b>{account.telegram_first_name ?? '—'}</b>{account.telegram_username && <> · @{account.telegram_username.replace(/^@/, '')}</>}</p>
          <p>ID: {account.telegram_user_id ?? '—'}</p>
          {account.telegram_phone && <p>Телефон: ····{account.telegram_phone}</p>}
          <p>Подключён: {new Date(account.connected_at).toLocaleString('ru-RU')}</p>
          <p>Последняя синхронизация: {account.last_sync_at ? new Date(account.last_sync_at).toLocaleString('ru-RU') : 'ещё не было'}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={saveMeta} disabled={saving}
            className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? 'Сохраняю…' : 'Сохранить'}
          </button>
          {saved && <span className="text-sm text-emerald-600">✓ сохранено</span>}
        </div>
      </div>

      {/* Доступ сотрудников */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
        <div>
          <h3 className="font-semibold text-gray-900">Доступ сотрудников</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Владелец проекта всегда видит все аккаунты. Остальные — только те, которым ты выдашь доступ.
          </p>
        </div>
        {members.length === 0 ? (
          <p className="text-sm text-gray-400 py-3">В проекте только ты. Пригласи сотрудников в разделе <b>Настройки → Команда</b>, потом выдашь им доступ сюда.</p>
        ) : (
          <div className="space-y-2">
            {members.map(m => {
              const hasGrant = grants.some(g => g.user_id === m.user_id)
              const isOwner = m.role === 'owner'
              return (
                <label key={m.user_id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${isOwner ? 'bg-gray-50 border-gray-100' : 'border-gray-200 hover:bg-gray-50 cursor-pointer'}`}>
                  <input type="checkbox" checked={isOwner || hasGrant} disabled={isOwner}
                    onChange={() => !isOwner && toggleGrant(m.user_id, hasGrant)} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{m.full_name ?? m.email ?? m.user_id.slice(0, 8)}</p>
                    {m.email && <p className="text-xs text-gray-500">{m.email}</p>}
                  </div>
                  <span className="text-xs text-gray-400">{m.role}</span>
                  {isOwner && <span className="text-[10px] uppercase bg-[#F0EDFF] text-[#6A55F8] px-1.5 py-0.5 rounded font-semibold">владелец</span>}
                </label>
              )
            })}
          </div>
        )}
      </div>

      {/* Действия */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
        <h3 className="font-semibold text-gray-900">Действия</h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={resyncNow} disabled={resyncing}
            className="border border-gray-200 hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {resyncing ? 'Синхронизирую…' : '↻ Синхронизировать сейчас'}
          </button>
        </div>
      </div>

      {/* Опасная зона */}
      <div className="bg-white rounded-xl border border-red-200 p-5 space-y-3">
        <h3 className="font-semibold text-red-700">Опасная зона</h3>
        <p className="text-sm text-gray-600">
          Отвязка отзывает session в Telegram (дальше этот аккаунт не сможет работать в платформе через нас).
          Диалоги и история останутся в БД — при повторном подключении того же аккаунта можно будет смотреть прошлые переписки.
        </p>
        <button onClick={disconnectAccount} disabled={disconnecting}
          className="border border-red-300 text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {disconnecting ? 'Отвязываю…' : 'Отвязать аккаунт'}
        </button>
      </div>
    </div>
  )
}
