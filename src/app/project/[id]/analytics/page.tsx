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

  if (loading) return <div className="p-6"><SkeletonList count={3} /></div>

  return (
    <div className="space-y-8">
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
    : process.env.NEXT_PUBLIC_APP_URL || 'https://studency.vercel.app'

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
  }

  async function deleteSource(id: string) {
    setDeletingId(id)
    setSources(prev => prev.filter(s => s.id !== id))
    await fetch(`/api/traffic-sources/${id}`, { method: 'DELETE' })
    setDeletingId(null)
  }

  function copyLink(source: TrafficSource) {
    const link = `${appUrl}/go/${source.slug}`
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
              placeholder="https://t.me/your_bot или https://example.com/landing"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
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
              <div className="w-16 text-center flex-shrink-0">
                <p className="text-2xl font-bold text-gray-900">{source.click_count.toLocaleString('ru-RU')}</p>
                <p className="text-xs text-gray-400">кликов</p>
              </div>

              {/* Основная инфо */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate">{source.name}</p>
                {source.description && (
                  <p className="text-xs text-gray-400 truncate">{source.description}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5 truncate">→ {source.destination_url}</p>
              </div>

              {/* Ссылка + кнопки */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <code className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 text-gray-600">
                  /go/{source.slug}
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

// ─── Вкладка Воронки (конверсии по этапам) ────────────────────────────────────
function FunnelsTab({ projectId }: { projectId: string }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [funnels, setFunnels] = useState<any[]>([])

  useEffect(() => {
    async function load() {
      const { data: funnelsData } = await supabase
        .from('funnels').select('id, name').eq('project_id', projectId)

      const { data: stages } = await supabase
        .from('funnel_stages').select('id, funnel_id, name, order_position')
        .in('funnel_id', (funnelsData ?? []).map(f => f.id))
        .order('order_position')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const funnelsWithStages = await Promise.all((funnelsData ?? []).map(async (f: any) => {
        const fStages = (stages ?? []).filter((s: { funnel_id: string }) => s.funnel_id === f.id)
        const stagesWithCounts = await Promise.all(fStages.map(async (s: { id: string; name: string }) => {
          const { count } = await supabase
            .from('customers')
            .select('*', { count: 'exact', head: true })
            .eq('funnel_stage_id', s.id)
          return { ...s, count: count ?? 0 }
        }))
        return { ...f, stages: stagesWithCounts }
      }))

      setFunnels(funnelsWithStages)
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  if (loading) return <SkeletonList count={2} />
  if (funnels.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
        <p className="text-sm text-gray-500">Нет воронок в проекте</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {funnels.map(f => {
        const total = f.stages[0]?.count ?? 0
        return (
          <div key={f.id} className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-4">{f.name}</h3>
            <div className="space-y-2">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {f.stages.map((s: any, i: number) => {
                const prevCount = i > 0 ? f.stages[i - 1].count : total
                const conversion = prevCount > 0 ? Math.round((s.count / prevCount) * 100) : 0
                const width = total > 0 ? Math.max(5, (s.count / total) * 100) : 5
                return (
                  <div key={s.id}>
                    <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                      <span className="font-medium">{i + 1}. {s.name}</span>
                      <span>{s.count} клиентов · {conversion}%</span>
                    </div>
                    <div className="h-8 bg-gray-100 rounded-lg overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#6A55F8] to-[#8B7BFA] flex items-center px-3 text-white text-xs font-medium transition-all"
                        style={{ width: `${width}%` }}
                      >
                        {s.count}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Вкладка Сквозная (клиенты от первого касания до оплаты) ─────────────────
function CrossAnalyticsTab({ projectId }: { projectId: string }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalLeads: 0,
    engagedInBot: 0,
    visitedLanding: 0,
    createdOrder: 0,
    paidOrder: 0,
  })

  useEffect(() => {
    async function load() {
      const { count: leads } = await supabase
        .from('customers').select('*', { count: 'exact', head: true }).eq('project_id', projectId)

      const { data: actions } = await supabase
        .from('customer_actions')
        .select('customer_id, action')
        .eq('project_id', projectId)

      const engagedSet = new Set<string>()
      const visitedSet = new Set<string>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const a of (actions ?? []) as any[]) {
        if (a.action === 'bot_start' || a.action === 'bot_button_click') engagedSet.add(a.customer_id)
        if (a.action === 'landing_visit' || a.action === 'landing_button_click') visitedSet.add(a.customer_id)
      }

      const { data: orders } = await supabase
        .from('orders').select('customer_id, status').eq('project_id', projectId)

      const createdSet = new Set<string>()
      const paidSet = new Set<string>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const o of (orders ?? []) as any[]) {
        if (o.customer_id) {
          createdSet.add(o.customer_id)
          if (o.status === 'paid') paidSet.add(o.customer_id)
        }
      }

      setStats({
        totalLeads: leads ?? 0,
        engagedInBot: engagedSet.size,
        visitedLanding: visitedSet.size,
        createdOrder: createdSet.size,
        paidOrder: paidSet.size,
      })
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  if (loading) return <SkeletonList count={1} />

  const steps = [
    { label: 'Всего клиентов в базе', count: stats.totalLeads, icon: '👥' },
    { label: 'Запустили бота / кликали кнопки', count: stats.engagedInBot, icon: '🤖' },
    { label: 'Посещали лендинги', count: stats.visitedLanding, icon: '🌐' },
    { label: 'Создали заказ', count: stats.createdOrder, icon: '🛒' },
    { label: 'Оплатили', count: stats.paidOrder, icon: '💰' },
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h3 className="text-base font-semibold text-gray-900 mb-1">Сквозная воронка</h3>
      <p className="text-xs text-gray-500 mb-5">От первого касания до оплаты</p>

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
                  <span>{s.icon}</span>
                  {s.label}
                </span>
                <span>{s.count} ({conversion}%)</span>
              </div>
              <div className="h-10 bg-gray-100 rounded-lg overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#6A55F8] to-[#8B7BFA] flex items-center px-3 text-white text-sm font-semibold transition-all"
                  style={{ width: `${width}%` }}
                >
                  {s.count}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Главный компонент ────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const params = useParams()
  const projectId = params.id as string
  const [activeTab, setActiveTab] = useState<'overview' | 'funnels' | 'cross' | 'sources'>('overview')

  const tabs = [
    { id: 'overview' as const, label: 'Обзор' },
    { id: 'funnels' as const, label: 'Воронки' },
    { id: 'cross' as const, label: 'Сквозная' },
    { id: 'sources' as const, label: 'Источники трафика' },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Аналитика</h1>
        <p className="text-sm text-gray-500 mt-0.5">Общий обзор проекта</p>
      </div>

      {/* Вкладки */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            style={activeTab === tab.id ? { borderColor: '#6A55F8', color: '#6A55F8' } : {}}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab projectId={projectId} />}
      {activeTab === 'funnels' && <FunnelsTab projectId={projectId} />}
      {activeTab === 'cross' && <CrossAnalyticsTab projectId={projectId} />}
      {activeTab === 'sources' && <SourcesTab projectId={projectId} />}
    </div>
  )
}
