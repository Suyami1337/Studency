'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
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
  mtproto_connected_at?: string | null
  mtproto_last_sync_at?: string | null
  mtproto_last_error?: string | null
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
        <TelegramPanel
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

function TelegramPanel({ projectId, accounts, loading, onReload }: {
  projectId: string
  accounts: SocialAccount[]
  loading: boolean
  onReload: () => void
}) {
  const [discovering, setDiscovering] = useState(false)
  const [discoverResult, setDiscoverResult] = useState<string | null>(null)

  async function discover() {
    setDiscovering(true)
    setDiscoverResult(null)
    try {
      const res = await fetch('/api/social/telegram/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      const json = await res.json()
      if (json.error) setDiscoverResult('Ошибка: ' + json.error)
      else setDiscoverResult(`Найдено каналов: ${json.found}, добавлено новых: ${json.added}`)
      onReload()
    } catch (err) {
      setDiscoverResult('Ошибка: ' + (err instanceof Error ? err.message : 'unknown'))
    } finally {
      setDiscovering(false)
    }
  }

  const [mtprotoOpen, setMtprotoOpen] = useState(false)

  return (
    <div className="space-y-6">
      {/* Подключение */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900 mb-1">Подключённые каналы</h2>
            <p className="text-sm text-gray-500">
              Автоматически подхватываем каналы где бот твоего проекта добавлен администратором.
              Жми «Найти каналы» после того как добавишь бота админом.
            </p>
          </div>
          <button
            onClick={discover}
            disabled={discovering}
            className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 whitespace-nowrap"
          >
            {discovering ? 'Ищу…' : '🔍 Найти каналы'}
          </button>
        </div>
        {discoverResult && (
          <div className="mt-3 text-xs text-gray-600 bg-gray-50 rounded-lg p-3">{discoverResult}</div>
        )}
      </div>

      {/* MTProto подключение (продвинутая статистика) */}
      <div className="bg-gradient-to-r from-[#F0EDFF] to-white border border-[#6A55F8]/20 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-semibold text-gray-900">Продвинутая статистика (MTProto)</h2>
              {accounts.some(a => a.mtproto_status === 'connected') && (
                <span className="text-[10px] uppercase font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">подключено</span>
              )}
            </div>
            <p className="text-sm text-gray-600">
              Подключи свой Telegram-аккаунт (опционально) чтобы видеть просмотры постов,
              форварды, работать с <b>приватными каналами</b>. Без этого — только Bot API (публичные каналы, без просмотров).
            </p>
          </div>
          <button
            onClick={() => setMtprotoOpen(true)}
            className="border border-[#6A55F8] text-[#6A55F8] hover:bg-[#F0EDFF] px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
          >
            {accounts.some(a => a.mtproto_status === 'connected') ? '⚙️ Управлять' : '🔒 Подключить'}
          </button>
        </div>
      </div>


      {loading ? (
        <div className="text-center py-8 text-sm text-gray-400">Загрузка…</div>
      ) : accounts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-3">📡</div>
          <h3 className="font-medium text-gray-800 mb-1">Каналы ещё не подключены</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Добавь бота проекта администратором в свой Telegram-канал
            (права «Приглашать участников» обязательно), потом жми «Найти каналы».
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map(acc => (
            <TelegramChannelCard key={acc.id} account={acc} onReload={onReload} />
          ))}
        </div>
      )}

      {mtprotoOpen && (
        <MTProtoModal
          projectId={projectId}
          onClose={() => setMtprotoOpen(false)}
          onDone={() => { setMtprotoOpen(false); onReload() }}
          hasConnected={accounts.some(a => a.mtproto_status === 'connected')}
        />
      )}
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
          <h2 className="font-semibold text-gray-900">Подключить продвинутую статистику (MTProto)</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
        </div>

        <div className="p-6 space-y-4">
          {hasConnected && step === 'guide' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-900">
              ✅ У тебя уже подключён MTProto. Чтобы отвязать — сделай это в карточке нужного канала (кнопка «Отключить MTProto»).
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
                  <b>Создай отдельный Telegram-аккаунт</b> на виртуальный номер — чтобы session не давала доступ к твоему основному аккаунту.
                  <div className="text-xs text-gray-500 mt-1">
                    Сервисы виртуальных номеров: <a href="https://onlinesim.ru" target="_blank" rel="noreferrer" className="text-[#6A55F8] underline">onlinesim.ru</a>,{' '}
                    <a href="https://sms-activate.org" target="_blank" rel="noreferrer" className="text-[#6A55F8] underline">sms-activate.org</a>{' '}
                    (~50₽/мес за номер).
                  </div>
                  <div className="text-xs text-amber-700 mt-1">
                    ⚠️ Можно использовать основной аккаунт, но тогда утечка session даст полный доступ ко всем твоим чатам. Делай на свой риск.
                  </div>
                </li>
                <li>Добавь этот аккаунт администратором в свой Telegram-канал</li>
                <li>
                  Зайди с этого аккаунта на <a href="https://my.telegram.org" target="_blank" rel="noreferrer" className="text-[#6A55F8] underline">my.telegram.org</a>,
                  создай приложение — получишь <code className="bg-gray-100 px-1 rounded">api_id</code> и <code className="bg-gray-100 px-1 rounded">api_hash</code>
                </li>
                <li>Введи их на следующем шаге + номер телефона этого аккаунта</li>
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
              <p className="text-sm text-gray-700">Telegram прислал код в твой аккаунт (в приложении Telegram, в чате с сервисными сообщениями)</p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Код</label>
                <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="12345"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono tracking-widest text-center" autoFocus />
              </div>
              {needsPassword && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Пароль 2FA (двухэтапная проверка)</label>
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

type SubsLogRow = {
  id: string
  external_user_id: string
  username: string | null
  first_name: string | null
  action: 'join' | 'leave'
  invite_link_name: string | null
  customer_id: string | null
  at: string
}

type SnapshotRow = { subscribers_count: number; at: string }

type ContentItem = {
  id: string
  external_id: string
  title: string | null
  body: string | null
  url: string | null
  published_at: string | null
  metrics: { views?: number; reactions?: number; forwards?: number; replies?: number; media_type?: string }
}

type DateFilter = 'all' | '7d' | '30d' | '90d'

function filterByDate<T extends { at?: string | null; published_at?: string | null }>(rows: T[], filter: DateFilter, key: 'at' | 'published_at' = 'at'): T[] {
  if (filter === 'all') return rows
  const days = filter === '7d' ? 7 : filter === '30d' ? 30 : 90
  const threshold = Date.now() - days * 86_400_000
  return rows.filter(r => {
    const d = r[key]
    if (!d) return false
    return new Date(d as string).getTime() >= threshold
  })
}

function TelegramChannelCard({ account, onReload }: { account: SocialAccount; onReload: () => void }) {
  const supabase = createClient()
  const meta = account.metadata as { subscribers_count?: number; description?: string }
  const [expanded, setExpanded] = useState(false)
  const [subsLog, setSubsLog] = useState<SubsLogRow[]>([])
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([])
  const [posts, setPosts] = useState<ContentItem[]>([])
  const [tab, setTab] = useState<'overview' | 'subscribers' | 'posts'>('overview')
  const [loadingData, setLoadingData] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [dateFilter, setDateFilter] = useState<DateFilter>('30d')
  const [disconnectingMtproto, setDisconnectingMtproto] = useState(false)

  async function loadData() {
    setLoadingData(true)
    const [sl, snap, ps] = await Promise.all([
      supabase.from('social_subscribers_log').select('*').eq('account_id', account.id).order('at', { ascending: false }).limit(500),
      supabase.from('social_subscribers_snapshots').select('subscribers_count, at').eq('account_id', account.id).order('at', { ascending: true }).limit(500),
      supabase.from('social_content_items').select('id, external_id, title, body, url, published_at, metrics').eq('account_id', account.id).order('published_at', { ascending: false }).limit(100),
    ])
    setSubsLog((sl.data ?? []) as SubsLogRow[])
    setSnapshots((snap.data ?? []) as SnapshotRow[])
    setPosts((ps.data ?? []) as ContentItem[])
    setLoadingData(false)
  }

  async function syncNow() {
    setSyncing(true)
    // Если подключён MTProto — используем его для одного канала (быстрее чем общий cron)
    if (account.mtproto_status === 'connected') {
      await fetch('/api/social/telegram/mtproto/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: account.id }),
      }).catch(() => null)
    } else {
      await fetch('/api/cron/social-sync').catch(() => null)
    }
    await loadData()
    onReload()
    setSyncing(false)
  }

  async function disconnectMtproto() {
    if (!confirm('Отключить MTProto для этого канала? Session будет отозвана в Telegram, данные расшифрованные удалятся из нашей БД.')) return
    setDisconnectingMtproto(true)
    try {
      await fetch('/api/social/telegram/mtproto/logout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: account.id }),
      })
      onReload()
    } finally { setDisconnectingMtproto(false) }
  }

  function exportSubsCSV() {
    const filtered = filterByDate(subsLog, dateFilter, 'at')
    const header = 'Дата,Действие,Telegram ID,Username,Имя,Invite link\n'
    const rows = filtered.map(r => [
      new Date(r.at).toISOString(),
      r.action,
      r.external_user_id,
      r.username ?? '',
      (r.first_name ?? '').replace(/,/g, ' '),
      r.invite_link_name ?? '',
    ].join(',')).join('\n')
    const csv = header + rows
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `subscribers-${account.external_username?.replace(/[^a-z0-9]/gi, '') ?? 'channel'}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    if (expanded) loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])

  const filteredLog = filterByDate(subsLog, dateFilter, 'at')
  const filteredSnapshots = filterByDate(snapshots, dateFilter, 'at')
  const filteredPosts = filterByDate(posts, dateFilter, 'published_at')
  const joinsLastDay = subsLog.filter(r => r.action === 'join' && Date.now() - new Date(r.at).getTime() < 86_400_000).length
  const leavesLastDay = subsLog.filter(r => r.action === 'leave' && Date.now() - new Date(r.at).getTime() < 86_400_000).length
  const joinsPeriod = filteredLog.filter(r => r.action === 'join').length
  const leavesPeriod = filteredLog.filter(r => r.action === 'leave').length
  const topPosts = [...filteredPosts].sort((a, b) => (b.metrics.views ?? 0) - (a.metrics.views ?? 0)).slice(0, 5)
  const worstPosts = [...filteredPosts].filter(p => (p.metrics.views ?? 0) > 0).sort((a, b) => (a.metrics.views ?? 0) - (b.metrics.views ?? 0)).slice(0, 5)
  const totalViews = filteredPosts.reduce((s, p) => s + (p.metrics.views ?? 0), 0)
  const totalReactions = filteredPosts.reduce((s, p) => s + (p.metrics.reactions ?? 0), 0)
  const engagementRate = totalViews > 0 ? (totalReactions / totalViews) * 100 : 0

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="p-5 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#F0EDFF] flex items-center justify-center text-xl flex-shrink-0">
            {account.external_avatar_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={account.external_avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
              : '💬'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-gray-900">{account.external_title ?? account.external_username ?? 'Без названия'}</p>
              {account.external_username && (
                <span className="text-xs text-gray-400">{account.external_username}</span>
              )}
              {!account.external_username && (
                <span className="text-[10px] uppercase bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded font-semibold">приватный</span>
              )}
              {account.mtproto_status === 'connected' && (
                <span className="text-[10px] uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-semibold">MTProto</span>
              )}
              {account.mtproto_status === 'error' && (
                <span className="text-[10px] uppercase bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded font-semibold" title={account.mtproto_last_error ?? ''}>MTProto error</span>
              )}
            </div>
            {meta.description && <p className="text-xs text-gray-500 truncate">{meta.description}</p>}
            <p className="text-[11px] text-gray-400 mt-1">
              {account.last_sync_at ? `Обновлено ${new Date(account.last_sync_at).toLocaleString('ru-RU')}` : 'Ещё не синхронизировано'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">{(meta.subscribers_count ?? 0).toLocaleString('ru-RU')}</p>
            <p className="text-xs text-gray-400">подписчиков</p>
          </div>
          <span className="text-gray-400 text-sm">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100">
          <div className="flex items-center justify-between px-5 py-2 border-b border-gray-100 gap-3 flex-wrap">
            <div className="flex gap-1">
              {([
                { k: 'overview', l: 'Обзор' },
                { k: 'subscribers', l: 'Подписчики' },
                { k: 'posts', l: 'Посты' },
              ] as const).map(t => (
                <button key={t.k} onClick={() => setTab(t.k)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md ${tab === t.k ? 'bg-[#F0EDFF] text-[#6A55F8]' : 'text-gray-500 hover:text-gray-700'}`}>
                  {t.l}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <select value={dateFilter} onChange={e => setDateFilter(e.target.value as DateFilter)}
                className="text-xs border border-gray-200 rounded px-2 py-1">
                <option value="7d">За 7 дней</option>
                <option value="30d">За 30 дней</option>
                <option value="90d">За 90 дней</option>
                <option value="all">Всё время</option>
              </select>
              <button onClick={syncNow} disabled={syncing} className="text-xs text-[#6A55F8] hover:underline disabled:opacity-50">
                {syncing ? 'Обновляю…' : '↻ Синхронизировать'}
              </button>
              {account.mtproto_status === 'connected' && (
                <button onClick={disconnectMtproto} disabled={disconnectingMtproto} className="text-xs text-red-500 hover:underline disabled:opacity-50">
                  {disconnectingMtproto ? 'Отключаю…' : 'Отключить MTProto'}
                </button>
              )}
            </div>
          </div>

          <div className="p-5">
            {loadingData ? (
              <div className="text-center py-6 text-sm text-gray-400">Загрузка…</div>
            ) : tab === 'overview' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatBox label="Подписалось за 24ч" value={joinsLastDay} color="text-emerald-600" />
                  <StatBox label="Отписалось за 24ч" value={leavesLastDay} color="text-rose-600" />
                  <StatBox label="Подписок за период" value={joinsPeriod} color="text-emerald-600" />
                  <StatBox label="Отписок за период" value={leavesPeriod} color="text-rose-600" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <StatBox label="Постов в периоде" value={filteredPosts.length} color="text-[#6A55F8]" />
                  <StatBox label="Сумма просмотров" value={totalViews} color="text-gray-800" />
                  <StatBox label="Вовлечённость (реакции/просмотры)" value={Number(engagementRate.toFixed(2))} color="text-amber-600" suffix="%" />
                </div>
                <SubscribersChart snapshots={filteredSnapshots} />
              </div>
            ) : tab === 'subscribers' ? (
              <div>
                <div className="flex justify-end mb-2">
                  <button onClick={exportSubsCSV} className="text-xs text-[#6A55F8] hover:underline">⬇ Экспорт CSV</button>
                </div>
                <SubscribersList log={filteredLog} />
              </div>
            ) : (
              <PostsList topPosts={topPosts} worstPosts={worstPosts} all={filteredPosts} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatBox({ label, value, color, suffix }: { label: string; value: number; color: string; suffix?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value.toLocaleString('ru-RU')}{suffix ?? ''}</p>
    </div>
  )
}

function SubscribersChart({ snapshots }: { snapshots: SnapshotRow[] }) {
  if (snapshots.length < 2) {
    return <div className="text-xs text-gray-400 text-center py-6">Ещё мало данных для графика. Подожди пока накопится история.</div>
  }
  const max = Math.max(...snapshots.map(s => s.subscribers_count))
  const min = Math.min(...snapshots.map(s => s.subscribers_count))
  const range = max - min || 1
  const width = 600
  const height = 160
  const padLeft = 40
  const padRight = 10
  const padTop = 10
  const padBottom = 28
  const plotW = width - padLeft - padRight
  const plotH = height - padTop - padBottom
  const stepX = plotW / (snapshots.length - 1)
  const points = snapshots.map((s, i) => {
    const x = padLeft + i * stepX
    const y = padTop + plotH - ((s.subscribers_count - min) / range) * plotH
    return `${x},${y}`
  }).join(' ')

  // X-axis labels — первая, середина, последняя
  const firstDate = new Date(snapshots[0].at)
  const lastDate = new Date(snapshots[snapshots.length - 1].at)
  const midDate = new Date(snapshots[Math.floor(snapshots.length / 2)].at)
  const fmtDate = (d: Date) => d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })

  // Y-axis — min и max
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <p className="text-xs text-gray-500 mb-2">Динамика подписчиков</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none">
        {/* grid */}
        <line x1={padLeft} y1={padTop} x2={padLeft} y2={padTop + plotH} stroke="#e5e7eb" strokeWidth="1" />
        <line x1={padLeft} y1={padTop + plotH} x2={width - padRight} y2={padTop + plotH} stroke="#e5e7eb" strokeWidth="1" />
        {/* Y labels */}
        <text x={padLeft - 6} y={padTop + 4} textAnchor="end" fill="#9ca3af" fontSize="10">{max}</text>
        <text x={padLeft - 6} y={padTop + plotH + 4} textAnchor="end" fill="#9ca3af" fontSize="10">{min}</text>
        {/* line */}
        <polyline fill="none" stroke="#6A55F8" strokeWidth="2" points={points} />
        {/* X labels */}
        <text x={padLeft} y={height - 8} fill="#9ca3af" fontSize="10">{fmtDate(firstDate)}</text>
        <text x={padLeft + plotW / 2} y={height - 8} textAnchor="middle" fill="#9ca3af" fontSize="10">{fmtDate(midDate)}</text>
        <text x={width - padRight} y={height - 8} textAnchor="end" fill="#9ca3af" fontSize="10">{fmtDate(lastDate)}</text>
      </svg>
    </div>
  )
}

