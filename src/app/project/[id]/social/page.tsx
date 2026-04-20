'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

type Platform = 'telegram' | 'instagram' | 'youtube'

type SocialAccount = {
  id: string
  platform: Platform
  external_id: string
  external_username: string | null
  external_title: string | null
  external_avatar_url: string | null
  connected_at: string
  last_sync_at: string | null
  is_active: boolean
  metadata: Record<string, unknown>
  mtproto_status?: 'connected' | 'error' | null
}

const PLATFORMS: { key: Platform; label: string; icon: string; status: 'active' | 'soon' }[] = [
  { key: 'telegram',  label: 'Telegram',  icon: '💬', status: 'active' },
  { key: 'instagram', label: 'Instagram', icon: '📸', status: 'soon' },
  { key: 'youtube',   label: 'YouTube',   icon: '▶️', status: 'soon' },
]

export default function SocialPage() {
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [activePlatform, setActivePlatform] = useState<Platform>('telegram')

  async function loadAccounts() {
    setLoading(true)
    const { data } = await supabase
      .from('social_accounts')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_active', true)
      .order('connected_at', { ascending: false })
    setAccounts((data ?? []) as SocialAccount[])
    setLoading(false)
  }

  useEffect(() => { loadAccounts() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId])

  const platformAccounts = accounts.filter(a => a.platform === activePlatform)

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Соцсети</h1>
        <p className="text-sm text-gray-500 mt-1">Аналитика контента и подписчиков по всем площадкам в одном месте</p>
      </div>

      {/* Platform tabs */}
      <div className="flex gap-1 border-b border-gray-100 mb-6">
        {PLATFORMS.map(p => {
          const isActive = activePlatform === p.key
          const isDisabled = p.status === 'soon'
          return (
            <button
              key={p.key}
              onClick={() => !isDisabled && setActivePlatform(p.key)}
              disabled={isDisabled}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
                isActive ? 'border-[#6A55F8] text-[#6A55F8]' :
                isDisabled ? 'border-transparent text-gray-300 cursor-not-allowed' :
                'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <span>{p.icon}</span>
              <span>{p.label}</span>
              {p.status === 'soon' && <span className="text-[9px] uppercase tracking-wide text-gray-300 font-semibold">Скоро</span>}
            </button>
          )
        })}
      </div>

      {activePlatform === 'telegram' && (
        <TelegramOverview
          projectId={projectId}
          accounts={platformAccounts}
          loading={loading}
          onReload={loadAccounts}
        />
      )}

      {activePlatform === 'instagram' && <SoonPanel title="Instagram" />}
      {activePlatform === 'youtube' && <SoonPanel title="YouTube" />}
    </div>
  )
}

function SoonPanel({ title }: { title: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
      <div className="text-4xl mb-3">⏳</div>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">{title} — скоро</h2>
      <p className="text-sm text-gray-500">Сначала выстраиваем полноценную аналитику Telegram. После этого возьмёмся за {title}.</p>
    </div>
  )
}

function TelegramOverview({ projectId, accounts, loading, onReload }: {
  projectId: string
  accounts: SocialAccount[]
  loading: boolean
  onReload: () => void
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [mtprotoOpen, setMtprotoOpen] = useState(false)
  const hasMtproto = accounts.some(a => a.mtproto_status === 'connected')

  return (
    <div className="space-y-4">
      {/* Заголовок и добавить */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">Подключённые Telegram-каналы</h2>
          <p className="text-xs text-gray-500">Клик по карточке — детальная аналитика канала</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setMtprotoOpen(true)}
            className="border border-[#6A55F8] text-[#6A55F8] hover:bg-[#F0EDFF] px-3 py-2 rounded-lg text-sm font-medium"
          >
            {hasMtproto ? '⚙️ MTProto' : '🔒 MTProto'}
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            + Добавить канал
          </button>
        </div>
      </div>

      {/* Список каналов */}
      {loading ? (
        <div className="text-center py-10 text-sm text-gray-400">Загрузка…</div>
      ) : accounts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-3">📡</div>
          <h3 className="font-medium text-gray-800 mb-1">Каналы ещё не подключены</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-4">
            Добавь бота проекта админом в свой канал и нажми «Добавить канал» — мы автоматически подхватим все каналы.
          </p>
          <button onClick={() => setAddOpen(true)}
            className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-5 py-2.5 rounded-lg text-sm font-medium">
            + Добавить канал
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {accounts.map(acc => <ChannelPreview key={acc.id} projectId={projectId} account={acc} />)}
        </div>
      )}

      {addOpen && (
        <AddChannelModal projectId={projectId} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); onReload() }} />
      )}

      {mtprotoOpen && (
        <MTProtoModal projectId={projectId} onClose={() => setMtprotoOpen(false)}
          onDone={() => { setMtprotoOpen(false); onReload() }} hasConnected={hasMtproto} />
      )}
    </div>
  )
}

