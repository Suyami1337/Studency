'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

type SocialAccount = {
  id: string
  platform: string
  external_id: string
  external_username: string | null
  external_title: string | null
  external_avatar_url: string | null
  connected_at: string
  last_sync_at: string | null
  is_active: boolean
  metadata: Record<string, unknown>
  mtproto_status?: 'connected' | 'error' | null
  mtproto_last_error?: string | null
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

export default function TelegramChannelPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const accountId = params.accountId as string
  const supabase = createClient()

  const [account, setAccount] = useState<SocialAccount | null>(null)
  const [subsLog, setSubsLog] = useState<SubsLogRow[]>([])
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([])
  const [posts, setPosts] = useState<ContentItem[]>([])
  const [tab, setTab] = useState<'overview' | 'subscribers' | 'posts' | 'settings'>('overview')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [dateFilter, setDateFilter] = useState<DateFilter>('30d')
  const [disconnectingMtproto, setDisconnectingMtproto] = useState(false)
  const [removing, setRemoving] = useState(false)

  async function load() {
    setLoading(true)
    const [accRes, sl, snap, ps] = await Promise.all([
      supabase.from('social_accounts').select('*').eq('id', accountId).maybeSingle(),
      supabase.from('social_subscribers_log').select('*').eq('account_id', accountId).order('at', { ascending: false }).limit(500),
      supabase.from('social_subscribers_snapshots').select('subscribers_count, at').eq('account_id', accountId).order('at', { ascending: true }).limit(500),
      supabase.from('social_content_items').select('id, external_id, title, body, url, published_at, metrics').eq('account_id', accountId).order('published_at', { ascending: false }).limit(200),
    ])
    setAccount(accRes.data as SocialAccount | null)
    setSubsLog((sl.data ?? []) as SubsLogRow[])
    setSnapshots((snap.data ?? []) as SnapshotRow[])
    setPosts((ps.data ?? []) as ContentItem[])
    setLoading(false)
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [accountId])

  async function syncNow() {
    if (!account) return
    setSyncing(true)
    if (account.mtproto_status === 'connected') {
      await fetch('/api/social/telegram/mtproto/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      }).catch(() => null)
    } else {
      await fetch('/api/cron/social-sync').catch(() => null)
    }
    await load()
    setSyncing(false)
  }

  async function disconnectMtproto() {
    if (!confirm('Отключить MTProto для этого канала? Session будет отозвана в Telegram, данные удалятся из БД.')) return
    setDisconnectingMtproto(true)
    try {
      await fetch('/api/social/telegram/mtproto/logout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      })
      await load()
    } finally { setDisconnectingMtproto(false) }
  }

  async function removeChannel() {
    if (!confirm('Удалить канал из платформы? История событий подписчиков сохранится в БД, но канал пропадёт из списка. Удалить?')) return
    setRemoving(true)
    try {
      await supabase.from('social_accounts').update({ is_active: false }).eq('id', accountId)
      router.push(`/project/${projectId}/social`)
    } finally { setRemoving(false) }
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
    a.download = `subscribers-${account?.external_username?.replace(/[^a-z0-9]/gi, '') ?? 'channel'}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="max-w-6xl py-10 text-center text-sm text-gray-400">Загрузка…</div>

  if (!account) return (
    <div className="max-w-6xl">
      <Link href={`/project/${projectId}/social`} className="text-sm text-[#6A55F8] hover:underline">← Назад</Link>
      <div className="bg-white rounded-xl border border-gray-100 p-12 text-center mt-4">
        <p className="text-gray-500">Канал не найден</p>
      </div>
    </div>
  )

  const meta = account.metadata as { subscribers_count?: number; description?: string }
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
    <div className="max-w-6xl space-y-5">
      {/* Назад */}
      <Link href={`/project/${projectId}/social`} className="text-sm text-gray-500 hover:text-gray-700">← Все каналы</Link>

      {/* Хедер канала */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-[#F0EDFF] flex items-center justify-center text-2xl flex-shrink-0">
          {account.external_avatar_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={account.external_avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
            : '💬'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900 truncate">{account.external_title ?? 'Без названия'}</h1>
            {account.external_username && <span className="text-sm text-gray-400">{account.external_username}</span>}
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
          {meta.description && <p className="text-sm text-gray-500 mt-1">{meta.description}</p>}
          <p className="text-xs text-gray-400 mt-1">
            {account.last_sync_at ? `Обновлено ${new Date(account.last_sync_at).toLocaleString('ru-RU')}` : 'Ещё не синхронизировано'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-gray-900">{(meta.subscribers_count ?? 0).toLocaleString('ru-RU')}</p>
          <p className="text-xs text-gray-400">подписчиков</p>
        </div>
      </div>

      {/* Tabs + фильтр */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-gray-100">
        <div className="flex gap-1">
          {([
            { k: 'overview',    l: 'Обзор' },
            { k: 'subscribers', l: 'Подписчики' },
            { k: 'posts',       l: 'Посты' },
            { k: 'settings',    l: 'Настройки' },
          ] as const).map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === t.k ? 'border-[#6A55F8] text-[#6A55F8]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 pb-2">
          <select value={dateFilter} onChange={e => setDateFilter(e.target.value as DateFilter)}
            className="text-xs border border-gray-200 rounded px-2 py-1">
            <option value="7d">За 7 дней</option>
            <option value="30d">За 30 дней</option>
            <option value="90d">За 90 дней</option>
            <option value="all">Всё время</option>
          </select>
          <button
            onClick={syncNow}
            disabled={syncing}
            title="Обновить данные сейчас. Автоматически всё обновляется каждые 15 минут, кнопка нужна если хочешь увидеть самые свежие цифры прямо сейчас."
            className="text-xs text-gray-500 hover:text-[#6A55F8] disabled:opacity-50"
          >
            {syncing ? 'Обновляю…' : '↻ Обновить'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div>
        {tab === 'overview' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox label="Подписалось за 24ч" value={joinsLastDay} color="text-emerald-600" />
              <StatBox label="Отписалось за 24ч" value={leavesLastDay} color="text-rose-600" />
              <StatBox label="Подписок за период" value={joinsPeriod} color="text-emerald-600" />
              <StatBox label="Отписок за период" value={leavesPeriod} color="text-rose-600" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
        ) : tab === 'posts' ? (
          <PostsList topPosts={topPosts} worstPosts={worstPosts} all={filteredPosts} />
        ) : (
          <SettingsPanel
            projectId={projectId}
            account={account}
            onReload={load}
            disconnectMtproto={disconnectMtproto}
            disconnectingMtproto={disconnectingMtproto}
            removeChannel={removeChannel}
            removing={removing}
          />
        )}
      </div>
    </div>
  )
}

function SettingsPanel({ projectId, account, onReload, disconnectMtproto, disconnectingMtproto, removeChannel, removing }: {
  projectId: string
  account: SocialAccount
  onReload: () => void
  disconnectMtproto: () => void
  disconnectingMtproto: boolean
  removeChannel: () => void
  removing: boolean
}) {
  const [mtprotoOpen, setMtprotoOpen] = useState(false)
  const hasMtproto = account.mtproto_status === 'connected'
  return (
    <div className="space-y-4 max-w-2xl">
      {/* MTProto */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-gray-900">Продвинутая статистика (MTProto)</h3>
              {hasMtproto && <span className="text-[10px] uppercase font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">подключено</span>}
              {account.mtproto_status === 'error' && <span className="text-[10px] uppercase font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded">ошибка</span>}
            </div>
            <p className="text-sm text-gray-600">
              {hasMtproto
                ? 'Просмотры постов, форварды и приватные каналы — через твой user-аккаунт Telegram.'
                : 'Подключи свой Telegram-аккаунт чтобы видеть просмотры постов, форварды и работать с приватными каналами.'}
            </p>
            {account.mtproto_status === 'error' && account.mtproto_last_error && (
              <p className="text-xs text-red-600 mt-1">Ошибка: {account.mtproto_last_error}</p>
            )}
          </div>
          {hasMtproto ? (
            <button onClick={disconnectMtproto} disabled={disconnectingMtproto}
              className="border border-red-300 text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 whitespace-nowrap">
              {disconnectingMtproto ? 'Отключаю…' : 'Отключить'}
            </button>
          ) : (
            <button onClick={() => setMtprotoOpen(true)}
              className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap">
              🔒 Подключить
            </button>
          )}
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-white rounded-xl border border-red-200 p-5">
        <h3 className="font-semibold text-red-700 mb-1">Опасная зона</h3>
        <p className="text-sm text-gray-600 mb-3">
          Канал пропадёт из списка. История событий подписчиков и посты останутся в БД — можно будет подключить снова и всё вернётся.
        </p>
        <button onClick={removeChannel} disabled={removing}
          className="border border-red-300 text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {removing ? 'Удаляю…' : 'Отвязать канал'}
        </button>
      </div>

      {mtprotoOpen && (
        <MTProtoModal projectId={projectId} onClose={() => setMtprotoOpen(false)}
          onDone={() => { setMtprotoOpen(false); onReload() }} hasConnected={hasMtproto} />
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
          <h2 className="font-semibold text-gray-900">Продвинутая статистика (MTProto)</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
        </div>
        <div className="p-6 space-y-4">
          {hasConnected && step === 'guide' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-900">
              ✅ MTProto уже подключён для этого канала.
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
                  <b>Создай отдельный Telegram-аккаунт</b> на виртуальный номер — session не даст доступ к основному аккаунту.
                  <div className="text-xs text-gray-500 mt-1">
                    <a href="https://onlinesim.ru" target="_blank" rel="noreferrer" className="text-[#6A55F8] underline">onlinesim.ru</a>,{' '}
                    <a href="https://sms-activate.org" target="_blank" rel="noreferrer" className="text-[#6A55F8] underline">sms-activate.org</a> (~50₽/мес).
                  </div>
                  <div className="text-xs text-amber-700 mt-1">⚠️ Можно основной аккаунт, но утечка session даст доступ ко всем чатам.</div>
                </li>
                <li>Добавь этот аккаунт администратором в канал</li>
                <li>
                  Зайди на <a href="https://my.telegram.org" target="_blank" rel="noreferrer" className="text-[#6A55F8] underline">my.telegram.org</a>,
                  создай приложение — получишь <code className="bg-gray-100 px-1 rounded">api_id</code> и <code className="bg-gray-100 px-1 rounded">api_hash</code>
                </li>
                <li>Введи их ниже + номер телефона</li>
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

function StatBox({ label, value, color, suffix }: { label: string; value: number; color: string; suffix?: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${color} mt-1`}>{value.toLocaleString('ru-RU')}{suffix ?? ''}</p>
    </div>
  )
}

function SubscribersChart({ snapshots }: { snapshots: SnapshotRow[] }) {
  if (snapshots.length < 2) {
    return <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-xs text-gray-400">
      Ещё мало данных для графика. Подожди пока накопится история (обычно 1-2 дня).
    </div>
  }
  const max = Math.max(...snapshots.map(s => s.subscribers_count))
  const min = Math.min(...snapshots.map(s => s.subscribers_count))
  const range = max - min || 1
  const width = 800
  const height = 220
  const padLeft = 50
  const padRight = 10
  const padTop = 15
  const padBottom = 32
  const plotW = width - padLeft - padRight
  const plotH = height - padTop - padBottom
  const stepX = plotW / (snapshots.length - 1)
  const points = snapshots.map((s, i) => {
    const x = padLeft + i * stepX
    const y = padTop + plotH - ((s.subscribers_count - min) / range) * plotH
    return `${x},${y}`
  }).join(' ')

  const firstDate = new Date(snapshots[0].at)
  const lastDate = new Date(snapshots[snapshots.length - 1].at)
  const midDate = new Date(snapshots[Math.floor(snapshots.length / 2)].at)
  const fmtDate = (d: Date) => d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <p className="text-sm font-semibold text-gray-900 mb-3">Динамика подписчиков</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        <line x1={padLeft} y1={padTop} x2={padLeft} y2={padTop + plotH} stroke="#e5e7eb" strokeWidth="1" />
        <line x1={padLeft} y1={padTop + plotH} x2={width - padRight} y2={padTop + plotH} stroke="#e5e7eb" strokeWidth="1" />
        <text x={padLeft - 6} y={padTop + 4} textAnchor="end" fill="#9ca3af" fontSize="11">{max}</text>
        <text x={padLeft - 6} y={padTop + plotH + 4} textAnchor="end" fill="#9ca3af" fontSize="11">{min}</text>
        <polyline fill="none" stroke="#6A55F8" strokeWidth="2" points={points} />
        <text x={padLeft} y={height - 10} fill="#9ca3af" fontSize="11">{fmtDate(firstDate)}</text>
        <text x={padLeft + plotW / 2} y={height - 10} textAnchor="middle" fill="#9ca3af" fontSize="11">{fmtDate(midDate)}</text>
        <text x={width - padRight} y={height - 10} textAnchor="end" fill="#9ca3af" fontSize="11">{fmtDate(lastDate)}</text>
      </svg>
    </div>
  )
}

