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
            <TelegramChannelCard key={acc.id} account={acc} />
          ))}
        </div>
      )}
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

function TelegramChannelCard({ account }: { account: SocialAccount }) {
  const supabase = createClient()
  const meta = account.metadata as { subscribers_count?: number; description?: string }
  const [expanded, setExpanded] = useState(false)
  const [subsLog, setSubsLog] = useState<SubsLogRow[]>([])
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([])
  const [posts, setPosts] = useState<ContentItem[]>([])
  const [tab, setTab] = useState<'overview' | 'subscribers' | 'posts'>('overview')
  const [loadingData, setLoadingData] = useState(false)
  const [syncing, setSyncing] = useState(false)

  async function loadData() {
    setLoadingData(true)
    const [sl, snap, ps] = await Promise.all([
      supabase.from('social_subscribers_log').select('*').eq('account_id', account.id).order('at', { ascending: false }).limit(100),
      supabase.from('social_subscribers_snapshots').select('subscribers_count, at').eq('account_id', account.id).order('at', { ascending: true }).limit(200),
      supabase.from('social_content_items').select('id, external_id, title, body, url, published_at, metrics').eq('account_id', account.id).order('published_at', { ascending: false }).limit(50),
    ])
    setSubsLog((sl.data ?? []) as SubsLogRow[])
    setSnapshots((snap.data ?? []) as SnapshotRow[])
    setPosts((ps.data ?? []) as ContentItem[])
    setLoadingData(false)
  }

  async function syncNow() {
    setSyncing(true)
    await fetch('/api/cron/social-sync').catch(() => null)
    await loadData()
    setSyncing(false)
  }

  useEffect(() => {
    if (expanded) loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])

  const joinsLastDay = subsLog.filter(r => r.action === 'join' && Date.now() - new Date(r.at).getTime() < 86_400_000).length
  const leavesLastDay = subsLog.filter(r => r.action === 'leave' && Date.now() - new Date(r.at).getTime() < 86_400_000).length
  const topPosts = [...posts].sort((a, b) => (b.metrics.views ?? 0) - (a.metrics.views ?? 0)).slice(0, 5)
  const worstPosts = [...posts].filter(p => (p.metrics.views ?? 0) > 0).sort((a, b) => (a.metrics.views ?? 0) - (b.metrics.views ?? 0)).slice(0, 5)

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
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-900">{account.external_title ?? account.external_username ?? 'Без названия'}</p>
              {account.external_username && (
                <span className="text-xs text-gray-400">{account.external_username}</span>
              )}
              {!account.external_username && (
                <span className="text-[10px] uppercase bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded font-semibold">приватный</span>
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
          {/* Tabs + sync */}
          <div className="flex items-center justify-between px-5 py-2 border-b border-gray-100">
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
            <button onClick={syncNow} disabled={syncing} className="text-xs text-[#6A55F8] hover:underline disabled:opacity-50">
              {syncing ? 'Обновляю…' : '↻ Синхронизировать'}
            </button>
          </div>

          <div className="p-5">
            {loadingData ? (
              <div className="text-center py-6 text-sm text-gray-400">Загрузка…</div>
            ) : tab === 'overview' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <StatBox label="Подписалось за 24ч" value={joinsLastDay} color="text-emerald-600" />
                  <StatBox label="Отписалось за 24ч" value={leavesLastDay} color="text-rose-600" />
                  <StatBox label="Постов (последние)" value={posts.length} color="text-[#6A55F8]" />
                </div>
                <SubscribersChart snapshots={snapshots} />
              </div>
            ) : tab === 'subscribers' ? (
              <SubscribersList log={subsLog} />
            ) : (
              <PostsList topPosts={topPosts} worstPosts={worstPosts} all={posts} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value.toLocaleString('ru-RU')}</p>
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
  const height = 120
  const stepX = width / (snapshots.length - 1)
  const points = snapshots.map((s, i) => {
    const x = i * stepX
    const y = height - ((s.subscribers_count - min) / range) * (height - 20) - 10
    return `${x},${y}`
  }).join(' ')
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <p className="text-xs text-gray-500 mb-2">Динамика подписчиков (min: {min}, max: {max})</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none">
        <polyline fill="none" stroke="#6A55F8" strokeWidth="2" points={points} />
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
