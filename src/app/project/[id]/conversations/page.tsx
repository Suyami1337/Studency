'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

type ManagerAccount = {
  id: string
  title: string | null
  telegram_user_id: number | null
  telegram_username: string | null
  telegram_first_name: string | null
  status: 'active' | 'error' | 'disabled' | 'pending_import'
  last_error: string | null
  initial_import_done: boolean
  last_sync_at: string | null
  description?: string | null
}

export default function ConversationsIndexPage() {
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()

  const [accounts, setAccounts] = useState<ManagerAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [setupAccountId, setSetupAccountId] = useState<string | null>(null)

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
        {accounts.map(acc => {
          const isPending = acc.status === 'pending_import'
          const header = (
            <>
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
                  {isPending && (
                    <span className="text-[10px] uppercase bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-semibold">Настройка не завершена</span>
                  )}
                  {!isPending && !acc.initial_import_done && acc.status === 'active' && (
                    <span className="text-[10px] uppercase bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-semibold">Импорт</span>
                  )}
                </div>
                {acc.description && <p className="text-xs text-gray-500 truncate mt-0.5">{acc.description}</p>}
                <p className="text-[11px] text-gray-400 mt-1">
                  {isPending
                    ? 'Выбери режим работы чтобы начать'
                    : (acc.last_sync_at ? `Обновлено ${new Date(acc.last_sync_at).toLocaleString('ru-RU')}` : 'Ещё не синхронизировано')
                  }
                </p>
              </div>
            </>
          )

          if (isPending) {
            return (
              <button key={acc.id} onClick={() => setSetupAccountId(acc.id)}
                className="w-full bg-white rounded-xl border border-amber-200 hover:border-amber-300 hover:shadow-sm transition-all p-4 flex items-center gap-4 text-left">
                {header}
                <span className="text-amber-600 text-sm font-medium whitespace-nowrap">Завершить настройку →</span>
              </button>
            )
          }

          return (
            <Link key={acc.id} href={`/project/${projectId}/conversations/${acc.id}`}
              onClick={() => { if (typeof window !== 'undefined') localStorage.setItem(`conversations_last_${projectId}`, acc.id) }}
              className="bg-white rounded-xl border border-gray-100 hover:border-[#6A55F8]/40 hover:shadow-sm transition-all p-4 flex items-center gap-4 block">
              {header}
              <span className="text-gray-300 text-lg">→</span>
            </Link>
          )
        })}
      </div>

      {addOpen && <AddManagerModal projectId={projectId} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); load() }} />}
      {setupAccountId && (
        <ImportChoiceModal
          accountId={setupAccountId}
          onClose={() => setSetupAccountId(null)}
          onDone={() => { setSetupAccountId(null); load() }}
        />
      )}
    </div>
  )
}

function AddManagerModal({ projectId, onClose, onDone }: {
  projectId: string
  onClose: () => void
  onDone: () => void
}) {
  const [step, setStep] = useState<'guide' | 'creds' | 'code' | 'choice'>('guide')
  const [apiId, setApiId] = useState('')
  const [apiHash, setApiHash] = useState('')
  const [phone, setPhone] = useState('')
  const [title, setTitle] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [flowId, setFlowId] = useState<string | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      setAccountId(json.account_id)
      setStep('choice')
    } catch (err) { setError(err instanceof Error ? err.message : 'Сеть недоступна') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={step === 'choice' ? undefined : onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-900">
            {step === 'choice' ? 'Как загрузить переписки?' : 'Подключить аккаунт менеджера'}
          </h2>
          {step !== 'choice' && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
          )}
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
              <div className="flex justify-between pt-3">
                <button onClick={() => setStep('creds')} className="text-sm text-gray-500">← Назад</button>
                <button onClick={verifyCode} disabled={loading || !code}
                  className="bg-[#6A55F8] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                  {loading ? 'Проверяю…' : 'Подтвердить'}
                </button>
              </div>
            </div>
          )}

          {step === 'choice' && accountId && (
            <ImportChoicePanel accountId={accountId} onDone={onDone} />
          )}
        </div>
      </div>
    </div>
  )
}

function ImportChoiceModal({ accountId, onClose, onDone }: {
  accountId: string
  onClose: () => void
  onDone: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-900">Как загрузить переписки?</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
        </div>
        <div className="p-6">
          <ImportChoicePanel accountId={accountId} onDone={onDone} />
        </div>
      </div>
    </div>
  )
}

const PERIOD_OPTIONS: { label: string; days: number; hint?: string }[] = [
  { label: '7 дней', days: 7 },
  { label: '30 дней', days: 30, hint: 'Рекомендуется' },
  { label: '90 дней', days: 90 },
  { label: '1 год', days: 365 },
  { label: 'Всё время', days: 3650, hint: 'Может не всё успеть за один проход' },
]

