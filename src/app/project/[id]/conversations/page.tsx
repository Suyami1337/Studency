'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

type ManagerAccount = {
  id: string
  title: string | null
  telegram_user_id: number | null
  telegram_username: string | null
  telegram_first_name: string | null
  status: 'active' | 'error' | 'disabled'
  last_error: string | null
  initial_import_done: boolean
  last_sync_at: string | null
  description?: string | null
}

export default function ConversationsIndexPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const supabase = createClient()

  const [accounts, setAccounts] = useState<ManagerAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('manager_accounts')
      .select('*')
      .eq('project_id', projectId)
      .neq('status', 'disabled')
      .order('connected_at', { ascending: false })
    const list = (data ?? []) as ManagerAccount[]
    setAccounts(list)
    setLoading(false)

    // Persist last selected account. Если он один — сразу редирект
    if (typeof window !== 'undefined') {
      const last = localStorage.getItem(`conversations_last_${projectId}`)
      const found = last && list.some(a => a.id === last)
      if (found) {
        router.replace(`/project/${projectId}/conversations/${last}`)
        return
      }
      if (list.length === 1) {
        router.replace(`/project/${projectId}/conversations/${list[0].id}`)
        return
      }
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId])

  if (loading) return <div className="text-center py-10 text-sm text-gray-400">Загрузка…</div>

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
        {addOpen && <AddManagerModal projectId={projectId} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); load() }} />}
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Переписки</h1>
          <p className="text-sm text-gray-500 mt-1">Выбери аккаунт менеджера, в котором хочешь работать</p>
        </div>
        <button onClick={() => setAddOpen(true)}
          className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium">
          + Добавить аккаунт
        </button>
      </div>

      <div className="space-y-3">
        {accounts.map(acc => (
          <Link key={acc.id} href={`/project/${projectId}/conversations/${acc.id}`}
            onClick={() => { if (typeof window !== 'undefined') localStorage.setItem(`conversations_last_${projectId}`, acc.id) }}
            className="bg-white rounded-xl border border-gray-100 hover:border-[#6A55F8]/40 hover:shadow-sm transition-all p-4 flex items-center gap-4 block">
            <div className="w-12 h-12 rounded-full bg-[#F0EDFF] flex items-center justify-center text-xl flex-shrink-0">💬</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-gray-900 truncate">
                  {acc.title ?? acc.telegram_first_name ?? acc.telegram_username ?? 'Без названия'}
                </p>
                {acc.telegram_username && (
                  <span className="text-xs text-gray-400">@{acc.telegram_username.replace(/^@/, '')}</span>
                )}
                {acc.status === 'error' && (
                  <span className="text-[10px] uppercase bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded font-semibold" title={acc.last_error ?? ''}>Ошибка</span>
                )}
                {!acc.initial_import_done && acc.status === 'active' && (
                  <span className="text-[10px] uppercase bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-semibold">Импорт</span>
                )}
              </div>
              {acc.description && <p className="text-xs text-gray-500 truncate mt-0.5">{acc.description}</p>}
              <p className="text-[11px] text-gray-400 mt-1">
                {acc.last_sync_at ? `Обновлено ${new Date(acc.last_sync_at).toLocaleString('ru-RU')}` : 'Ещё не синхронизировано'}
              </p>
            </div>
            <span className="text-gray-300 text-lg">→</span>
          </Link>
        ))}
      </div>

      {addOpen && <AddManagerModal projectId={projectId} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); load() }} />}
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
      setSuccess('✅ Аккаунт подключён. Идёт импорт за 30 дней (1-3 минуты).')
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
                  Зайди на <a href="https://my.telegram.org" target="_blank" rel="noreferrer" className="text-[#6A55F8] underline">my.telegram.org</a> с номера аккаунта менеджера, создай приложение — получишь <code className="bg-gray-100 px-1 rounded">api_id</code> и <code className="bg-gray-100 px-1 rounded">api_hash</code>
                </li>
                <li>На следующем шаге введи эти данные + номер телефона менеджера</li>
                <li>Telegram пришлёт код в сам Telegram (чат «Сервисные сообщения»)</li>
                <li>Если включена 2FA — введёшь пароль</li>
              </ol>

              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
                ⚠️ Session даёт полный доступ к аккаунту (включая личные переписки). Мы шифруем AES-256, но если риск утечки — создай отдельный аккаунт на рабочую симку.
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
              <p className="text-sm text-gray-700">Код пришёл в Telegram (чат «Сервисные сообщения»)</p>
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
