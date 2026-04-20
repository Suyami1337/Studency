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

function TelegramChannelCard({ account }: { account: SocialAccount }) {
  const meta = account.metadata as { subscribers_count?: number; description?: string }
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
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
              <span className="text-xs text-gray-400">@{account.external_username.replace(/^@/, '')}</span>
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
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
        Детальная аналитика (графики прироста, посты, ТОП) — в следующей итерации.
      </div>
    </div>
  )
}
