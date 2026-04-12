'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { SkeletonList } from '@/components/ui/Skeleton'

const tagColors = ['bg-purple-100 text-purple-700', 'bg-amber-100 text-amber-700', 'bg-blue-100 text-blue-700', 'bg-green-100 text-green-700']

type Stage = {
  id: string; name: string; color: string; order_position: number
  automation_mode: string  // 'manual' | 'auto'
  require_from_previous: boolean
}
type StageRule = {
  id: string; stage_id: string; event_type: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filters: Record<string, any>; description: string | null; order_index: number
}
type Customer = {
  id: string; name: string; email: string | null; telegram: string | null
  stage_id: string; notes: string | null; source_name: string | null; source_slug: string | null
  full_name: string | null; phone: string | null
}
type Board = { id: string; name: string; project_id: string; created_at: string }
type MovementLog = {
  id: string; from_stage_id: string | null; to_stage_id: string
  moved_by: string; moved_by_user_id: string | null; rule_id: string | null
  created_at: string
}

const DEFAULT_STAGE_COLORS = ['#6A55F8', '#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316']
const EVENT_TYPES = [
  { value: 'bot_start', label: 'Запуск бота' },
  { value: 'bot_button_click', label: 'Нажал кнопку в боте' },
  { value: 'landing_visit', label: 'Посетил лендинг' },
  { value: 'form_submit', label: 'Заполнил форму' },
  { value: 'video_start', label: 'Начал смотреть видео' },
  { value: 'video_complete', label: 'Досмотрел видео' },
  { value: 'order_created', label: 'Создал заказ' },
  { value: 'order_paid', label: 'Оплатил заказ' },
  { value: 'button_click', label: 'Клик по кнопке на сайте' },
  { value: 'page_view', label: 'Просмотр страницы' },
]

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

