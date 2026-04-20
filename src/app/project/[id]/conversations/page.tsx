'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

type ManagerAccount = {
  id: string
  project_id: string
  title: string | null
  telegram_user_id: number | null
  telegram_username: string | null
  telegram_first_name: string | null
  status: 'active' | 'error' | 'disabled'
  last_error: string | null
  initial_import_done: boolean
  last_sync_at: string | null
}

type Conversation = {
  id: string
  manager_account_id: string
  peer_telegram_id: number
  peer_username: string | null
  peer_first_name: string | null
  customer_id: string | null
  status: 'open' | 'closed'
  last_message_at: string | null
  last_incoming_at: string | null
  unread_count: number
}

type Msg = {
  id: string
  conversation_id: string
  telegram_message_id: number
  direction: 'incoming' | 'outgoing'
  text: string | null
  media_type: string | null
  sent_at: string
}

export default function ConversationsPage() {
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()

  const [accounts, setAccounts] = useState<ManagerAccount[]>([])
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const msgEndRef = useRef<HTMLDivElement>(null)

  async function loadAccounts() {
    const { data } = await supabase
      .from('manager_accounts')
      .select('*')
      .eq('project_id', projectId)
      .order('connected_at', { ascending: false })
    const list = (data ?? []) as ManagerAccount[]
    setAccounts(list)
    if (list.length > 0 && !activeAccountId) setActiveAccountId(list[0].id)
    setLoading(false)
  }

  async function loadConversations() {
    if (!activeAccountId) return
    const { data } = await supabase
      .from('manager_conversations')
      .select('*')
      .eq('manager_account_id', activeAccountId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(200)
    setConversations((data ?? []) as Conversation[])
  }

  async function loadMessages() {
    if (!activeConvId) { setMessages([]); return }
    const { data } = await supabase
      .from('manager_messages')
      .select('*')
      .eq('conversation_id', activeConvId)
      .order('sent_at', { ascending: true })
      .limit(500)
    setMessages((data ?? []) as Msg[])
    // Сбрасываем unread
    await supabase.from('manager_conversations').update({ unread_count: 0 }).eq('id', activeConvId)
    setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  useEffect(() => { loadAccounts() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId])
  useEffect(() => { loadConversations() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeAccountId])
  useEffect(() => { loadMessages() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeConvId])

  // Автообновление — раз в 30 сек перезагружаем список диалогов
  useEffect(() => {
    const t = setInterval(() => {
      if (activeAccountId) loadConversations()
      if (activeConvId) loadMessages()
    }, 30_000)
    return () => clearInterval(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId, activeConvId])

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

  if (loading) return <div className="text-center py-10 text-sm text-gray-400">Загрузка…</div>

  // Нет подключённых аккаунтов — показываем onboarding
  if (accounts.length === 0 && !addOpen) {
    return (
      <div className="max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Переписки</h1>
          <p className="text-sm text-gray-500 mt-1">Личные диалоги менеджера с клиентами в Telegram — прямо в платформе</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-3">✉️</div>
          <h3 className="font-medium text-gray-800 mb-1">Аккаунт менеджера ещё не подключён</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-4">
            Подключи Telegram-аккаунт, с которого менеджер общается с клиентами.
            Все его личные диалоги будут здесь, ответы можно писать прямо отсюда.
          </p>
          <button onClick={() => setAddOpen(true)}
            className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-5 py-2.5 rounded-lg text-sm font-medium">
            + Добавить аккаунт менеджера
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Хедер */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Переписки</h1>
          <p className="text-xs text-gray-500">
            {accounts.length} {accounts.length === 1 ? 'аккаунт' : 'аккаунтов'} подключено. Новые сообщения появляются с задержкой до 1 минуты.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {accounts.length > 1 && (
            <select value={activeAccountId ?? ''} onChange={e => { setActiveAccountId(e.target.value); setActiveConvId(null) }}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2">
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.title ?? a.telegram_first_name ?? a.telegram_username ?? a.id.slice(0, 6)}
                  {a.status === 'error' ? ' ⚠' : ''}
                </option>
              ))}
            </select>
          )}
          <button onClick={() => setAddOpen(true)}
            className="border border-[#6A55F8] text-[#6A55F8] hover:bg-[#F0EDFF] px-3 py-2 rounded-lg text-sm font-medium">
            + Аккаунт
          </button>
        </div>
      </div>

      {/* Статус текущего аккаунта */}
      {activeAccountId && (() => {
        const acc = accounts.find(a => a.id === activeAccountId)
        if (!acc) return null
        if (acc.status === 'error') {
          return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-xs text-red-700">
              ⚠ Ошибка синхронизации: {acc.last_error ?? 'неизвестно'}. Возможно session отозвана — переподключи аккаунт.
            </div>
          )
        }
        if (!acc.initial_import_done) {
          return (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 text-xs text-amber-800">
              ⏳ Идёт первичный импорт диалогов за последние 30 дней. Обычно занимает 1-3 минуты.
            </div>
          )
        }
        return null
      })()}

      {/* Сплит: диалоги + чат */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Список диалогов */}
        <div className="w-80 bg-white rounded-xl border border-gray-100 overflow-hidden flex flex-col">
          <div className="p-3 border-b border-gray-100">
            <p className="text-xs text-gray-500">
              {conversations.length} {conversations.length === 1 ? 'диалог' : 'диалогов'}
              {conversations.filter(c => c.unread_count > 0).length > 0 && (
                <span className="ml-2 bg-rose-500 text-white px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                  {conversations.filter(c => c.unread_count > 0).length} новых
                </span>
              )}
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
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
              Выбери диалог слева
            </div>
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
                  <Link href={`/project/${projectId}/users?open=${activeConv.customer_id}`}
                    className="text-xs text-[#6A55F8] hover:underline">
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
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                  placeholder="Сообщение…"
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]"
                  disabled={sending}
                />
                <button onClick={sendReply} disabled={sending || !input.trim()}
                  className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                  {sending ? '…' : 'Отправить'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {addOpen && (
        <AddManagerModal projectId={projectId} onClose={() => setAddOpen(false)}
          onDone={() => { setAddOpen(false); loadAccounts() }} />
      )}
    </div>
  )
}

