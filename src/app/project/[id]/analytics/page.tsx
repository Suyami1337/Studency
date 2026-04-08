'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { SkeletonList } from '@/components/ui/Skeleton'

const supabase = createClient()

type Funnel = {
  id: string
  name: string
  customer_count?: number
}

type Bot = {
  id: string
  name: string
  scenario_count?: number
}

type Landing = {
  id: string
  name: string
  visits: number
  conversions: number
}

type Product = {
  id: string
  name: string
  order_count?: number
  revenue?: number
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

export default function AnalyticsPage() {
  const params = useParams()
  const projectId = params.id as string

  const [loading, setLoading] = useState(true)
  const [totalCustomers, setTotalCustomers] = useState(0)
  const [totalOrders, setTotalOrders] = useState(0)
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [totalVisits, setTotalVisits] = useState(0)
  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [bots, setBots] = useState<Bot[]>([])
  const [landings, setLandings] = useState<Landing[]>([])
  const [products, setProducts] = useState<Product[]>([])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAll() }, [projectId])

  async function loadAll() {
    const [
      customersRes,
      ordersRes,
      revenueRes,
      visitsRes,
      funnelsRes,
      botsRes,
      landingsRes,
      productsRes,
      funnelPositionsRes,
      scenariosRes,
      ordersDetailRes,
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

    // Summary stats
    setTotalCustomers(customersRes.count ?? 0)
    setTotalOrders(ordersRes.count ?? 0)

    const rev = (revenueRes.data ?? []).reduce((s, o) => s + (o.paid_amount ?? 0), 0)
    setTotalRevenue(rev)

    const visits = (visitsRes.data ?? []).reduce((s, l) => s + (l.visits ?? 0), 0)
    setTotalVisits(visits)

    // Funnels with customer counts — O(n) with Map
    if (funnelsRes.data) {
      const positionMap = new Map<string, number>()
      for (const p of (funnelPositionsRes.data ?? [])) {
        positionMap.set(p.funnel_id, (positionMap.get(p.funnel_id) ?? 0) + 1)
      }
      const counted = funnelsRes.data.map(f => ({
        ...f,
        customer_count: positionMap.get(f.id) ?? 0,
      }))
      setFunnels(counted)
    }

    // Bots with scenario counts — O(n) with Map
    if (botsRes.data) {
      const scenarioMap = new Map<string, number>()
      for (const s of (scenariosRes.data ?? [])) {
        scenarioMap.set(s.bot_id, (scenarioMap.get(s.bot_id) ?? 0) + 1)
      }
      const counted = botsRes.data.map(b => ({
        ...b,
        scenario_count: scenarioMap.get(b.id) ?? 0,
      }))
      setBots(counted)
    }

    // Landings
    if (landingsRes.data) setLandings(landingsRes.data as Landing[])

    // Products with order counts + revenue — O(n) with Map
    if (productsRes.data) {
      const orderCountMap = new Map<string, number>()
      const revenueMap = new Map<string, number>()
      for (const o of (ordersDetailRes.data ?? [])) {
        if (!o.product_id) continue
        orderCountMap.set(o.product_id, (orderCountMap.get(o.product_id) ?? 0) + 1)
        if (o.status === 'paid') {
          revenueMap.set(o.product_id, (revenueMap.get(o.product_id) ?? 0) + (o.paid_amount ?? 0))
        }
      }
      const counted = productsRes.data.map(p => ({
        ...p,
        order_count: orderCountMap.get(p.id) ?? 0,
        revenue: revenueMap.get(p.id) ?? 0,
      }))
      setProducts(counted)
    }

    setLoading(false)
  }

  if (loading) {
    return (
      <div className="p-6">
        <SkeletonList count={3} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Аналитика</h1>
        <p className="text-sm text-gray-500 mt-0.5">Общий обзор проекта</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Клиентов" value={totalCustomers} icon="👥" />
        <StatCard label="Заказов" value={totalOrders} icon="🧾" />
        <StatCard label="Выручка" value={formatMoney(totalRevenue)} sub="только оплаченные" icon="💰" />
        <StatCard label="Посещений сайтов" value={totalVisits.toLocaleString('ru-RU')} icon="🌐" />
      </div>

      {/* Funnels */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">По воронкам</h2>
        {funnels.length === 0 ? (
          <p className="text-sm text-gray-400">Воронок пока нет</p>
        ) : (
          <div className="space-y-2">
            {funnels.map(f => (
              <div key={f.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#6A55F8' }} />
                  <span className="text-sm font-medium text-gray-800">{f.name}</span>
                </div>
                <span className="text-sm text-gray-500 font-medium">
                  {f.customer_count} {f.customer_count === 1 ? 'клиент' : (f.customer_count ?? 0) < 5 ? 'клиента' : 'клиентов'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bots */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">По ботам</h2>
        {bots.length === 0 ? (
          <p className="text-sm text-gray-400">Ботов пока нет</p>
        ) : (
          <div className="space-y-2">
            {bots.map(b => (
              <div key={b.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#10B981' }} />
                  <span className="text-sm font-medium text-gray-800">{b.name}</span>
                </div>
                <span className="text-sm text-gray-500 font-medium">
                  {b.scenario_count} {b.scenario_count === 1 ? 'сценарий' : (b.scenario_count ?? 0) < 5 ? 'сценария' : 'сценариев'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sites / Landings */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">По сайтам</h2>
        {landings.length === 0 ? (
          <p className="text-sm text-gray-400">Сайтов пока нет</p>
        ) : (
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

      {/* Products */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">По продуктам</h2>
        {products.length === 0 ? (
          <p className="text-sm text-gray-400">Продуктов пока нет</p>
        ) : (
          <div className="space-y-2">
            {products.map(p => (
              <div key={p.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#EF4444' }} />
                  <span className="text-sm font-medium text-gray-800">{p.name}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span>{p.order_count} {p.order_count === 1 ? 'заказ' : (p.order_count ?? 0) < 5 ? 'заказа' : 'заказов'}</span>
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