function ChannelPreview({ projectId, account }: { projectId: string; account: SocialAccount }) {
  const meta = account.metadata as { subscribers_count?: number; description?: string }
  return (
    <Link
      href={`/project/${projectId}/social/telegram/${account.id}`}
      className="bg-white rounded-xl border border-gray-100 hover:border-[#6A55F8]/40 hover:shadow-sm transition-all p-4 flex items-center gap-3"
    >
      <div className="w-12 h-12 rounded-full bg-[#F0EDFF] flex items-center justify-center text-xl flex-shrink-0">
        {account.external_avatar_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={account.external_avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
          : '💬'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-gray-900 truncate">{account.external_title ?? account.external_username ?? 'Без названия'}</p>
          {account.mtproto_status === 'connected' && (
            <span className="text-[10px] uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-semibold">MTProto</span>
          )}
          {account.mtproto_status === 'error' && (
            <span className="text-[10px] uppercase bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded font-semibold">error</span>
          )}
        </div>
        {account.external_username && <p className="text-xs text-gray-400">{account.external_username}</p>}
        <p className="text-xs text-gray-500 mt-1">{(meta.subscribers_count ?? 0).toLocaleString('ru-RU')} подписчиков</p>
      </div>
      <span className="text-gray-300 text-lg">→</span>
    </Link>
  )
}

function AddChannelModal({ projectId, onClose, onDone }: {
  projectId: string
  onClose: () => void
  onDone: () => void
}) {
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<{ found: number; added: number; hint?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runDiscover() {
    setSearching(true); setError(null); setResult(null)
    try {
      const res = await fetch('/api/social/telegram/discover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      const json = await res.json()
      if (json.error) setError(json.error)
      else setResult({ found: json.found ?? 0, added: json.added ?? 0, hint: json.hint })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Сеть недоступна')
    } finally { setSearching(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Добавить Telegram-канал</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
        </div>
        <div className="p-6 space-y-4 text-sm text-gray-700">
          <div className="bg-[#F0EDFF] border border-[#6A55F8]/20 rounded-lg p-4">
            <p className="font-semibold text-gray-900 mb-2">Как подключить (1 раз для каждого канала)</p>
            <ol className="list-decimal pl-5 space-y-1.5 text-gray-700">
              <li>Зайди в Telegram-канал, который хочешь подключить</li>
              <li>Открой <b>Настройки канала → Администраторы</b></li>
              <li>Добавь бота твоего проекта как администратора</li>
              <li>Включи ему права: <b>Приглашать участников</b> и <b>Управлять сообщениями</b></li>
              <li>Вернись сюда и нажми кнопку ниже</li>
            </ol>
            <p className="text-xs text-gray-500 mt-3">
              Платформа найдёт все каналы где бот проекта администратор и добавит их в список.
            </p>
          </div>

          {result && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-emerald-900">
              ✅ Найдено каналов: <b>{result.found}</b>, добавлено новых: <b>{result.added}</b>
              {result.hint && <p className="text-xs text-emerald-700 mt-1">{result.hint}</p>}
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-xs">{error}</div>
          )}

          <div className="flex justify-between pt-2">
            <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Закрыть</button>
            {result && result.added > 0 ? (
              <button onClick={onDone} className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-5 py-2.5 rounded-lg text-sm font-medium">
                Готово, посмотреть каналы
              </button>
            ) : (
              <button onClick={runDiscover} disabled={searching}
                className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                {searching ? 'Ищу…' : '🔍 Найти мои каналы'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MTProtoModal({ projectId, onClose, onDone, hasConnected }: {
  projectId: string
  onClose: () => void
  onDone: () => void
  hasConnected: boolean
}) {
  const [step, setStep] = useState<'guide' | 'creds' | 'code'>('guide')
  const [apiId, setApiId] = useState('')
  const [apiHash, setApiHash] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [flowId, setFlowId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  async function sendCode() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/social/telegram/mtproto/login-start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, apiId: Number(apiId), apiHash: apiHash.trim(), phone: phone.trim() }),
      })
      const json = await res.json()
      if (json.error) { setError(json.error + (json.hint ? '\n' + json.hint : '')); return }
      setFlowId(json.flow_id); setStep('code')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Сеть недоступна')
    } finally { setLoading(false) }
  }

  async function verifyCode() {
    if (!flowId) return
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/social/telegram/mtproto/login-verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flowId, code: code.trim(), password: password || undefined }),
      })
      const json = await res.json()
      if (json.needs_password) { setNeedsPassword(true); setError('Введи пароль 2FA и нажми Подтвердить снова'); return }
      if (json.error) { setError(json.error); return }
      setSuccessMsg(`✅ Подключено. Привязано каналов: ${json.linked_channels}. Можешь закрыть окно.`)
      setTimeout(onDone, 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Сеть недоступна')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-900">Продвинутая статистика (MTProto)</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
        </div>

        <div className="p-6 space-y-4">
          {hasConnected && step === 'guide' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-900">
              ✅ MTProto уже подключён. Отключить можно на странице конкретного канала.
            </div>
          )}

          {step === 'guide' && (
            <div className="space-y-3 text-sm text-gray-700">
              <p className="font-semibold text-gray-900">Что это даёт</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Точные просмотры каждого поста (Bot API их не показывает)</li>
                <li>Форварды, активность аудитории</li>
                <li>Работа с <b>приватными</b> каналами</li>
              </ul>

              <p className="font-semibold text-gray-900 pt-2">Инструкция (5 минут)</p>
              <ol className="list-decimal pl-5 space-y-2">
                <li>
                  <b>Создай отдельный Telegram-аккаунт</b> на виртуальный номер — чтобы session не давала доступ к основному аккаунту.
                  <div className="text-xs text-gray-500 mt-1">
                    Сервисы виртуальных номеров: <a href="https://onlinesim.ru" target="_blank" rel="noreferrer" className="text-[#6A55F8] underline">onlinesim.ru</a>,{' '}
                    <a href="https://sms-activate.org" target="_blank" rel="noreferrer" className="text-[#6A55F8] underline">sms-activate.org</a>{' '}
                    (~50₽/мес за номер).
                  </div>
                  <div className="text-xs text-amber-700 mt-1">
                    ⚠️ Можно основной аккаунт — но утечка session даст доступ ко всем чатам. На свой риск.
                  </div>
                </li>
                <li>Добавь этот аккаунт администратором в свой Telegram-канал</li>
                <li>
                  Зайди с этого аккаунта на <a href="https://my.telegram.org" target="_blank" rel="noreferrer" className="text-[#6A55F8] underline">my.telegram.org</a>,
                  создай приложение — получишь <code className="bg-gray-100 px-1 rounded">api_id</code> и <code className="bg-gray-100 px-1 rounded">api_hash</code>
                </li>
                <li>Введи их ниже + номер телефона этого аккаунта</li>
              </ol>

              <div className="flex justify-end pt-3">
                <button onClick={() => setStep('creds')} className="bg-[#6A55F8] text-white px-4 py-2 rounded-lg text-sm font-medium">Далее →</button>
              </div>
            </div>
          )}

          {step === 'creds' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">Введи данные с my.telegram.org</p>
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
                <label className="block text-xs font-medium text-gray-600 mb-1">Номер телефона (международный формат)</label>
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
              <p className="text-sm text-gray-700">Telegram прислал код в приложение (чат с сервисными сообщениями)</p>
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
              {successMsg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded p-3">{successMsg}</div>}
              <div className="flex justify-between pt-3">
                <button onClick={() => setStep('creds')} className="text-sm text-gray-500">← Назад</button>
                <button onClick={verifyCode} disabled={loading || !code || Boolean(successMsg)}
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
