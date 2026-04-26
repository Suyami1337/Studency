'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Avatar } from '@/components/ui/Avatar'

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

  return (
    <div className="space-y-4">
      {/* Заголовок и добавить */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">Подключённые Telegram-каналы</h2>
          <p className="text-xs text-gray-500">Клик по карточке — детальная аналитика канала и настройки</p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          + Добавить канал
        </button>
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
        <div className="space-y-2">
          {accounts.map(acc => <ChannelPreview key={acc.id} projectId={projectId} account={acc} />)}
        </div>
      )}

      {addOpen && (
        <AddChannelModal projectId={projectId} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); onReload() }} />
      )}
    </div>
  )
}

function ChannelPreview({ projectId, account }: { projectId: string; account: SocialAccount }) {
  const meta = account.metadata as { subscribers_count?: number; description?: string }
  const title = account.external_title ?? account.external_username ?? 'Без названия'
  return (
    <Link
      href={`/project/${projectId}/social/telegram/${account.id}`}
      className="w-full bg-white rounded-xl border border-gray-100 p-4 transition-all group flex items-center gap-4 hover:border-[#6A55F8]/40 hover:shadow-md"
    >
      <Avatar
        name={title}
        seed={account.id}
        photoUrl={account.external_avatar_url}
        size="lg"
      />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 truncate group-hover:text-[#6A55F8] transition-colors">{title}</p>
        <p className="text-xs text-gray-400 font-mono truncate mt-0.5">
          {account.external_username ? account.external_username : 'Telegram-канал'}
        </p>
      </div>
      <div className="hidden sm:flex items-center gap-6 flex-shrink-0">
        <div className="text-center">
          <p className="text-base font-bold text-gray-900 leading-tight">{(meta.subscribers_count ?? 0).toLocaleString('ru-RU')}</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">подписчиков</p>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {account.mtproto_status === 'connected' && (
          <span className="rounded-full px-2.5 py-1 text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">MTProto</span>
        )}
        {account.mtproto_status === 'error' && (
          <span className="rounded-full px-2.5 py-1 text-[11px] font-medium bg-red-50 text-red-700 border border-red-200">Ошибка</span>
        )}
        <svg className="w-4 h-4 text-gray-300 group-hover:text-[#6A55F8] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
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