function SubscribersList({ log }: { log: SubsLogRow[] }) {
  if (log.length === 0) {
    return <div className="text-xs text-gray-400 text-center py-6">Событий ещё нет. Они появятся по мере подписок/отписок.</div>
  }
  return (
    <div className="space-y-1">
      {log.map(row => (
        <div key={row.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-xs w-5 text-center ${row.action === 'join' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {row.action === 'join' ? '+' : '−'}
            </span>
            <span className="text-sm text-gray-800 truncate">
              {row.first_name ?? '—'}{row.username ? ` · @${row.username.replace(/^@/, '')}` : ''}
            </span>
            {row.invite_link_name && (
              <span className="text-[10px] bg-[#F0EDFF] text-[#6A55F8] px-1.5 py-0.5 rounded font-mono truncate max-w-[150px]">
                {row.invite_link_name}
              </span>
            )}
          </div>
          <span className="text-xs text-gray-400 whitespace-nowrap">{new Date(row.at).toLocaleString('ru-RU')}</span>
        </div>
      ))}
    </div>
  )
}

function PostsList({ topPosts, worstPosts, all }: { topPosts: ContentItem[]; worstPosts: ContentItem[]; all: ContentItem[] }) {
  if (all.length === 0) {
    return <div className="text-xs text-gray-400 text-center py-6">Посты ещё не подтянулись. Парсинг работает только для публичных каналов и обновляется раз в час.</div>
  }
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase text-gray-500 mb-2">ТОП-5 по просмотрам</p>
        <div className="space-y-1">{topPosts.map(p => <PostRow key={p.id} p={p} />)}</div>
      </div>
      {worstPosts.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase text-gray-500 mb-2">Слабые посты (меньше всего просмотров)</p>
          <div className="space-y-1">{worstPosts.map(p => <PostRow key={p.id} p={p} />)}</div>
        </div>
      )}
      <div>
        <p className="text-xs font-semibold uppercase text-gray-500 mb-2">Все посты ({all.length})</p>
        <div className="space-y-1">{all.map(p => <PostRow key={p.id} p={p} />)}</div>
      </div>
    </div>
  )
}

function PostRow({ p }: { p: ContentItem }) {
  return (
    <a href={p.url ?? '#'} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 rounded px-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 truncate">{p.title || '(пустой пост / медиа)'}</p>
        <p className="text-[11px] text-gray-400">{p.published_at ? new Date(p.published_at).toLocaleString('ru-RU') : ''}</p>
      </div>
      <div className="flex gap-3 flex-shrink-0 text-xs text-gray-600">
        <span>👁 {(p.metrics.views ?? 0).toLocaleString('ru-RU')}</span>
        {(p.metrics.reactions ?? 0) > 0 && <span>👍 {p.metrics.reactions}</span>}
      </div>
    </a>
  )
}
