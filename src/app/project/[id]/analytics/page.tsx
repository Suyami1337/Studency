'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { SkeletonList } from '@/components/ui/Skeleton'

type Funnel = { id: string; name: string; customer_count?: number }
type Bot = { id: string; name: string; scenario_count?: number }
type Landing = { id: string; name: string; visits: number; conversions: number }
type Product = { id: string; name: string; order_count?: number; revenue?: number }
type TrafficSource = {
  id: string
  name: string
  slug: string
  destination_url: string
  description: string | null
  click_count: number
  created_at: string
  telegram_invite_link?: string | null
  telegram_invite_name?: string | null
  telegram_channel_title?: string | null
  telegram_invite_member_count?: number | null
}

function formatMoney(n: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n)
}

function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 flex items-start gap-4">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0" style={{ backgroundColor: '#F0EDFF' }}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-500 mb-0.5">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Вкладка Обзор ────────────────────────────────────────────────────────────
function OverviewTab({ projectId }: { projectId: string }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [totalCustomers, setTotalCustomers] = useState(0)
  const [totalOrders, setTotalOrders] = useState(0)
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [totalVisits, setTotalVisits] = useState(0)
  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [bots, setBots] = useState<Bot[]>([])
  const [landings, setLandings] = useState<Landing[]>([])
  const [products, setProducts] = useState<Product[]>([])

  async function loadAll() {
    const [
      customersRes, ordersRes, revenueRes, visitsRes,
      funnelsRes, botsRes, landingsRes, productsRes,
      funnelPositionsRes, scenariosRes, ordersDetailRes,
    ] = await Promise.all([
      supabase.from('customers').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
      supabase.from('orders').select('paid_amount').eq('project_id', projectId).eq('status', 'paid'),
      supabase.from('landings').select('visits').eq('project_id', projectId),
      supabase.from('funnels').select('id, name').eq('project_id', projectId).order('name'),
      supabase.from('telegram_bots').select('id, name').eq('project_id', projectId).order('name'),
      supabase.from('landings').select('id, name, visits, conversions').eq('project_id', projectId).order('visits', { ascending: false }),
      supabase.from('products').select('id, name').eq('project_id', projectId).order('name'),
      supabase.from('customer_funnel_positions').select('funnel_id').eq('project_id', projectId),
      supabase.from('chatbot_scenarios').select('id, bot_id').eq('project_id', projectId),
      supabase.from('orders').select('product_id, paid_amount, status').eq('project_id', projectId),
    ])

    setTotalCustomers(customersRes.count ?? 0)
    setTotalOrders(ordersRes.count ?? 0)
    setTotalRevenue((revenueRes.data ?? []).reduce((s, o) => s + (o.paid_amount ?? 0), 0))
    setTotalVisits((visitsRes.data ?? []).reduce((s, l) => s + (l.visits ?? 0), 0))

    if (funnelsRes.data) {
      const posMap = new Map<string, number>()
      for (const p of (funnelPositionsRes.data ?? [])) posMap.set(p.funnel_id, (posMap.get(p.funnel_id) ?? 0) + 1)
      setFunnels(funnelsRes.data.map(f => ({ ...f, customer_count: posMap.get(f.id) ?? 0 })))
    }
    if (botsRes.data) {
      const scMap = new Map<string, number>()
      for (const s of (scenariosRes.data ?? [])) scMap.set(s.bot_id, (scMap.get(s.bot_id) ?? 0) + 1)
      setBots(botsRes.data.map(b => ({ ...b, scenario_count: scMap.get(b.id) ?? 0 })))
    }
    if (landingsRes.data) setLandings(landingsRes.data as Landing[])
    if (productsRes.data) {
      const cntMap = new Map<string, number>()
      const revMap = new Map<string, number>()
      for (const o of (ordersDetailRes.data ?? [])) {
        if (!o.product_id) continue
        cntMap.set(o.product_id, (cntMap.get(o.product_id) ?? 0) + 1)
        if (o.status === 'paid') revMap.set(o.product_id, (revMap.get(o.product_id) ?? 0) + (o.paid_amount ?? 0))
      }
      setProducts(productsRes.data.map(p => ({ ...p, order_count: cntMap.get(p.id) ?? 0, revenue: revMap.get(p.id) ?? 0 })))
    }
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAll() }, [projectId])

  if (loading) return <div className="space-y-6"><SkeletonList count={3} /></div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Аналитика</h1>
        <p className="text-sm text-gray-500 mt-0.5">Сводка по клиентам, заказам, выручке и сайтам</p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Клиентов" value={totalCustomers} icon="👥" />
        <StatCard label="Заказов" value={totalOrders} icon="🧾" />
        <StatCard label="Выручка" value={formatMoney(totalRevenue)} sub="только оплаченные" icon="💰" />
        <StatCard label="Посещений сайтов" value={totalVisits.toLocaleString('ru-RU')} icon="🌐" />
      </div>

      {[
        { title: 'По воронкам', color: '#6A55F8', items: funnels, renderRight: (f: Funnel) => `${f.customer_count} ${(f.customer_count ?? 0) === 1 ? 'клиент' : (f.customer_count ?? 0) < 5 ? 'клиента' : 'клиентов'}`, empty: 'Воронок пока нет' },
        { title: 'По ботам', color: '#10B981', items: bots, renderRight: (b: Bot) => `${b.scenario_count} ${(b.scenario_count ?? 0) === 1 ? 'сценарий' : (b.scenario_count ?? 0) < 5 ? 'сценария' : 'сценариев'}`, empty: 'Ботов пока нет' },
      ].map(({ title, color, items, renderRight, empty }) => (
        <div key={title} className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">{title}</h2>
          {items.length === 0 ? <p className="text-sm text-gray-400">{empty}</p> : (
            <div className="space-y-2">
              {items.map((item: Funnel | Bot) => (
                <div key={item.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-sm font-medium text-gray-800">{item.name}</span>
                  </div>
                  <span className="text-sm text-gray-500 font-medium">{renderRight(item as Funnel & Bot)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">По сайтам</h2>
        {landings.length === 0 ? <p className="text-sm text-gray-400">Сайтов пока нет</p> : (
          <div className="space-y-2">
            {landings.map(l => {
              const convRate = l.visits > 0 ? ((l.conversions / l.visits) * 100).toFixed(1) : '0.0'
              return (
                <div key={l.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#F59E0B' }} />
                    <span className="text-sm font-medium text-gray-800">{l.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>{l.visits.toLocaleString('ru-RU')} посещений</span>
                    <span>{l.conversions.toLocaleString('ru-RU')} конверсий</span>
                    <span className="font-medium" style={{ color: '#6A55F8' }}>{convRate}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">По продуктам</h2>
        {products.length === 0 ? <p className="text-sm text-gray-400">Продуктов пока нет</p> : (
          <div className="space-y-2">
            {products.map(p => (
              <div key={p.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#EF4444' }} />
                  <span className="text-sm font-medium text-gray-800">{p.name}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span>{p.order_count} {(p.order_count ?? 0) === 1 ? 'заказ' : (p.order_count ?? 0) < 5 ? 'заказа' : 'заказов'}</span>
                  <span className="font-semibold text-gray-800">{formatMoney(p.revenue ?? 0)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Вкладка Источники трафика ────────────────────────────────────────────────
function SourcesTab({ projectId }: { projectId: string }) {
  const [sources, setSources] = useState<TrafficSource[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // форма
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [destUrl, setDestUrl] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const appUrl = typeof window !== 'undefined'
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL || 'https://studency.ru'

  async function loadSources() {
    const res = await fetch(`/api/traffic-sources?projectId=${projectId}`)
    const data = await res.json()
    setSources(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { loadSources() }, [projectId])

  // Авто-генерация slug из названия
  function handleNameChange(val: string) {
    setName(val)
    if (!slug || slug === transliterate(name)) {
      setSlug(transliterate(val))
    }
  }

  function transliterate(str: string) {
    const map: Record<string, string> = {
      а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',
      к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',
      х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
      ' ':'-','_':'-'
    }
    return str.toLowerCase().split('').map(c => map[c] ?? c).join('')
      .replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
  }

  async function createSource() {
    if (!name.trim() || !slug.trim() || !destUrl.trim()) {
      setError('Заполни название, ссылку и адрес назначения')
      return
    }
    setSaving(true)
    setError('')
    const res = await fetch('/api/traffic-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, name, slug, destinationUrl: destUrl, description }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Ошибка создания')
      setSaving(false)
      return
    }
    setSources(prev => [data, ...prev])
    setName(''); setSlug(''); setDestUrl(''); setDescription('')
    setCreating(false)
    setSaving(false)
    if (data._invite_created) {
      // eslint-disable-next-line no-alert
      alert('✅ Источник создан. Telegram invite-ссылка сгенерирована автоматически — копируй её и отдавай блогеру.')
    } else if (destUrl && /t\.me/i.test(destUrl)) {
      // eslint-disable-next-line no-alert
      alert('⚠️ Источник создан, но invite-ссылку не получилось создать автоматически.\n\nПроверь: бот проекта добавлен администратором этого канала с правом «Приглашать участников»? Без этого мы не сможем точно отслеживать подписки по конкретной ссылке.')
    }
  }

  async function deleteSource(id: string) {
    const source = sources.find(s => s.id === id)
    const name = source?.name ?? 'этот источник'
    if (!confirm(`Удалить источник «${name}»? Клики, привязанные Telegram-подписки и связь с клиентами в карточках останутся, но источник пропадёт из списка.`)) return
    setDeletingId(id)
    const prevSources = sources
    setSources(prev => prev.filter(s => s.id !== id))
    const res = await fetch(`/api/traffic-sources/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      alert('Не удалось удалить: ' + (json.error ?? res.statusText))
      setSources(prevSources)
    }
    setDeletingId(null)
  }

  function copyLink(source: TrafficSource) {
    // Если источник ведёт в Telegram-канал через invite-link — копируем её
    // (по ней Telegram сам скажет нам кто пришёл — 100% точный source).
    // Иначе — обычная серверная /go/slug с cookie.
    const link = source.telegram_invite_link || `${appUrl}/go/${source.slug}`
    navigator.clipboard.writeText(link)
    setCopiedId(source.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (loading) return <div><SkeletonList count={3} /></div>

  return (
    <div className="space-y-6">
      {/* Заголовок + кнопка */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">Создавай короткие ссылки для каждого источника трафика.<br />Платформа автоматически отслеживает откуда приходят пользователи.</p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#6A55F8' }}
          >
            + Новый источник
          </button>
        )}
      </div>

      {/* Форма создания */}
      {creating && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">Новый источник трафика</h3>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Название *</label>
              <input
                value={name}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="Instagram Reels"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Slug (часть ссылки) *</label>
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-purple-200">
                <span className="px-2 py-2 text-xs text-gray-400 bg-gray-50 border-r border-gray-200">/go/</span>
                <input
                  value={slug}
                  onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  placeholder="ig-reels"
                  className="flex-1 px-2 py-2 text-sm focus:outline-none"
                />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Куда ведёт ссылка *</label>
            <input
              value={destUrl}
              onChange={e => setDestUrl(e.target.value)}
              placeholder="https://t.me/your_channel, https://t.me/your_bot или https://example.com/landing"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
            {/^https?:\/\/(t\.me|telegram\.me)\/(?!.*bot$)[a-z0-9_+]/i.test(destUrl) && (
              <div className="mt-2 text-xs bg-[#F0EDFF] border border-[#6A55F8]/20 text-gray-700 rounded-lg p-3 space-y-1">
                <p className="font-medium text-[#6A55F8]">📣 Telegram-канал — сгенерируем точную ссылку</p>
                <p>Мы автоматически создадим именную пригласительную ссылку через твоего бота. Она 100% точно покажет кто именно пришёл с этого источника.</p>
                <p className="text-[11px] text-gray-500 mt-1">Для этого бот должен быть <b>администратором канала</b> с правом «Приглашать участников». Если такого бота нет — просто запишется как обычный источник.</p>
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Описание (необязательно)</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Таргет Meta — кампания Май 2026"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={createSource}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#6A55F8' }}
            >
              {saving ? 'Создаю...' : 'Создать'}
            </button>
            <button
              onClick={() => { setCreating(false); setError('') }}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Список источников */}
      {sources.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <p className="text-4xl mb-3">🔗</p>
          <p className="font-medium text-gray-700 mb-1">Источников пока нет</p>
          <p className="text-sm text-gray-400">Создай первый источник чтобы начать отслеживать трафик</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map(source => (
            <div key={source.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4">
              {/* Статистика */}
              <div className="w-20 text-center flex-shrink-0">
                {source.telegram_invite_link ? (
                  <>
                    <p className="text-2xl font-bold text-[#6A55F8]">{(source.telegram_invite_member_count ?? 0).toLocaleString('ru-RU')}</p>
                    <p className="text-xs text-gray-400">подписок</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-gray-900">{source.click_count.toLocaleString('ru-RU')}</p>
                    <p className="text-xs text-gray-400">кликов</p>
                  </>
                )}
              </div>

              {/* Основная инфо */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 text-sm truncate">{source.name}</p>
                  {source.telegram_invite_link && (
                    <span className="text-[10px] font-semibold uppercase bg-[#6A55F8]/10 text-[#6A55F8] px-1.5 py-0.5 rounded">TG канал</span>
                  )}
                </div>
                {source.description && (
                  <p className="text-xs text-gray-400 truncate">{source.description}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5 truncate">
                  → {source.telegram_channel_title ? `канал «${source.telegram_channel_title}»` : source.destination_url}
                </p>
              </div>

              {/* Ссылка + кнопки */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <code className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 text-gray-600 max-w-[220px] truncate">
                  {source.telegram_invite_link
                    ? source.telegram_invite_link.replace(/^https?:\/\//, '')
                    : `/go/${source.slug}`}
                </code>
                <button
                  onClick={() => copyLink(source)}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  {copiedId === source.id ? '✓ Скопировано' : 'Копировать'}
                </button>
                <button
                  onClick={() => deleteSource(source.id)}
                  disabled={deletingId === source.id}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Итого */}
      {sources.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between">
          <span className="text-sm text-gray-500">Всего источников: <span className="font-medium text-gray-900">{sources.length}</span></span>
          <span className="text-sm text-gray-500">Всего кликов: <span className="font-medium text-gray-900">{sources.reduce((s, src) => s + src.click_count, 0).toLocaleString('ru-RU')}</span></span>
        </div>
      )}
    </div>
  )
}

// ─── Вкладка Воронки (сквозная воронка + воронки по этапам + сравнение источников) ──
function FunnelsTab({ projectId }: { projectId: string }) {
  const supabase = createClient()
  const [sourceFilter, setSourceFilter] = useState('')
  const [sources, setSources] = useState<Array<{ id: string; name: string; slug: string; click_count: number }>>([])

  useEffect(() => {
    supabase.from('traffic_sources').select('id, name, slug, click_count')
      .eq('project_id', projectId).order('click_count', { ascending: false })
      .then(({ data }) => setSources((data ?? []) as typeof sources))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  return (
    <div className="space-y-5">
      {/* Фильтр по источнику — общий для всех секций */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3 flex-wrap">
        <span className="text-xs font-medium text-gray-700">Источник трафика:</span>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
          <option value="">Все источники</option>
          {sources.map(s => (
            <option key={s.id} value={s.id}>{s.name} ({s.click_count} кликов)</option>
          ))}
        </select>
        {sourceFilter && (
          <button onClick={() => setSourceFilter('')} className="text-xs text-[#6A55F8] hover:underline">Сбросить</button>
        )}
      </div>

      {/* Сквозная воронка */}
      <CrossAnalyticsTab projectId={projectId} sourceFilter={sourceFilter} sourceName={sources.find(s => s.id === sourceFilter)?.name} />

      {/* Таблица сравнения (только когда фильтр не выбран) */}
      {!sourceFilter && sources.length > 0 && (
        <SourceComparisonTable projectId={projectId} sources={sources} />
      )}
    </div>
  )
}

// ─── Сквозная воронка (используется внутри FunnelsTab) ─────────────────
function CrossAnalyticsTab({ projectId, sourceFilter, sourceName }: { projectId: string; sourceFilter: string; sourceName?: string }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalLeads: 0, botSubscribed: 0, channelSubscribed: 0,
    engagedInBot: 0, visitedLanding: 0, watchedVideo: 0,
    createdOrder: 0, paidOrder: 0, formSubmit: 0,
  })

  useEffect(() => {
    async function load() {
      setLoading(true)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let custQuery: any = supabase.from('customers').select('id', { count: 'exact' }).eq('project_id', projectId)
      if (sourceFilter) custQuery = custQuery.eq('source_id', sourceFilter)
      const { data: customerRows, count: leads } = await custQuery

      const customerIds = (customerRows ?? []).map((c: { id: string }) => c.id)
      if (customerIds.length === 0) {
        setStats({ totalLeads: 0, botSubscribed: 0, channelSubscribed: 0, engagedInBot: 0, visitedLanding: 0, watchedVideo: 0, createdOrder: 0, paidOrder: 0, formSubmit: 0 })
        setLoading(false)
        return
      }

      // Bot/channel subscription counts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let botSubQuery: any = supabase.from('customers').select('*', { count: 'exact', head: true }).eq('project_id', projectId).eq('bot_subscribed', true)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let chanSubQuery: any = supabase.from('customers').select('*', { count: 'exact', head: true }).eq('project_id', projectId).eq('channel_subscribed', true)
      if (sourceFilter) { botSubQuery = botSubQuery.eq('source_id', sourceFilter); chanSubQuery = chanSubQuery.eq('source_id', sourceFilter) }

      const [botSubRes, chanSubRes] = await Promise.all([botSubQuery, chanSubQuery])

      const { data: actions } = await supabase
        .from('customer_actions').select('customer_id, action')
        .eq('project_id', projectId).in('customer_id', customerIds)

      const engagedSet = new Set<string>()
      const visitedSet = new Set<string>()
      const formSet = new Set<string>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const a of (actions ?? []) as any[]) {
        if (a.action === 'bot_start' || a.action === 'bot_button_click') engagedSet.add(a.customer_id)
        if (a.action === 'landing_visit' || a.action === 'landing_button_click') visitedSet.add(a.customer_id)
        if (a.action === 'form_submit') formSet.add(a.customer_id)
      }

      const { data: views } = await supabase
        .from('video_views').select('customer_id').eq('project_id', projectId).in('customer_id', customerIds)
      const watchedSet = new Set((views ?? []).map((v: { customer_id: string }) => v.customer_id).filter(Boolean))

      const { data: orders } = await supabase
        .from('orders').select('customer_id, status').eq('project_id', projectId).in('customer_id', customerIds)
      const createdSet = new Set<string>()
      const paidSet = new Set<string>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const o of (orders ?? []) as any[]) {
        if (o.customer_id) { createdSet.add(o.customer_id); if (o.status === 'paid') paidSet.add(o.customer_id) }
      }

      setStats({
        totalLeads: leads ?? 0,
        botSubscribed: botSubRes.count ?? 0,
        channelSubscribed: chanSubRes.count ?? 0,
        engagedInBot: engagedSet.size,
        visitedLanding: visitedSet.size,
        watchedVideo: watchedSet.size,
        createdOrder: createdSet.size,
        paidOrder: paidSet.size,
        formSubmit: formSet.size,
      })
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sourceFilter])

  const steps = [
    { label: 'Всего клиентов', count: stats.totalLeads, icon: '👥' },
    { label: 'Подписаны на бота', count: stats.botSubscribed, icon: '🤖' },
    { label: 'Подписаны на канал', count: stats.channelSubscribed, icon: '📢' },
    { label: 'Взаимодействовали с ботом', count: stats.engagedInBot, icon: '💬' },
    { label: 'Посещали лендинги', count: stats.visitedLanding, icon: '🌐' },
    { label: 'Смотрели видео', count: stats.watchedVideo, icon: '🎬' },
    { label: 'Заполнили форму', count: stats.formSubmit, icon: '📝' },
    { label: 'Создали заказ', count: stats.createdOrder, icon: '🛒' },
    { label: 'Оплатили', count: stats.paidOrder, icon: '💰' },
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h3 className="text-base font-semibold text-gray-900 mb-1">
        Сквозная воронка
        {sourceName && <span className="font-normal text-[#6A55F8] ml-2">· {sourceName}</span>}
      </h3>
      <p className="text-xs text-gray-500 mb-5">От первого касания до оплаты</p>

      {loading ? <SkeletonList count={1} /> : (
        <div className="space-y-2">
          {steps.map((s, i) => {
            const prev = i > 0 ? steps[i - 1].count : stats.totalLeads
            const conversion = prev > 0 ? Math.round((s.count / prev) * 100) : 0
            const total = stats.totalLeads || 1
            const width = Math.max(5, (s.count / total) * 100)
            return (
              <div key={i}>
                <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                  <span className="font-medium flex items-center gap-2">
                    <span>{s.icon}</span>{s.label}
                  </span>
                  <span>{s.count} ({conversion}%)</span>
                </div>
                <div className="h-10 bg-gray-100 rounded-lg overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#6A55F8] to-[#8B7BFA] flex items-center px-3 text-white text-sm font-semibold transition-all"
                    style={{ width: `${width}%` }}>{s.count}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Таблица сравнения источников трафика ────────────────────────────────────
function SourceComparisonTable({ projectId, sources }: {
  projectId: string
  sources: Array<{ id: string; name: string; slug: string; click_count: number }>
}) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Array<{
    id: string; name: string; clicks: number
    leads: number; bot: number; channel: number; landing: number; video: number; orders: number; paid: number
  }>>([])

  useEffect(() => {
    async function load() {
      const result = await Promise.all(sources.map(async (src) => {
        const { count: leads } = await supabase.from('customers')
          .select('*', { count: 'exact', head: true }).eq('project_id', projectId).eq('source_id', src.id)

        if ((leads ?? 0) === 0) {
          return { id: src.id, name: src.name, clicks: src.click_count, leads: 0, bot: 0, channel: 0, landing: 0, video: 0, orders: 0, paid: 0 }
        }

        const { data: custs } = await supabase.from('customers').select('id').eq('project_id', projectId).eq('source_id', src.id)
        const ids = (custs ?? []).map((c: { id: string }) => c.id)

        const [botRes, chanRes] = await Promise.all([
          supabase.from('customers').select('*', { count: 'exact', head: true }).eq('project_id', projectId).eq('source_id', src.id).eq('bot_subscribed', true),
          supabase.from('customers').select('*', { count: 'exact', head: true }).eq('project_id', projectId).eq('source_id', src.id).eq('channel_subscribed', true),
        ])

        const { data: actions } = await supabase.from('customer_actions').select('customer_id, action').eq('project_id', projectId).in('customer_id', ids)
        const landingSet = new Set<string>()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const a of (actions ?? []) as any[]) {
          if (a.action === 'landing_visit') landingSet.add(a.customer_id)
        }

        const { data: views } = await supabase.from('video_views').select('customer_id').eq('project_id', projectId).in('customer_id', ids)
        const videoSet = new Set((views ?? []).map((v: { customer_id: string }) => v.customer_id).filter(Boolean))

        const { data: ordersData } = await supabase.from('orders').select('customer_id, status').eq('project_id', projectId).in('customer_id', ids)
        let ordersCount = 0; let paidCount = 0
        const orderSeen = new Set<string>(); const paidSeen = new Set<string>()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const o of (ordersData ?? []) as any[]) {
          if (o.customer_id && !orderSeen.has(o.customer_id)) { orderSeen.add(o.customer_id); ordersCount++ }
          if (o.customer_id && o.status === 'paid' && !paidSeen.has(o.customer_id)) { paidSeen.add(o.customer_id); paidCount++ }
        }

        return {
          id: src.id, name: src.name, clicks: src.click_count,
          leads: leads ?? 0, bot: botRes.count ?? 0, channel: chanRes.count ?? 0,
          landing: landingSet.size, video: videoSet.size, orders: ordersCount, paid: paidCount,
        }
      }))

      setRows(result.sort((a, b) => b.paid - a.paid || b.leads - a.leads))
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sources])

  if (loading) return <SkeletonList count={2} />

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-base font-semibold text-gray-900">Сравнение источников</h3>
        <p className="text-xs text-gray-500 mt-0.5">Какой трафик окупается лучше</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left font-semibold text-gray-500 px-4 py-3">Источник</th>
              <th className="text-right font-semibold text-gray-500 px-3 py-3">Клики</th>
              <th className="text-right font-semibold text-gray-500 px-3 py-3">Лиды</th>
              <th className="text-right font-semibold text-gray-500 px-3 py-3">В бота</th>
              <th className="text-right font-semibold text-gray-500 px-3 py-3">Канал</th>
              <th className="text-right font-semibold text-gray-500 px-3 py-3">Лендинг</th>
              <th className="text-right font-semibold text-gray-500 px-3 py-3">Видео</th>
              <th className="text-right font-semibold text-gray-500 px-3 py-3">Заказы</th>
              <th className="text-right font-semibold text-[#6A55F8] px-3 py-3">Оплаты</th>
              <th className="text-right font-semibold text-gray-500 px-3 py-3">Конверсия</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const conv = r.clicks > 0 ? ((r.paid / r.clicks) * 100).toFixed(1) : '0'
              return (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                  <td className="px-3 py-3 text-right text-gray-600">{r.clicks}</td>
                  <td className="px-3 py-3 text-right text-gray-600">{r.leads}</td>
                  <td className="px-3 py-3 text-right text-gray-600">{r.bot}</td>
                  <td className="px-3 py-3 text-right text-gray-600">{r.channel}</td>
                  <td className="px-3 py-3 text-right text-gray-600">{r.landing}</td>
                  <td className="px-3 py-3 text-right text-gray-600">{r.video}</td>
                  <td className="px-3 py-3 text-right text-gray-600">{r.orders}</td>
                  <td className="px-3 py-3 text-right font-bold text-[#6A55F8]">{r.paid}</td>
                  <td className="px-3 py-3 text-right text-gray-500">{conv}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Вкладка Чат-боты аналитика ────────────────────────────────────────────────
function BotsAnalyticsTab({ projectId }: { projectId: string }) {
  const supabase = createClient()
  const [bots, setBots] = useState<Array<{ id: string; name: string; bot_username: string | null }>>([])
  const [selectedBotId, setSelectedBotId] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [sources, setSources] = useState<Array<{ id: string; name: string }>>([])
  const [stats, setStats] = useState({ total: 0, subscribed: 0, blocked: 0, messages: 0, buttonClicks: 0 })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('telegram_bots').select('id, name, bot_username').eq('project_id', projectId)
      .then(({ data }) => { const b = (data ?? []) as typeof bots; setBots(b); if (b.length > 0) setSelectedBotId(b[0].id) })
    supabase.from('traffic_sources').select('id, name').eq('project_id', projectId)
      .then(({ data }) => setSources((data ?? []) as typeof sources))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    if (!selectedBotId) return
    setLoading(true)
    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const custQuery: any = supabase.from('chatbot_conversations').select('customer_id').eq('telegram_bot_id', selectedBotId)
      const { data: convs } = await custQuery
      let customerIds = (convs ?? []).map((c: { customer_id: string }) => c.customer_id).filter(Boolean)

      if (sourceFilter && customerIds.length > 0) {
        const { data: filtered } = await supabase.from('customers').select('id').in('id', customerIds).eq('source_id', sourceFilter)
        customerIds = (filtered ?? []).map((c: { id: string }) => c.id)
      }

      const total = customerIds.length
      let subscribed = 0; let blocked = 0
      if (total > 0) {
        const [subRes, blkRes] = await Promise.all([
          supabase.from('customers').select('*', { count: 'exact', head: true }).in('id', customerIds).eq('bot_subscribed', true),
          supabase.from('customers').select('*', { count: 'exact', head: true }).in('id', customerIds).eq('bot_blocked', true),
        ])
        subscribed = subRes.count ?? 0
        blocked = blkRes.count ?? 0
      }

      let messages = 0; let buttonClicks = 0
      if (total > 0) {
        const { data: actions } = await supabase.from('customer_actions').select('action').eq('project_id', projectId).in('customer_id', customerIds)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const a of (actions ?? []) as any[]) {
          if (a.action === 'bot_message') messages++
          if (a.action === 'bot_button_click') buttonClicks++
        }
      }
      setStats({ total, subscribed, blocked, messages, buttonClicks })
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBotId, sourceFilter])

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <select value={selectedBotId} onChange={e => setSelectedBotId(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
          {bots.map(b => <option key={b.id} value={b.id}>@{b.bot_username ?? b.name}</option>)}
        </select>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
          <option value="">Все источники</option>
          {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      {loading ? <SkeletonList count={1} /> : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Всего пользователей" value={stats.total} icon="👥" />
          <StatCard label="Подписаны" value={stats.subscribed} icon="🤖" />
          <StatCard label="Заблокировали" value={stats.blocked} icon="🚫" />
          <StatCard label="Сообщений" value={stats.messages} icon="💬" />
          <StatCard label="Кликов по кнопкам" value={stats.buttonClicks} icon="👆" />
        </div>
      )}
    </div>
  )
}

// ─── Вкладка Сайты аналитика ────────────────────────────────────────────────
function SitesAnalyticsTab({ projectId }: { projectId: string }) {
  const supabase = createClient()
  const [landings, setLandings] = useState<Array<{ id: string; name: string; slug: string; visits: number; conversions: number }>>([])
  const [sourceFilter, setSourceFilter] = useState('')
  const [sources, setSources] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    supabase.from('landings').select('id, name, slug, visits, conversions').eq('project_id', projectId).order('visits', { ascending: false })
      .then(({ data }) => setLandings((data ?? []) as typeof landings))
    supabase.from('traffic_sources').select('id, name').eq('project_id', projectId)
      .then(({ data }) => setSources((data ?? []) as typeof sources))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  return (
    <div className="space-y-4">
      <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
        className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
        <option value="">Все источники</option>
        {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      {landings.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Нет сайтов</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left font-semibold text-gray-500 px-4 py-3">Сайт</th>
              <th className="text-right font-semibold text-gray-500 px-4 py-3">Посещения</th>
              <th className="text-right font-semibold text-gray-500 px-4 py-3">Конверсии</th>
              <th className="text-right font-semibold text-gray-500 px-4 py-3">CR%</th>
            </tr></thead>
            <tbody>
              {landings.map(l => (
                <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{l.name} <span className="text-xs text-gray-400">/{l.slug}</span></td>
                  <td className="px-4 py-3 text-right text-gray-600">{l.visits}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{l.conversions}</td>
                  <td className="px-4 py-3 text-right text-[#6A55F8] font-medium">{l.visits > 0 ? Math.round(l.conversions / l.visits * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Вкладка Видео аналитика ────────────────────────────────────────────────
function VideosAnalyticsTab({ projectId }: { projectId: string }) {
  const supabase = createClient()
  const [videos, setVideos] = useState<Array<{ id: string; title: string; duration_seconds: number | null }>>([])
  const [viewCounts, setViewCounts] = useState<Map<string, { views: number; completed: number }>>(new Map())

  useEffect(() => {
    async function load() {
      const { data: vids } = await supabase.from('videos').select('id, title, duration_seconds').eq('project_id', projectId)
      setVideos((vids ?? []) as typeof videos)

      if (vids && vids.length > 0) {
        const { data: views } = await supabase.from('video_views').select('video_id, completed').eq('project_id', projectId)
        const map = new Map<string, { views: number; completed: number }>()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const v of (views ?? []) as any[]) {
          const cur = map.get(v.video_id) ?? { views: 0, completed: 0 }
          cur.views++
          if (v.completed) cur.completed++
          map.set(v.video_id, cur)
        }
        setViewCounts(map)
      }
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  return (
    <div className="space-y-4">
      {videos.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Нет видео</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left font-semibold text-gray-500 px-4 py-3">Видео</th>
              <th className="text-right font-semibold text-gray-500 px-4 py-3">Просмотры</th>
              <th className="text-right font-semibold text-gray-500 px-4 py-3">Досмотры</th>
              <th className="text-right font-semibold text-gray-500 px-4 py-3">CR%</th>
            </tr></thead>
            <tbody>
              {videos.map(v => {
                const vc = viewCounts.get(v.id) ?? { views: 0, completed: 0 }
                return (
                  <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{v.title}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{vc.views}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{vc.completed}</td>
                    <td className="px-4 py-3 text-right text-[#6A55F8] font-medium">{vc.views > 0 ? Math.round(vc.completed / vc.views * 100) : 0}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Главный компонент ────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const params = useParams()
  const projectId = params.id as string
  const [activeTab, setActiveTab] = useState<'overview' | 'funnels' | 'chatbots' | 'sites' | 'videos' | 'sources'>('overview')

  const tabs = [
    { id: 'overview' as const, label: 'Обзор' },
    { id: 'funnels' as const, label: 'Воронки' },
    { id: 'chatbots' as const, label: 'Чат-боты' },
    { id: 'sites' as const, label: 'Сайты' },
    { id: 'videos' as const, label: 'Видео' },
    { id: 'sources' as const, label: 'Источники' },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Аналитика</h1>
        <p className="text-sm text-gray-500 mt-0.5">Детальная аналитика по каждому модулю</p>
      </div>

      {/* Вкладки */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-[#6A55F8] text-[#6A55F8]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab projectId={projectId} />}
      {activeTab === 'funnels' && <FunnelsTab projectId={projectId} />}
      {activeTab === 'chatbots' && <BotsAnalyticsTab projectId={projectId} />}
      {activeTab === 'sites' && <SitesAnalyticsTab projectId={projectId} />}
      {activeTab === 'videos' && <VideosAnalyticsTab projectId={projectId} />}
      {activeTab === 'sources' && <SourcesTab projectId={projectId} />}
    </div>
  )
}
