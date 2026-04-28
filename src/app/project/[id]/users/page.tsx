'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { SkeletonList } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import FiltersBar from '@/components/users/FiltersBar'
import {
  COLUMNS, ColumnId, CustomerRow, FilterState, EMPTY_FILTER_STATE, normalizeFilterState,
  DEFAULT_VISIBLE_COLUMNS, DEFAULT_SORT,
  Segment, SortDirection, DynamicFilterOptions, EMPTY_DYNAMIC_OPTIONS,
  applyFilters, sortRows, deriveClientType, CLIENT_TYPE_LABELS, CLIENT_TYPE_COLOR,
  FIRST_TOUCH_KIND_LABELS, customerDisplayName, customerAvatarLetter,
  formatDateTime, formatRelative, formatMoney, exportToCSV, downloadCSV, cellValue,
} from '@/lib/users/config'

const STORAGE_KEY = (pid: string) => `studency.users.activeSegment.${pid}`

export default function UsersPage() {
  const supabase = createClient()
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = params.id as string

  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  const [loading, setLoading] = useState(true)

  const [filterState, setFilterState] = useState<FilterState>(EMPTY_FILTER_STATE)
  const [visibleColumns, setVisibleColumns] = useState<ColumnId[]>(DEFAULT_VISIBLE_COLUMNS)
  const [sort, setSort] = useState<{ column: ColumnId; direction: SortDirection }>(DEFAULT_SORT)
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [dynamicOptions, setDynamicOptions] = useState<DynamicFilterOptions>(EMPTY_DYNAMIC_OPTIONS)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showCreate, setShowCreate] = useState(false)
  const [bulkAction, setBulkAction] = useState<null | 'tag' | 'broadcast' | 'export'>(null)

  // Старая ссылка ?open=customerId → редирект на /users/<id>
  useEffect(() => {
    const open = searchParams.get('open')
    if (open) router.replace(`/project/${projectId}/users/${open}`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, projectId])

  async function loadAll() {
    setLoading(true)
    const [cRes, aRes, sRes, botsRes, channelsRes, productsRes, convRes, subsRes, ordersRes] = await Promise.all([
      supabase.from('customers_with_role').select('*').eq('project_id', projectId),
      supabase.from('customer_aggregates').select('customer_id, last_activity_at, orders_count, revenue, has_paid, in_funnel').eq('project_id', projectId),
      supabase.from('customer_segments').select('*').eq('project_id', projectId).order('created_at', { ascending: true }),
      supabase.from('telegram_bots').select('id, name').eq('project_id', projectId).order('name'),
      supabase.from('social_accounts').select('id, external_title, external_username, platform').eq('project_id', projectId).eq('is_active', true).order('external_title'),
      supabase.from('products').select('id, name').eq('project_id', projectId).eq('is_active', true).order('name'),
      // Подписки на ботов: chatbot_conversations(customer_id, telegram_bot_id, chat_blocked).
      supabase.from('chatbot_conversations').select('customer_id, telegram_bot_id, chat_blocked').not('customer_id', 'is', null),
      // Подписки на каналы: social_subscribers_log(customer_id, account_id, action).
      supabase.from('social_subscribers_log').select('customer_id, account_id, action').not('customer_id', 'is', null),
      // Купленные продукты: orders(customer_id, product_id, status='paid')
      supabase.from('orders').select('customer_id, product_id').eq('project_id', projectId).eq('status', 'paid').not('customer_id', 'is', null),
    ])

    type AggregateRow = { customer_id: string; last_activity_at: string | null; orders_count: number; revenue: number; has_paid: boolean; in_funnel: boolean }
    const aggMap = new Map<string, AggregateRow>(
      ((aRes.data ?? []) as AggregateRow[]).map(a => [a.customer_id, a])
    )

    // Бот-подписки: разделяем на subscribed (chat_blocked=false) и blocked (chat_blocked=true)
    const subBots = new Map<string, Set<string>>()
    const blockedBots = new Map<string, Set<string>>()
    type ConvRow = { customer_id: string; telegram_bot_id: string; chat_blocked: boolean | null }
    ;((convRes.data ?? []) as ConvRow[]).forEach(c => {
      const target = c.chat_blocked ? blockedBots : subBots
      if (!target.has(c.customer_id)) target.set(c.customer_id, new Set())
      target.get(c.customer_id)!.add(c.telegram_bot_id)
    })

    // Канал-подписки: последнее действие на канале (subscribe/unsubscribe).
    // Группируем по (customer_id, account_id) и берём последнее. Здесь просто
    // считаем подписан если есть запись с action='subscribe' и нет более позднего unsubscribe.
    type SubRow = { customer_id: string; account_id: string; action: string | null }
    const subChannelsMap = new Map<string, Map<string, string>>()  // customer → account → last_action
    ;((subsRes.data ?? []) as SubRow[]).forEach(s => {
      if (!subChannelsMap.has(s.customer_id)) subChannelsMap.set(s.customer_id, new Map())
      subChannelsMap.get(s.customer_id)!.set(s.account_id, s.action ?? '')
    })
    const subChannels = new Map<string, Set<string>>()
    subChannelsMap.forEach((m, cid) => {
      const set = new Set<string>()
      m.forEach((action, aid) => {
        if (action !== 'unsubscribe' && action !== 'left') set.add(aid)
      })
      if (set.size > 0) subChannels.set(cid, set)
    })

    // Купленные продукты
    type OrdRow = { customer_id: string; product_id: string | null }
    const paidProducts = new Map<string, Set<string>>()
    ;((ordersRes.data ?? []) as OrdRow[]).forEach(o => {
      if (!o.product_id) return
      if (!paidProducts.has(o.customer_id)) paidProducts.set(o.customer_id, new Set())
      paidProducts.get(o.customer_id)!.add(o.product_id)
    })

    const merged = ((cRes.data ?? []) as CustomerRow[]).map(c => ({
      ...c,
      ...(aggMap.get(c.id) ?? {}),
      subscribed_bot_ids: Array.from(subBots.get(c.id) ?? []),
      blocked_bot_ids: Array.from(blockedBots.get(c.id) ?? []),
      subscribed_channel_ids: Array.from(subChannels.get(c.id) ?? []),
      paid_product_ids: Array.from(paidProducts.get(c.id) ?? []),
    })) as CustomerRow[]
    setCustomers(merged)
    setSegments(((sRes.data ?? []) as Segment[]))

    // Dynamic options для модалки фильтров
    const allTags = new Set<string>()
    merged.forEach(c => (c.tags ?? []).forEach(t => allTags.add(t)))
    type BotRow = { id: string; name: string | null }
    type ChannelRow = { id: string; external_title: string | null; external_username: string | null; platform: string | null }
    type ProductRow = { id: string; name: string | null }
    setDynamicOptions({
      bots: ((botsRes.data ?? []) as BotRow[]).map(b => ({ value: b.id, label: b.name || `Бот #${b.id.slice(0, 8)}` })),
      channels: ((channelsRes.data ?? []) as ChannelRow[]).map(ch => ({
        value: ch.id,
        label: ch.external_title || (ch.external_username ? `@${ch.external_username}` : `${ch.platform ?? 'канал'} #${ch.id.slice(0, 8)}`),
      })),
      products: ((productsRes.data ?? []) as ProductRow[]).map(p => ({ value: p.id, label: p.name || `Продукт #${p.id.slice(0, 8)}` })),
      tags: Array.from(allTags).sort().map(t => ({ value: t, label: t })),
    })

    // Восстановим активный сегмент из localStorage
    const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY(projectId)) : null
    const savedSeg = saved ? (sRes.data ?? []).find((s: Segment) => s.id === saved) : null
    if (savedSeg) {
      applySegment(savedSeg as Segment)
    }
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAll() }, [projectId])

  function applySegment(s: Segment | null) {
    if (s) {
      setFilterState(normalizeFilterState(s.filters as unknown))
      setVisibleColumns(s.visible_columns.length > 0 ? s.visible_columns : DEFAULT_VISIBLE_COLUMNS)
      setSort(s.sort)
      setActiveSegmentId(s.id)
      if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY(projectId), s.id)
    } else {
      setFilterState(EMPTY_FILTER_STATE)
      setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)
      setSort(DEFAULT_SORT)
      setActiveSegmentId(null)
      if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY(projectId))
    }
  }

  // dirty: текущее состояние отличается от активного сегмента
  const isDirty = useMemo(() => {
    if (!activeSegmentId) return false
    const s = segments.find(x => x.id === activeSegmentId)
    if (!s) return false
    return (
      JSON.stringify(normalizeFilterState(s.filters as unknown)) !== JSON.stringify(filterState) ||
      JSON.stringify(s.visible_columns) !== JSON.stringify(visibleColumns) ||
      s.sort.column !== sort.column ||
      s.sort.direction !== sort.direction
    )
  }, [activeSegmentId, segments, filterState, visibleColumns, sort])

  async function saveCurrentSegment() {
    if (!activeSegmentId) return
    const { data } = await supabase
      .from('customer_segments')
      .update({
        filters: filterState,
        visible_columns: visibleColumns,
        sort,
        updated_at: new Date().toISOString(),
      })
      .eq('id', activeSegmentId)
      .select()
      .single()
    if (data) setSegments(prev => prev.map(s => s.id === data.id ? (data as Segment) : s))
  }

  async function saveAsNewSegment(name?: string) {
    const finalName = name?.trim() || window.prompt('Имя нового сегмента:')?.trim()
    if (!finalName) return
    const { data } = await supabase
      .from('customer_segments')
      .insert({
        project_id: projectId,
        name: finalName,
        filters: filterState,
        visible_columns: visibleColumns,
        sort,
      })
      .select()
      .single()
    if (data) {
      const seg = data as Segment
      setSegments(prev => [...prev, seg])
      setActiveSegmentId(seg.id)
      if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY(projectId), seg.id)
    }
  }

  async function deleteSegment(id: string) {
    await supabase.from('customer_segments').delete().eq('id', id)
    setSegments(prev => prev.filter(s => s.id !== id))
    if (activeSegmentId === id) applySegment(null)
  }

  async function renameSegment(id: string, name: string) {
    const { data } = await supabase
      .from('customer_segments')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (data) setSegments(prev => prev.map(s => s.id === id ? (data as Segment) : s))
  }

  function resetToSegment() {
    const s = segments.find(x => x.id === activeSegmentId)
    if (s) applySegment(s)
  }

  // ── Filtering & sorting ──
  const visibleRows = useMemo(() => {
    let filtered = applyFilters(customers, filterState)
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      filtered = filtered.filter(r =>
        (r.full_name ?? '').toLowerCase().includes(q) ||
        (r.email ?? '').toLowerCase().includes(q) ||
        (r.phone ?? '').toLowerCase().includes(q) ||
        (r.telegram_username ?? '').toLowerCase().includes(q) ||
        (r.public_code ?? '').toLowerCase().includes(q) ||
        (r.instagram ?? '').toLowerCase().includes(q) ||
        (r.vk ?? '').toLowerCase().includes(q) ||
        (r.whatsapp ?? '').toLowerCase().includes(q) ||
        (r.role_label ?? '').toLowerCase().includes(q),
      )
    }
    return sortRows(filtered, sort.column, sort.direction)
  }, [customers, filterState, sort, searchQuery])

  // ── Selection ──
  function toggleSelected(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  function toggleSelectAll() {
    if (selectedIds.size === visibleRows.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(visibleRows.map(r => r.id)))
    }
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  const selectedRows = useMemo(
    () => visibleRows.filter(r => selectedIds.has(r.id)),
    [visibleRows, selectedIds]
  )

  // ── Render ──
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Пользователи</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? '…' : (
              filterState.conditions.length === 0 && !activeSegmentId
                ? `Всего: ${customers.length}`
                : `Показано ${visibleRows.length} из ${customers.length}`
            )}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Добавить пользователя
        </button>
      </div>

      {/* Поиск */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Поиск по имени, email, телефону, Telegram, ID (#1234)…"
          className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8] bg-white"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0z"/>
        </svg>
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
            aria-label="Очистить"
          >
            ✕
          </button>
        )}
      </div>

      {/* Filters & segments */}
      <FiltersBar
        segments={segments}
        activeSegmentId={activeSegmentId}
        isDirty={isDirty}
        filterState={filterState}
        visibleColumns={visibleColumns}
        sort={sort}
        dynamicOptions={dynamicOptions}
        onChangeFilterState={setFilterState}
        onChangeColumns={setVisibleColumns}
        onChangeSort={setSort}
        onSelectSegment={id => {
          if (id === null) applySegment(null)
          else {
            const s = segments.find(x => x.id === id)
            if (s) applySegment(s)
          }
        }}
        onSaveCurrent={saveCurrentSegment}
        onSaveAsNew={saveAsNewSegment}
        onResetToSegment={resetToSegment}
        onDeleteSegment={deleteSegment}
        onRenameSegment={renameSegment}
      />

      {/* Table */}
      {loading ? (
        <SkeletonList count={3} />
      ) : visibleRows.length === 0 ? (
        <EmptyState empty={customers.length === 0} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                <tr className="text-left text-xs text-gray-500">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === visibleRows.length && visibleRows.length > 0}
                      ref={el => {
                        if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < visibleRows.length
                      }}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300"
                    />
                  </th>
                  {visibleColumns.map(colId => {
                    const def = COLUMNS.find(c => c.id === colId)
                    if (!def) return null
                    const isSorted = sort.column === colId
                    return (
                      <th
                        key={colId}
                        className={`px-4 py-3 font-medium ${def.sortable ? 'cursor-pointer hover:text-gray-800' : ''}`}
                        onClick={def.sortable ? () => {
                          setSort(prev => ({
                            column: colId,
                            direction: prev.column === colId && prev.direction === 'desc' ? 'asc' : 'desc',
                          }))
                        } : undefined}
                      >
                        <span className="inline-flex items-center gap-1">
                          {def.label}
                          {def.sortable && isSorted && (
                            <span className="text-[#6A55F8]">{sort.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(c => {
                  const isSelected = selectedIds.has(c.id)
                  return (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/project/${projectId}/users/${c.id}`)}
                      className={`border-b border-gray-50 last:border-0 cursor-pointer transition-colors ${
                        isSelected ? 'bg-[#F0EDFF]' : 'hover:bg-[#FAFAFD]'
                      }`}
                    >
                      <td className="px-4 py-3 w-10" onClick={e => { e.stopPropagation(); toggleSelected(c.id) }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="rounded border-gray-300"
                        />
                      </td>
                      {visibleColumns.map(colId => (
                        <td key={colId} className="px-4 py-3 text-gray-700">
                          <Cell row={c} colId={colId} />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white border border-gray-200 shadow-2xl rounded-2xl py-3 px-4 flex items-center gap-3 z-40">
          <span className="text-sm font-medium text-gray-700">
            Выбрано: <span className="text-[#6A55F8]">{selectedIds.size}</span>
          </span>
          <div className="h-6 w-px bg-gray-200" />
          <button
            onClick={() => setBulkAction('tag')}
            className="text-sm px-3 py-1.5 rounded-lg bg-[#F0EDFF] text-[#6A55F8] font-medium hover:bg-[#E5DFFF]"
          >
            🏷 Добавить тег
          </button>
          <button
            onClick={() => setBulkAction('broadcast')}
            className="text-sm px-3 py-1.5 rounded-lg bg-[#F0EDFF] text-[#6A55F8] font-medium hover:bg-[#E5DFFF]"
          >
            📨 Запустить рассылку
          </button>
          <button
            onClick={() => setBulkAction('export')}
            className="text-sm px-3 py-1.5 rounded-lg bg-[#F0EDFF] text-[#6A55F8] font-medium hover:bg-[#E5DFFF]"
          >
            📥 Экспорт CSV
          </button>
          <div className="h-6 w-px bg-gray-200" />
          <button
            onClick={clearSelection}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            Снять выделение
          </button>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateCustomerModal
          projectId={projectId}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadAll() }}
        />
      )}

      {/* Bulk action modals */}
      {bulkAction === 'tag' && (
        <BulkAddTagModal
          rows={selectedRows}
          onClose={() => setBulkAction(null)}
          onApplied={() => {
            setBulkAction(null)
            clearSelection()
            loadAll()
          }}
        />
      )}
      {bulkAction === 'broadcast' && (
        <BulkBroadcastModal
          projectId={projectId}
          rows={selectedRows}
          onClose={() => setBulkAction(null)}
        />
      )}
      {bulkAction === 'export' && (() => {
        const csv = exportToCSV(selectedRows, visibleColumns)
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
        downloadCSV(csv, `users-${stamp}.csv`)
        setBulkAction(null)
        return null
      })()}
    </div>
  )
}

// ─── Cell ───
function Cell({ row, colId }: { row: CustomerRow; colId: ColumnId }) {
  switch (colId) {
    case 'name': {
      const display = customerDisplayName(row)
      const isCodeOnly = !row.full_name && !row.telegram_username
      return (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0" style={{ backgroundColor: '#6A55F8' }}>
            {customerAvatarLetter(row)}
          </div>
          <div className="min-w-0">
            <div className={`font-medium truncate ${isCodeOnly ? 'text-gray-500 font-mono text-xs' : 'text-gray-900'}`}>
              {display}
            </div>
            {row.is_blocked && <div className="text-xs text-red-500">Заблокирован</div>}
          </div>
        </div>
      )
    }
    case 'client_type': {
      const t = deriveClientType(row)
      const c = CLIENT_TYPE_COLOR[t]
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ backgroundColor: c.bg, color: c.fg }}>
          {CLIENT_TYPE_LABELS[t]}
        </span>
      )
    }
    case 'role': {
      if (!row.role_label) return <span className="text-gray-400">—</span>
      const isAdminPanel = row.role_access_type === 'admin_panel'
      const isStudent = row.role_access_type === 'student_panel'
      const colors = isAdminPanel
        ? { bg: '#EDE9FF', fg: '#6A55F8' }
        : isStudent
        ? { bg: '#D1FAE5', fg: '#059669' }
        : { bg: '#F1F5F9', fg: '#64748B' }
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ backgroundColor: colors.bg, color: colors.fg }}>
          {row.role_label}
        </span>
      )
    }
    case 'email':    return <span className="text-gray-600">{row.email || '—'}</span>
    case 'phone':    return <span className="text-gray-600">{row.phone || '—'}</span>
    case 'telegram': return row.telegram_username
      ? <a onClick={e => e.stopPropagation()} href={`https://t.me/${row.telegram_username}`} target="_blank" rel="noreferrer" className="text-[#6A55F8] hover:underline">@{row.telegram_username}</a>
      : <span className="text-gray-400">—</span>
    case 'tags':     return row.tags && row.tags.length > 0 ? (
      <div className="flex flex-wrap gap-1">
        {row.tags.slice(0, 2).map(t => (
          <span key={t} className="px-1.5 py-0.5 rounded text-xs font-medium bg-[#F0EDFF] text-[#6A55F8]">{t}</span>
        ))}
        {row.tags.length > 2 && <span className="text-xs text-gray-400">+{row.tags.length - 2}</span>}
      </div>
    ) : <span className="text-gray-400">—</span>
    case 'created_at':       return <span className="text-gray-500">{formatDateTime(row.created_at)}</span>
    case 'last_activity_at': return <span className="text-gray-500" title={formatDateTime(row.last_activity_at ?? row.created_at)}>{formatRelative(row.last_activity_at ?? row.created_at)}</span>
    case 'source':           return <span className="text-gray-600">{row.source_name || '—'}</span>
    case 'first_touch': {
      const k = row.first_touch_kind
      const meta = k ? FIRST_TOUCH_KIND_LABELS[k] : null
      if (!meta) return <span className="text-gray-400">—</span>
      const utmCampaign = row.first_touch_utm?.utm_campaign
      const rawSrc = row.first_touch_source
      const friendlySrc = !rawSrc ? 'Неизв.' : rawSrc === 'direct' ? 'Прямой' : rawSrc
      const detail = utmCampaign || friendlySrc
      return (
        <span className="inline-flex items-center gap-1 text-xs">
          <span title={meta.label}>{meta.icon}</span>
          <span className="text-gray-600 truncate max-w-[120px]" title={detail}>{detail}</span>
        </span>
      )
    }
    case 'orders_count':     return <span className="text-gray-700 font-medium">{row.orders_count ?? 0}</span>
    case 'revenue':          return <span className="text-gray-900 font-medium">{formatMoney(row.revenue ?? 0)}</span>
    case 'bot_subscribed':   return row.bot_subscribed ? <span>✅</span> : <span className="text-gray-300">—</span>
    case 'channel_subscribed': return row.channel_subscribed ? <span>✅</span> : <span className="text-gray-300">—</span>
    case 'in_funnel':        return row.in_funnel ? <span>✅</span> : <span className="text-gray-300">—</span>
    default: return <span>{String(cellValue(row, colId))}</span>
  }
}

// ─── Empty state ───
function EmptyState({ empty }: { empty: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
      <div className="text-4xl mb-3">👤</div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">
        {empty ? 'Пользователей пока нет' : 'Ничего не найдено'}
      </h3>
      <p className="text-sm text-gray-500">
        {empty ? 'Они появятся автоматически когда зайдут на ваш сайт или в бота'
              : 'Попробуйте изменить или сбросить фильтры'}
      </p>
    </div>
  )
}

// ─── Create modal ───
function CreateCustomerModal({ projectId, onClose, onCreated }: { projectId: string; onClose: () => void; onCreated: () => void }) {
  const supabase = createClient()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [telegram, setTelegram] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!name.trim() && !email.trim() && !phone.trim() && !telegram.trim()) {
      return setError('Заполните хотя бы одно поле')
    }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('customers').insert({
      project_id: projectId,
      full_name: name.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      telegram_username: telegram.trim().replace(/^@/, '') || null,
      is_blocked: false,
    })
    setSaving(false)
    if (err) return setError(err.message)
    onCreated()
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Новый пользователь"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-700">Отмена</button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: '#6A55F8' }}
          >
            {saving ? 'Создаю…' : 'Создать'}
          </button>
        </>
      }
    >
      <div className="p-5 space-y-3">
        <Input label="Имя" value={name} onChange={setName} />
        <Input label="Email" value={email} onChange={setEmail} type="email" />
        <Input label="Телефон" value={phone} onChange={setPhone} type="tel" />
        <Input label="Telegram" value={telegram} onChange={setTelegram} />
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </Modal>
  )
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6A55F8]"
      />
    </label>
  )
}

// ─── Bulk: add tag ───
function BulkAddTagModal({ rows, onClose, onApplied }: { rows: CustomerRow[]; onClose: () => void; onApplied: () => void }) {
  const supabase = createClient()
  const [tag, setTag] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function apply() {
    const t = tag.trim()
    if (!t) return setError('Введите название тега')
    setSaving(true)
    setError('')
    // Применяем по одному, чтобы корректно дополнять массив
    let okCount = 0
    for (const r of rows) {
      const next = Array.from(new Set([...(r.tags ?? []), t]))
      const { error: e } = await supabase.from('customers').update({ tags: next }).eq('id', r.id)
      if (!e) okCount++
    }
    setSaving(false)
    if (okCount === 0) return setError('Не удалось применить тег')
    onApplied()
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Добавить тег ${rows.length} ${rows.length === 1 ? 'пользователю' : 'пользователям'}`}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-700">Отмена</button>
          <button onClick={apply} disabled={saving} className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#6A55F8' }}>
            {saving ? 'Применяю…' : 'Добавить тег'}
          </button>
        </>
      }
    >
      <div className="p-5 space-y-3">
        <Input label="Название тега" value={tag} onChange={setTag} />
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </Modal>
  )
}

// ─── Bulk: broadcast (preview + переход в /broadcasts с предзаполненной выборкой) ───
function BulkBroadcastModal({ projectId, rows, onClose }: { projectId: string; rows: CustomerRow[]; onClose: () => void }) {
  const router = useRouter()
  const withTelegram = rows.filter(r => r.telegram_id || r.telegram_username).length
  const withEmail = rows.filter(r => r.email).length

  function go(channel: 'telegram' | 'email') {
    const ids = rows.map(r => r.id).join(',')
    // Передаём список через URL параметр; страница рассылок может его прочитать
    router.push(`/project/${projectId}/broadcasts?segment=manual&ids=${ids}&channel=${channel}`)
    onClose()
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Рассылка по ${rows.length} ${rows.length === 1 ? 'пользователю' : 'пользователям'}`}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-700">Отмена</button>
        </>
      }
    >
      <div className="p-5 space-y-3 text-sm">
        <p className="text-gray-700">Кому из выделенных можно отправить:</p>
        <ul className="space-y-1 text-gray-700">
          <li>📨 Telegram: <b>{withTelegram}</b></li>
          <li>✉️ Email: <b>{withEmail}</b></li>
        </ul>
        <p className="text-xs text-gray-500">Сейчас вас перенесёт в раздел «Рассылки» с предзаполненной выборкой получателей.</p>
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => go('telegram')}
            disabled={withTelegram === 0}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-30"
            style={{ backgroundColor: '#6A55F8' }}
          >
            📨 Telegram
          </button>
          <button
            onClick={() => go('email')}
            disabled={withEmail === 0}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-30"
            style={{ backgroundColor: '#6A55F8' }}
          >
            ✉️ Email
          </button>
        </div>
      </div>
    </Modal>
  )
}