function AddManagerModal({ projectId, onClose, onDone }: {
  projectId: string
  onClose: () => void
  onDone: () => void
}) {
  const [step, setStep] = useState<'guide' | 'creds' | 'code'>('guide')
  const [apiId, setApiId] = useState('')
  const [apiHash, setApiHash] = useState('')
  const [phone, setPhone] = useState('')
  const [title, setTitle] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [flowId, setFlowId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function sendCode() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/social/telegram/manager/login-start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, apiId: Number(apiId), apiHash: apiHash.trim(), phone: phone.trim(), title: title.trim() || undefined }),
      })
      const json = await res.json()
      if (json.error) { setError(json.error + (json.hint ? '\n' + json.hint : '')); return }
      setFlowId(json.flow_id); setStep('code')
    } catch (err) { setError(err instanceof Error ? err.message : 'Сеть недоступна') }
    finally { setLoading(false) }
  }

  async function verifyCode() {
    if (!flowId) return
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/social/telegram/manager/login-verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flowId, code: code.trim(), password: password || undefined }),
      })
      const json = await res.json()
      if (json.needs_password) { setNeedsPassword(true); setError('Введи пароль 2FA и нажми Подтвердить снова'); return }
      if (json.error) { setError(json.error); return }
      setSuccess('✅ Аккаунт подключён. Запущен первичный импорт за 30 дней — появятся в списке через 1-3 минуты.')
      setTimeout(onDone, 2500)
    } catch (err) { setError(err instanceof Error ? err.message : 'Сеть недоступна') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-900">Подключить аккаунт менеджера</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
        </div>
        <div className="p-6 space-y-4">
          {step === 'guide' && (
            <div className="space-y-3 text-sm text-gray-700">
              <p className="font-semibold text-gray-900">Зачем это</p>
              <p>Подключаем Telegram-аккаунт, с которого менеджер общается с клиентами. Все личные диалоги появятся здесь, ответы пишешь прямо с платформы — клиент видит их как обычные сообщения от менеджера (не от бота).</p>

              <p className="font-semibold text-gray-900 pt-2">Инструкция (5 минут)</p>
              <ol className="list-decimal pl-5 space-y-2">
                <li>
                  Зайди в Telegram на <a href="https://my.telegram.org" target="_blank" rel="noreferrer" className="text-[#6A55F8] underline">my.telegram.org</a> с номера аккаунта менеджера, создай приложение — получишь <code className="bg-gray-100 px-1 rounded">api_id</code> и <code className="bg-gray-100 px-1 rounded">api_hash</code>
                </li>
                <li>На следующем шаге введи эти данные + номер телефона менеджера</li>
                <li>Telegram пришлёт код в сам Telegram (чат «Сервисные сообщения»). Введи его</li>
                <li>Если включена 2FA — введёшь пароль</li>
              </ol>

              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
                ⚠️ Session даёт полный доступ к аккаунту (включая личные переписки). Мы шифруем её AES-256, но если есть риск утечки — создай отдельный Telegram-аккаунт для менеджера на рабочую симку.
              </div>

              <div className="flex justify-end pt-3">
                <button onClick={() => setStep('creds')} className="bg-[#6A55F8] text-white px-4 py-2 rounded-lg text-sm font-medium">Далее →</button>
              </div>
            </div>
          )}

          {step === 'creds' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Название (для себя, опционально)</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Хасан (продажи)"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">api_id</label>
                <input type="number" value={apiId} onChange={e => setApiId(e.target.value)} placeholder="1234567"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">api_hash</label>
                <input type="text" value={apiHash} onChange={e => setApiHash(e.target.value)} placeholder="abc123..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Номер телефона (международный)</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+79991234567"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono" />
              </div>
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded p-2 whitespace-pre-line">{error}</div>}
              <div className="flex justify-between pt-3">
                <button onClick={() => setStep('guide')} className="text-sm text-gray-500">← Назад</button>
                <button onClick={sendCode} disabled={loading || !apiId || !apiHash || !phone}
                  className="bg-[#6A55F8] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                  {loading ? 'Отправляю код…' : 'Получить код'}
                </button>
              </div>
            </div>
          )}

          {step === 'code' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">Telegram прислал код в приложение (чат «Сервисные сообщения» / Telegram)</p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Код</label>
                <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="12345"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono tracking-widest text-center" autoFocus />
              </div>
              {needsPassword && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Пароль 2FA</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                </div>
              )}
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded p-2 whitespace-pre-line">{error}</div>}
              {success && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded p-3">{success}</div>}
              <div className="flex justify-between pt-3">
                <button onClick={() => setStep('creds')} className="text-sm text-gray-500">← Назад</button>
                <button onClick={verifyCode} disabled={loading || !code || Boolean(success)}
                  className="bg-[#6A55F8] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                  {loading ? 'Проверяю…' : 'Подтвердить'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