// ═══════════════════════════════════════════════════════════════════════════
// CRM DETAIL — внутри одной доски
// ═══════════════════════════════════════════════════════════════════════════
function CrmDetail({ board, onBack }: { board: Board; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<'kanban' | 'table' | 'settings'>('kanban')
  const [stages, setStages] = useState<Stage[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [rules, setRules] = useState<StageRule[]>([])
  const [loading, setLoading] = useState(true)
  const [dragging, setDragging] = useState<{ customerId: string; fromStageId: string } | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [movementLogs, setMovementLogs] = useState<MovementLog[]>([])

  const supabase = createClient()

  const loadBoardData = useCallback(async () => {
    const [stagesRes, customersRes, rulesRes] = await Promise.all([
      supabase.from('crm_board_stages').select('*').eq('board_id', board.id).order('order_position'),
      supabase.from('customer_crm_positions')
        .select('id, stage_id, customer_id, customers(id, full_name, email, phone, telegram_username, notes, source_name, source_slug)')
        .eq('board_id', board.id),
      supabase.from('crm_stage_rules').select('*').in(
        'stage_id',
        (await supabase.from('crm_board_stages').select('id').eq('board_id', board.id)).data?.map((s: { id: string }) => s.id) ?? []
      ).order('order_index'),
    ])

    if (stagesRes.data) setStages(stagesRes.data as Stage[])
    if (customersRes.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const flat: Customer[] = customersRes.data.map((row: any) => {
        const c = row.customers
        return {
          id: c?.id ?? row.customer_id ?? row.id,
          name: c?.full_name ?? 'Без имени',
          full_name: c?.full_name ?? null,
          email: c?.email ?? null,
          phone: c?.phone ?? null,
          telegram: c?.telegram_username ?? null,
          stage_id: row.stage_id,
          notes: c?.notes ?? null,
          source_name: c?.source_name ?? null,
          source_slug: c?.source_slug ?? null,
        }
      })
      setCustomers(flat)
    }
    if (rulesRes.data) setRules(rulesRes.data as StageRule[])
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.id])

  useEffect(() => { loadBoardData() }, [loadBoardData])

  // ── Drag & Drop ────────────────────────────────────────────
  function handleDragStart(customerId: string, fromStageId: string) {
    setDragging({ customerId, fromStageId })
  }

  async function handleDrop(toStageId: string) {
    if (!dragging || dragging.fromStageId === toStageId) {
      setDragging(null)
      return
    }

    const { customerId, fromStageId } = dragging
    setDragging(null)

    // Optimistic update
    setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, stage_id: toStageId } : c))

    // Update DB
    await supabase.from('customer_crm_positions')
      .update({ stage_id: toStageId, updated_at: new Date().toISOString() })
      .eq('customer_id', customerId)
      .eq('board_id', board.id)

    // Write movement log
    await supabase.from('crm_movement_log').insert({
      customer_id: customerId,
      board_id: board.id,
      from_stage_id: fromStageId,
      to_stage_id: toStageId,
      moved_by: 'manual',
    })

    // Write customer action for timeline
    await supabase.from('customer_actions').insert({
      customer_id: customerId,
      project_id: board.project_id,
      action: 'crm_manual_move',
      data: { board_id: board.id, from_stage_id: fromStageId, to_stage_id: toStageId },
    })
  }

  // ── Customer detail modal ──────────────────────────────────
  async function openCustomerDetail(customer: Customer) {
    setSelectedCustomer(customer)
    const { data } = await supabase.from('crm_movement_log')
      .select('*')
      .eq('customer_id', customer.id)
      .eq('board_id', board.id)
      .order('created_at', { ascending: false })
      .limit(30)
    setMovementLogs((data ?? []) as MovementLog[])
  }

  // ── Tabs ───────────────────────────────────────────────────
  const tabs = [
    { id: 'kanban' as const, label: 'Канбан' },
    { id: 'table' as const, label: 'Таблица' },
    { id: 'settings' as const, label: 'Настройки' },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">← Назад</button>
        <div className="w-9 h-9 rounded-lg bg-[#F0EDFF] flex items-center justify-center text-lg">📊</div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{board.name}</h1>
          <p className="text-xs text-gray-500">{stages.length} этапов · {customers.length} клиентов</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-100">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${
              activeTab === tab.id ? 'border-[#6A55F8] text-[#6A55F8]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>{tab.label}</button>
        ))}
      </div>

      {loading ? <SkeletonList count={3} /> : (
        <>
          {/* ═══════════ KANBAN ═══════════ */}
          {activeTab === 'kanban' && (
            <div className="flex gap-3 overflow-x-auto pb-4">
              {stages.map(stage => {
                const stageCustomers = customers.filter(c => c.stage_id === stage.id)
                const isAuto = stage.automation_mode === 'auto'
                const stageRules = rules.filter(r => r.stage_id === stage.id)
                return (
                  <div
                    key={stage.id}
                    className={`min-w-[240px] w-[240px] flex-shrink-0 rounded-xl p-3 border ${
                      dragging ? 'border-[#6A55F8]/30 bg-[#F8F7FF]/50' : 'border-gray-100 bg-gray-50/80'
                    }`}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => handleDrop(stage.id)}
                  >
                    {/* Stage header */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                      <span className="text-sm font-semibold text-gray-700 truncate flex-1">{stage.name}</span>
                      {isAuto && (
                        <span className="text-[9px] font-semibold text-[#6A55F8] bg-[#F0EDFF] px-1.5 py-0.5 rounded-full flex-shrink-0" title={`${stageRules.length} правил`}>
                          ⚡ AUTO
                        </span>
                      )}
                      <span className="text-xs text-gray-400 bg-white rounded-full px-2 py-0.5 flex-shrink-0">{stageCustomers.length}</span>
                    </div>

                    {/* Customer cards */}
                    <div className="space-y-2">
                      {stageCustomers.map(customer => (
                        <div
                          key={customer.id}
                          draggable
                          onDragStart={() => handleDragStart(customer.id, stage.id)}
                          onClick={() => openCustomerDetail(customer)}
                          className="bg-white rounded-xl border border-gray-100 p-3 hover:shadow-sm transition-shadow cursor-grab active:cursor-grabbing"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-7 h-7 rounded-full bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8]">
                              {getInitials(customer.name)}
                            </div>
                            <span className="text-sm font-medium text-gray-900 leading-tight truncate">{customer.name}</span>
                          </div>
                          {customer.email && <p className="text-xs text-gray-500 truncate">{customer.email}</p>}
                          {customer.telegram && <p className="text-xs text-gray-400 truncate">@{customer.telegram}</p>}
                          {customer.source_name && (
                            <p className="text-xs mt-1">
                              <span className="bg-[#F0EDFF] text-[#6A55F8] rounded px-1.5 py-0.5">📍 {customer.source_name}</span>
                            </p>
                          )}
                        </div>
                      ))}
                      {stageCustomers.length === 0 && (
                        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
                          Нет клиентов
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              {stages.length === 0 && (
                <div className="flex-1 bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400 text-sm">
                  Добавьте этапы в разделе «Настройки»
                </div>
              )}
            </div>
          )}

          {/* ═══════════ TABLE ═══════════ */}
          {activeTab === 'table' && (
            customers.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400 text-sm">Нет клиентов</div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['Имя', 'Email', 'Телефон', 'Telegram', 'Источник', 'Этап'].map(h => (
                        <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map(customer => {
                      const stage = stages.find(s => s.id === customer.stage_id)
                      return (
                        <tr key={customer.id} onClick={() => openCustomerDetail(customer)}
                          className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8] flex-shrink-0">
                                {getInitials(customer.name)}
                              </div>
                              <span className="font-medium text-gray-900">{customer.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-500">{customer.email ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-500">{customer.phone ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-500">{customer.telegram ? `@${customer.telegram}` : '—'}</td>
                          <td className="px-4 py-3">
                            {customer.source_name
                              ? <span className="bg-[#F0EDFF] text-[#6A55F8] rounded px-2 py-0.5 text-xs">📍 {customer.source_name}</span>
                              : <span className="text-gray-400 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: stage?.color ?? '#94A3B8' }}>
                              {stage?.name ?? '—'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ═══════════ SETTINGS ═══════════ */}
          {activeTab === 'settings' && (
            <SettingsTab boardId={board.id} stages={stages} rules={rules} onReload={loadBoardData} />
          )}
        </>
      )}

      {/* ═══════════ CUSTOMER DETAIL MODAL ═══════════ */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedCustomer(null)}>
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#F0EDFF] flex items-center justify-center text-sm font-bold text-[#6A55F8]">
                  {getInitials(selectedCustomer.name)}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{selectedCustomer.name}</h3>
                  <p className="text-xs text-gray-500">{selectedCustomer.email ?? selectedCustomer.telegram ?? ''}</p>
                </div>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              {/* Current stage */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Текущий этап</p>
                <span className="rounded-full px-3 py-1 text-xs font-medium text-white"
                  style={{ backgroundColor: stages.find(s => s.id === selectedCustomer.stage_id)?.color ?? '#94A3B8' }}>
                  {stages.find(s => s.id === selectedCustomer.stage_id)?.name ?? '—'}
                </span>
              </div>

              {/* Contact info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {selectedCustomer.email && <div><p className="text-xs text-gray-500">Email</p><p className="text-gray-900">{selectedCustomer.email}</p></div>}
                {selectedCustomer.phone && <div><p className="text-xs text-gray-500">Телефон</p><p className="text-gray-900">{selectedCustomer.phone}</p></div>}
                {selectedCustomer.telegram && <div><p className="text-xs text-gray-500">Telegram</p><p className="text-gray-900">@{selectedCustomer.telegram}</p></div>}
                {selectedCustomer.source_name && <div><p className="text-xs text-gray-500">Источник</p><p className="text-gray-900">📍 {selectedCustomer.source_name}</p></div>}
              </div>

              {/* CRM Movement Log */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">📋 История перемещений по доске</p>
                {movementLogs.length === 0 ? (
                  <p className="text-xs text-gray-400">Нет перемещений</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {movementLogs.map(log => {
                      const from = stages.find(s => s.id === log.from_stage_id)
                      const to = stages.find(s => s.id === log.to_stage_id)
                      const isAuto = log.moved_by === 'automation'
                      return (
                        <div key={log.id} className="flex items-start gap-2 text-xs py-1.5 border-b border-gray-50 last:border-0">
                          <span className={`mt-0.5 flex-shrink-0 ${isAuto ? 'text-[#6A55F8]' : 'text-gray-400'}`}>
                            {isAuto ? '⚡' : '👤'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <span className="text-gray-600">
                              {from ? from.name : 'Новый'} → <span className="font-medium text-gray-900">{to?.name ?? '?'}</span>
                            </span>
                            <span className="ml-1.5 text-gray-400">
                              {isAuto ? '(авто)' : '(вручную)'}
                            </span>
                          </div>
                          <span className="text-gray-400 flex-shrink-0">
                            {new Date(log.created_at).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS TAB — настройки столбцов + правила автоматизации
// ═══════════════════════════════════════════════════════════════════════════
function SettingsTab({ boardId, stages, rules, onReload }: {
  boardId: string
  stages: Stage[]
  rules: StageRule[]
  onReload: () => void
}) {
  const supabase = createClient()
  const [newStageName, setNewStageName] = useState('')
  const [addingStage, setAddingStage] = useState(false)
  const [savingStage, setSavingStage] = useState(false)
  const [editingStageId, setEditingStageId] = useState<string | null>(null)

  // Rule editor state
  const [addingRuleForStage, setAddingRuleForStage] = useState<string | null>(null)
  const [newRuleEventType, setNewRuleEventType] = useState('bot_start')
  const [newRuleFilters, setNewRuleFilters] = useState<string>('{}')
  const [newRuleDescription, setNewRuleDescription] = useState('')

  async function addStage() {
    if (!newStageName.trim()) return
    const color = DEFAULT_STAGE_COLORS[stages.length % DEFAULT_STAGE_COLORS.length]
    setSavingStage(true)
    await supabase.from('crm_board_stages').insert({
      board_id: boardId, name: newStageName.trim(), color, order_position: stages.length,
      automation_mode: 'manual', require_from_previous: false,
    })
    setNewStageName('')
    setAddingStage(false)
    setSavingStage(false)
    onReload()
  }

  async function removeStage(stageId: string) {
    if (!confirm('Удалить этап? Все клиенты с этого этапа будут потеряны.')) return
    await supabase.from('crm_board_stages').delete().eq('id', stageId)
    onReload()
  }

  async function toggleAutomation(stageId: string, currentMode: string) {
    const newMode = currentMode === 'auto' ? 'manual' : 'auto'
    await supabase.from('crm_board_stages').update({ automation_mode: newMode }).eq('id', stageId)
    onReload()
  }

  async function toggleRequirePrevious(stageId: string, currentValue: boolean) {
    await supabase.from('crm_board_stages').update({ require_from_previous: !currentValue }).eq('id', stageId)
    onReload()
  }

  async function addRule(stageId: string) {
    let filters = {}
    try { filters = JSON.parse(newRuleFilters) } catch { /* ignore parse error */ }
    await supabase.from('crm_stage_rules').insert({
      stage_id: stageId,
      event_type: newRuleEventType,
      filters,
      description: newRuleDescription || null,
      order_index: rules.filter(r => r.stage_id === stageId).length,
    })
    setAddingRuleForStage(null)
    setNewRuleEventType('bot_start')
    setNewRuleFilters('{}')
    setNewRuleDescription('')
    onReload()
  }

  async function removeRule(ruleId: string) {
    await supabase.from('crm_stage_rules').delete().eq('id', ruleId)
    onReload()
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Этапы CRM-доски</h3>
        <p className="text-xs text-gray-500 mb-4">Настройте столбцы, включите автоматизацию и задайте правила для каждого этапа</p>

        <div className="space-y-3">
          {stages.map((stage, idx) => {
            const stageRules = rules.filter(r => r.stage_id === stage.id)
            const isAuto = stage.automation_mode === 'auto'
            const isExpanded = editingStageId === stage.id

            return (
              <div key={stage.id} className={`border rounded-xl overflow-hidden ${isAuto ? 'border-[#6A55F8]/20 bg-[#F8F7FF]/30' : 'border-gray-100'}`}>
                {/* Stage header */}
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setEditingStageId(isExpanded ? null : stage.id)}>
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                  <span className="text-sm font-medium text-gray-800 flex-1">{stage.name}</span>
                  {isAuto && <span className="text-[9px] font-semibold text-[#6A55F8] bg-[#F0EDFF] px-1.5 py-0.5 rounded-full">⚡ AUTO</span>}
                  {stage.require_from_previous && <span className="text-[9px] text-gray-400">из предыдущего</span>}
                  <span className="text-xs text-gray-400">#{idx + 1}</span>
                  <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                </div>

                {/* Expanded settings */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                    {/* Toggle auto */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-gray-700">Автоматизация</p>
                        <p className="text-[10px] text-gray-400">Клиенты перемещаются сюда автоматически по правилам</p>
                      </div>
                      <button onClick={() => toggleAutomation(stage.id, stage.automation_mode)}
                        className={`w-10 h-5 rounded-full transition-colors relative ${isAuto ? 'bg-[#6A55F8]' : 'bg-gray-200'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isAuto ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>

                    {/* Require from previous */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={stage.require_from_previous}
                        onChange={() => toggleRequirePrevious(stage.id, stage.require_from_previous)}
                        className="rounded border-gray-300 text-[#6A55F8]" />
                      <span className="text-xs text-gray-700">Только из предыдущего столбца</span>
                    </label>

                    {/* Rules (only if auto) */}
                    {isAuto && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-gray-700">Правила входа <span className="font-normal text-gray-400">(OR — достаточно одного)</span></p>

                        {stageRules.length === 0 && (
                          <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">Нет правил — автоматизация не сработает, добавьте хотя бы одно</p>
                        )}

                        {stageRules.map(rule => (
                          <div key={rule.id} className="flex items-start gap-2 bg-white border border-gray-100 rounded-lg p-2.5">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-800">
                                {EVENT_TYPES.find(e => e.value === rule.event_type)?.label ?? rule.event_type}
                              </p>
                              {rule.description && <p className="text-[10px] text-gray-500">{rule.description}</p>}
                              {Object.keys(rule.filters).length > 0 && (
                                <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                                  {Object.entries(rule.filters).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' AND ')}
                                </p>
                              )}
                            </div>
                            <button onClick={() => removeRule(rule.id)} className="text-xs text-gray-400 hover:text-red-500 mt-0.5">✕</button>
                          </div>
                        ))}

                        {/* Add rule form */}
                        {addingRuleForStage === stage.id ? (
                          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                            <select value={newRuleEventType} onChange={e => setNewRuleEventType(e.target.value)}
                              className="w-full px-2 py-1.5 rounded border border-gray-200 text-xs">
                              {EVENT_TYPES.map(et => <option key={et.value} value={et.value}>{et.label}</option>)}
                            </select>
                            <input type="text" value={newRuleDescription} onChange={e => setNewRuleDescription(e.target.value)}
                              placeholder="Описание (опционально)"
                              className="w-full px-2 py-1.5 rounded border border-gray-200 text-xs" />
                            <div>
                              <label className="text-[10px] text-gray-500">Фильтры (JSON, AND)</label>
                              <input type="text" value={newRuleFilters} onChange={e => setNewRuleFilters(e.target.value)}
                                placeholder='{"landing_slug":"vsl"}'
                                className="w-full px-2 py-1.5 rounded border border-gray-200 text-xs font-mono" />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => addRule(stage.id)}
                                className="px-3 py-1 bg-[#6A55F8] text-white text-xs rounded font-medium">Добавить</button>
                              <button onClick={() => setAddingRuleForStage(null)}
                                className="px-3 py-1 text-gray-500 text-xs rounded border border-gray-200">Отмена</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setAddingRuleForStage(stage.id)}
                            className="text-xs text-[#6A55F8] font-medium hover:underline">+ Добавить правило</button>
                        )}
                      </div>
                    )}

                    {/* Delete stage */}
                    <button onClick={() => removeStage(stage.id)}
                      className="text-xs text-red-400 hover:text-red-600 hover:underline mt-2">Удалить этап</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Add stage */}
        {addingStage ? (
          <div className="mt-3 flex gap-2">
            <input autoFocus type="text" value={newStageName}
              onChange={e => setNewStageName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addStage()}
              placeholder="Название этапа"
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
            <button onClick={addStage} disabled={savingStage}
              className="bg-[#6A55F8] text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
              {savingStage ? '...' : 'Добавить'}
            </button>
            <button onClick={() => { setAddingStage(false); setNewStageName('') }}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-500">Отмена</button>
          </div>
        ) : (
          <button onClick={() => setAddingStage(true)}
            className="mt-3 w-full py-2.5 rounded-lg border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-[#6A55F8] hover:text-[#6A55F8] transition-colors">
            + Добавить этап
          </button>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CRM SCREEN — список досок
// ═══════════════════════════════════════════════════════════════════════════
export default function CrmScreen() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const projectId = params?.id as string

  const [boards, setBoards] = useState<Board[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null)
  const urlBoardId = searchParams.get('open')
  const openBoardId = localSelectedId ?? urlBoardId
  const selectedBoard = openBoardId ? boards.find(b => b.id === openBoardId) ?? null : null

  function selectBoard(id: string) {
    setLocalSelectedId(id)
    const p = new URLSearchParams(searchParams.toString())
    p.set('open', id)
    router.replace(`?${p.toString()}`, { scroll: false })
  }
  function clearSelection() {
    setLocalSelectedId(null)
    const p = new URLSearchParams(searchParams.toString())
    p.delete('open')
    router.replace(`?${p.toString()}`, { scroll: false })
  }

  const supabase = createClient()

  async function loadBoards() {
    const { data } = await supabase.from('crm_boards').select('*').eq('project_id', projectId).order('created_at')
    setBoards(data ?? [])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (projectId) loadBoards() }, [projectId])

  async function createBoard() {
    if (!newBoardName.trim()) return
    const tempBoard: Board = {
      id: 'temp-' + Date.now(), name: newBoardName.trim(),
      project_id: projectId, created_at: new Date().toISOString(),
    }
    setBoards(prev => [...prev, tempBoard])
    setNewBoardName('')
    setShowCreate(false)
    setCreating(true)

    const { data: board, error } = await supabase
      .from('crm_boards').insert({ project_id: projectId, name: tempBoard.name }).select().single()

    if (!error && board) {
      await supabase.from('crm_board_stages').insert([
        { board_id: board.id, name: 'Новый', color: '#94A3B8', order_position: 0, automation_mode: 'manual' },
        { board_id: board.id, name: 'В работе', color: '#6A55F8', order_position: 1, automation_mode: 'manual' },
        { board_id: board.id, name: 'Закрыт', color: '#10B981', order_position: 2, automation_mode: 'manual' },
      ])
      setBoards(prev => prev.map(b => b.id === tempBoard.id ? board : b))
    }
    setCreating(false)
  }

  if (selectedBoard) {
    return <CrmDetail board={selectedBoard} onBack={clearSelection} />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">CRM</h1>
          <p className="text-sm text-gray-500 mt-0.5">Управляйте клиентами на каждом этапе</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Создать CRM-доску
        </button>
      </div>

      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Новая CRM-доска</h3>
          <input autoFocus type="text" value={newBoardName}
            onChange={e => setNewBoardName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createBoard()}
            placeholder="Название доски, например «Продажа курса»"
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
          <div className="flex gap-2">
            <button onClick={createBoard} disabled={creating || !newBoardName.trim()}
              className="bg-[#6A55F8] hover:bg-[#5040D6] disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {creating ? 'Создание...' : 'Создать'}
            </button>
            <button onClick={() => { setShowCreate(false); setNewBoardName('') }}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Отмена</button>
          </div>
        </div>
      )}

      {loading ? <SkeletonList count={3} /> : boards.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-4">📊</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Нет CRM-досок</h2>
          <p className="text-sm text-gray-500 mb-6">Создайте первую доску для управления клиентами</p>
          <button onClick={() => setShowCreate(true)}
            className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-5 py-2.5 rounded-lg text-sm font-medium">
            + Создать CRM-доску
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {boards.map(board => (
            <button key={board.id} onClick={() => selectBoard(board.id)}
              className="w-full bg-white rounded-xl border border-gray-100 p-5 flex items-center justify-between hover:border-[#6A55F8]/30 hover:shadow-sm transition-all text-left">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-2xl">📊</div>
                <div>
                  <h3 className="font-semibold text-gray-900">{board.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Нажмите, чтобы открыть</p>
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
