'use client'

// Дашборд «Источники» — атрибуция трафика по first_touch_*.
// Показывает: лидов / в воронке / клиентов / выручка / средний чек / конверсия
// в разрезе UTM source, UTM campaign, kind, источника.

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  CustomerRow, deriveClientType, FIRST_TOUCH_KIND_LABELS, formatMoney,
} from '@/lib/users/config'

type GroupKey = 'utm_source' | 'utm_campaign' | 'utm_medium' | 'first_touch_kind' | 'first_touch_source'
type Period = 'all' | '7d' | '30d' | '90d'

const GROUP_LABELS: Record<GroupKey, string> = {
  utm_source:        'UTM Source',
  utm_campaign:      'UTM Campaign',
  utm_medium:        'UTM Medium',
  first_touch_kind:  'Тип входа',
  first_touch_source: 'Источник',
}

const PERIOD_LABELS: Record<Period, string> = {
  all:  'Всё время',
  '7d': '7 дней',
  '30d': '30 дней',
  '90d': '90 дней',
}

type Row = {
  key: string
  display: string
  leads: number
  in_funnel: number
  paid: number
  revenue: number
  avgCheck: number
  conversion: number
}

export default function SourcesPage() {
  const supabase = createClient()
  const params = useParams()
  const projectId = params.id as string

  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [groupBy, setGroupBy] = useState<GroupKey>('first_touch_source')
  const [period, setPeriod] = useState<Period>('30d')
  const [sortKey, setSortKey] = useState<keyof Row>('revenue')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [cRes, aRes] = await Promise.all([
        supabase.from('customers').select('*').eq('project_id', projectId),
        supabase
          .from('customer_aggregates')
          .select('customer_id, has_paid, revenue, in_funnel')
          .eq('project_id', projectId),
      ])
      type Agg = { customer_id: string; has_paid: boolean; revenue: number; in_funnel: boolean }
      const aggMap = new Map<string, Agg>(
        ((aRes.data ?? []) as Agg[]).map(a => [a.customer_id, a])
      )
      const merged = ((cRes.data ?? []) as CustomerRow[]).map(c => ({
        ...c,
        ...(aggMap.get(c.id) ?? {}),
      })) as CustomerRow[]
      setCustomers(merged)
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // Фильтрация по периоду
  const inPeriod = useMemo(() => {
    if (period === 'all') return customers
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    return customers.filter(c => {
      const ts = c.first_touch_at ? new Date(c.first_touch_at).getTime() : new Date(c.created_at).getTime()
      return ts >= cutoff
    })
  }, [customers, period])

  // Группировка
  const rows = useMemo(() => {
    function getGroupKey(c: CustomerRow): { key: string; display: string } {
      if (groupBy === 'first_touch_kind') {
        const k = c.first_touch_kind ?? 'unknown'
        const meta = FIRST_TOUCH_KIND_LABELS[k]
        return { key: k, display: meta ? `${meta.icon} ${meta.label}` : '— Неизвестно' }
      }
      if (groupBy === 'first_touch_source') {
        const s = c.first_touch_source
        if (!s) return { key: '__unknown__', display: '— Неизвестный источник' }
        if (s === 'direct') return { key: 'direct', display: '↗ Прямой заход' }
        return { key: s, display: s }
      }
      // UTM
      const utm = c.first_touch_utm
      const v = utm?.[groupBy]
      if (!v) return { key: '__none__', display: `— Без ${GROUP_LABELS[groupBy]}` }
      return { key: v, display: v }
    }

    const groups = new Map<string, Row>()
    for (const c of inPeriod) {
      const g = getGroupKey(c)
      let row = groups.get(g.key)
      if (!row) {
        row = { key: g.key, display: g.display, leads: 0, in_funnel: 0, paid: 0, revenue: 0, avgCheck: 0, conversion: 0 }
        groups.set(g.key, row)
      }
      row.leads += 1
      if (c.in_funnel) row.in_funnel += 1
      if (c.has_paid) row.paid += 1
      row.revenue += c.revenue ?? 0
    }
    for (const r of groups.values()) {
      r.avgCheck = r.paid > 0 ? Math.round(r.revenue / r.paid) : 0
      r.conversion = r.leads > 0 ? Math.round((r.paid / r.leads) * 1000) / 10 : 0
    }
    const arr = Array.from(groups.values())
    arr.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      const va = a[sortKey]
      const vb = b[sortKey]
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb)) * dir
    })
    return arr
  }, [inPeriod, groupBy, sortKey, sortDir])

  const totals = useMemo(() => {
    const t = { leads: 0, in_funnel: 0, paid: 0, revenue: 0, conversion: 0 }
    for (const r of rows) {
      t.leads += r.leads
      t.in_funnel += r.in_funnel
      t.paid += r.paid
      t.revenue += r.revenue
    }
    t.conversion = t.leads > 0 ? Math.round((t.paid / t.leads) * 1000) / 10 : 0
    return t
  }, [rows])

  function sortBy(k: keyof Row) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('desc') }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Источники</h1>
          <p className="text-sm text-gray-500 mt-0.5">Атрибуция трафика и конверсия по точкам входа</p>
        </div>
      </div>

      {/* Сводка */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Metric label="Лидов" value={String(totals.leads)} />
        <Metric label="В воронке" value={String(totals.in_funnel)} />
        <Metric label="Клиентов" value={String(totals.paid)} highlight />
        <Metric label="Выручка" value={formatMoney(totals.revenue)} highlight />
        <Metric label="Конверсия" value={`${totals.conversion}%`} />
      </div>

      {/* Контролы */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg p-1">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
                period === p ? 'bg-[#6A55F8] text-white font-medium' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Группировка:</span>
          <select
            value={groupBy}
            onChange={e => setGroupBy(e.target.value as GroupKey)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#6A55F8] bg-white"
          >
            {(Object.keys(GROUP_LABELS) as GroupKey[]).map(k => (
              <option key={k} value={k}>{GROUP_LABELS[k]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Таблица */}
      {loading ? (
        <div className="text-sm text-gray-400">Загрузка…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-3">📭</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Нет данных за период</h3>
          <p className="text-sm text-gray-500">Выберите другой период или дождитесь первых лидов</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-left text-xs text-gray-500">
                <th className="px-4 py-3 font-medium">{GROUP_LABELS[groupBy]}</th>
                <ThSortable label="Лидов" k="leads" sortKey={sortKey} sortDir={sortDir} onClick={sortBy} />
                <ThSortable label="В воронке" k="in_funnel" sortKey={sortKey} sortDir={sortDir} onClick={sortBy} />
                <ThSortable label="Клиентов" k="paid" sortKey={sortKey} sortDir={sortDir} onClick={sortBy} />
                <ThSortable label="Выручка" k="revenue" sortKey={sortKey} sortDir={sortDir} onClick={sortBy} />
                <ThSortable label="Средний чек" k="avgCheck" sortKey={sortKey} sortDir={sortDir} onClick={sortBy} />
                <ThSortable label="Конверсия" k="conversion" sortKey={sortKey} sortDir={sortDir} onClick={sortBy} />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key} className="border-b border-gray-50 last:border-0 hover:bg-[#FAFAFD]">
                  <td className="px-4 py-3 text-gray-800 font-medium">{r.display}</td>
                  <td className="px-4 py-3 text-gray-700">{r.leads}</td>
                  <td className="px-4 py-3 text-gray-700">{r.in_funnel}</td>
                  <td className="px-4 py-3 text-gray-700 font-medium">{r.paid}</td>
                  <td className="px-4 py-3 text-gray-900 font-semibold">{formatMoney(r.revenue)}</td>
                  <td className="px-4 py-3 text-gray-600">{r.avgCheck > 0 ? formatMoney(r.avgCheck) : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-medium ${
                      r.conversion >= 10 ? 'text-green-600' : r.conversion >= 3 ? 'text-amber-600' : 'text-gray-500'
                    }`}>
                      {r.conversion}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl px-4 py-3 ${highlight ? 'bg-gradient-to-br from-[#F0EDFF] to-[#E5DFFF] border border-[#D8CFFF]' : 'bg-white border border-gray-100'}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-bold mt-1 ${highlight ? 'text-[#6A55F8]' : 'text-gray-900'}`}>{value}</div>
    </div>
  )
}

function ThSortable({
  label, k, sortKey, sortDir, onClick,
}: {
  label: string
  k: keyof Row
  sortKey: keyof Row
  sortDir: 'asc' | 'desc'
  onClick: (k: keyof Row) => void
}) {
  const active = sortKey === k
  return (
    <th
      onClick={() => onClick(k)}
      className="px-4 py-3 font-medium cursor-pointer hover:text-gray-800 select-none"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && <span className="text-[#6A55F8]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
  )
}

// Используем deriveClientType для возможных будущих метрик (preserved для линтера)
void deriveClientType