function SubscribersList({ log }: { log: SubsLogRow[] }) {
  if (log.length === 0) {
    return <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-400">
      Событий ещё нет. Они появятся автоматически по мере подписок/отписок.
    </div>
  }
  return (
    <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
      {log.map(row => (
        <div key={row.id} className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <span className={`text-lg w-6 text-center ${row.action === 'join' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {row.action === 'join' ? '+' : '−'}
            </span>
            <span className="text-sm text-gray-800 truncate">
              {row.first_name ?? '—'}{row.username ? ` · @${row.username.replace(/^@/, '')}` : ''}
            </span>
            {row.invite_link_name && (
              <span className="text-[10px] bg-[#F0EDFF] text-[#6A55F8] px-1.5 py-0.5 rounded font-mono truncate max-w-[180px]">
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
    return <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-400">
      Посты ещё не подтянулись. Парсинг работает только для публичных каналов, обновляется раз в 15 минут.
    </div>
  }
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-sm font-semibold text-gray-900 mb-2">🏆 ТОП-5 по просмотрам</p>
        <div className="divide-y divide-gray-50">{topPosts.map(p => <PostRow key={p.id} p={p} />)}</div>
      </div>
      {worstPosts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-sm font-semibold text-gray-900 mb-2">💤 Слабые посты</p>
          <div className="divide-y divide-gray-50">{worstPosts.map(p => <PostRow key={p.id} p={p} />)}</div>
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-sm font-semibold text-gray-900 mb-2">Все посты ({all.length})</p>
        <div className="divide-y divide-gray-50">{all.map(p => <PostRow key={p.id} p={p} />)}</div>
      </div>
    </div>
  )
}

function PostRow({ p }: { p: ContentItem }) {
  return (
    <a href={p.url ?? '#'} target="_blank" rel="noopener noreferrer"
       className="flex items-center justify-between py-2.5 hover:bg-gray-50 rounded px-2 -mx-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 truncate">{p.title || '(медиа без текста)'}</p>
        <p className="text-[11px] text-gray-400">{p.published_at ? new Date(p.published_at).toLocaleString('ru-RU') : ''}</p>
      </div>
      <div className="flex gap-3 flex-shrink-0 text-xs text-gray-600 ml-3">
        <span>👁 {(p.metrics.views ?? 0).toLocaleString('ru-RU')}</span>
        {(p.metrics.reactions ?? 0) > 0 && <span>👍 {p.metrics.reactions}</span>}
        {(p.metrics.forwards ?? 0) > 0 && <span>↗ {p.metrics.forwards}</span>}
      </div>
    </a>
  )
}