function ImportChoicePanel({ accountId, onDone }: { accountId: string; onDone: () => void }) {
  const [mode, setMode] = useState<'pick' | 'period' | 'running' | 'done'>('pick')
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  async function startFresh() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/social/telegram/manager/start-fresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      })
      const json = await res.json()
      if (json.error) { setError(json.error); return }
      setResult('✅ Готово. Новые диалоги будут появляться здесь по мере того как клиенты будут писать.')
      setMode('done')
      setTimeout(onDone, 2000)
    } catch (err) { setError(err instanceof Error ? err.message : 'Сеть недоступна') }
    finally { setLoading(false) }
  }

  async function runImport() {
    setLoading(true); setError(null); setMode('running')
    try {
      const res = await fetch('/api/social/telegram/manager/import-history', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, days }),
      })
      const json = await res.json()
      if (json.error) { setError(json.error); setMode('period'); return }
      const fetched = json.fetched ?? 0
      const newConv = json.newConversations ?? 0
      setResult(`✅ Импорт завершён. Загружено ${fetched} сообщений из ${newConv} диалогов.`)
      setMode('done')
      setTimeout(onDone, 2500)
    } catch (err) { setError(err instanceof Error ? err.message : 'Сеть недоступна'); setMode('period') }
    finally { setLoading(false) }
  }

  if (mode === 'pick') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600 mb-4">
          Аккаунт подключён. Выбери как работать со старыми перепиской — это нельзя будет просто переключить потом, поэтому подумай.
        </p>

        <button
          onClick={startFresh}
          disabled={loading}
          className="w-full text-left border-2 border-gray-200 hover:border-[#6A55F8] rounded-xl p-5 transition-all disabled:opacity-50"
        >
          <div className="flex items-start gap-3">
            <div className="text-2xl">✨</div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 mb-1">Начать с чистого листа</p>
              <p className="text-sm text-gray-600">
                Старых переписок здесь не будет. В платформе появятся только те диалоги,
                в которых клиенты напишут с этого момента. Быстро, без риска что-то пропустить.
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Подходит если в Telegram много личных или старых диалогов, которые не нужны в CRM
              </p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setMode('period')}
          disabled={loading}
          className="w-full text-left border-2 border-gray-200 hover:border-[#6A55F8] rounded-xl p-5 transition-all disabled:opacity-50"
        >
          <div className="flex items-start gap-3">
            <div className="text-2xl">📥</div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 mb-1">Импортировать старые переписки</p>
              <p className="text-sm text-gray-600">
                Загрузить в платформу диалоги и сообщения за выбранный период.
                Потребуется от 1 до 5 минут в зависимости от объёма.
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Подходит если уже активно ведёшь продажи в этом аккаунте и хочешь видеть историю
              </p>
            </div>
          </div>
        </button>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded p-2">{error}</div>}
      </div>
    )
  }

  if (mode === 'period') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-700">За какой период импортировать переписки?</p>

        <div className="space-y-2">
          {PERIOD_OPTIONS.map(opt => (
            <button key={opt.days} onClick={() => setDays(opt.days)}
              className={`w-full text-left border rounded-lg px-4 py-3 transition-all ${
                days === opt.days ? 'border-[#6A55F8] bg-[#F7F5FF]' : 'border-gray-200 hover:border-gray-300'
              }`}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">{opt.label}</span>
                {opt.hint && (
                  <span className="text-[10px] uppercase bg-[#6A55F8]/10 text-[#6A55F8] px-2 py-0.5 rounded font-semibold">
                    {opt.hint}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
          ⚠️ Будут загружены только диалоги с активностью в выбранном периоде. Диалоги без сообщений или полностью старые — не подтянутся. Если за один проход не уложимся — оставшиеся подтянутся в фоне по мере того как клиенты будут писать.
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded p-2">{error}</div>}

        <div className="flex justify-between pt-2">
          <button onClick={() => setMode('pick')} disabled={loading} className="text-sm text-gray-500">← Назад</button>
          <button onClick={runImport} disabled={loading}
            className="bg-[#6A55F8] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            Запустить импорт
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'running') {
    return (
      <div className="py-8 text-center">
        <div className="inline-block w-8 h-8 border-2 border-[#6A55F8] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-gray-900 mb-1">Идёт импорт переписок…</p>
        <p className="text-xs text-gray-500">Это может занять 1-5 минут. Не закрывай окно.</p>
      </div>
    )
  }

  return (
    <div className="py-6 text-center">
      <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded p-4">
        {result}
      </div>
    </div>
  )
}
