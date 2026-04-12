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
  { value: 'bot_message_received', label: 'Получил сообщение в боте' },
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
  const [activeTab, setActiveTab] = useState<'board' | 'stages' | 'settings'>('board')
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban')
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
    { id: 'board' as const, label: 'Доска' },
    { id: 'stages' as const, label: 'Этапы' },
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
          {/* ═══════════ BOARD (Канбан / Таблица) ═══════════ */}
          {activeTab === 'board' && (
            <>
            {/* View mode toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 w-fit mb-3">
              <button onClick={() => setViewMode('kanban')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${viewMode === 'kanban' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                Канбан
              </button>
              <button onClick={() => setViewMode('table')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${viewMode === 'table' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                Таблица
              </button>
            </div>
            </>
          )}

          {activeTab === 'board' && viewMode === 'kanban' && (
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
          {activeTab === 'board' && viewMode === 'table' && (
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

          {/* ═══════════ STAGES (столбцы + правила) ═══════════ */}
          {activeTab === 'stages' && (
            <SettingsTab boardId={board.id} stages={stages} rules={rules} onReload={loadBoardData} />
          )}

          {/* ═══════════ SETTINGS (управление доской) ═══════════ */}
          {activeTab === 'settings' && (
            <BoardSettingsTab board={board} onBack={onBack} onReload={loadBoardData} />
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
function SettingsTab({ boardId, stages: initialStages, rules: initialRules, onReload }: {
  boardId: string
  stages: Stage[]
  rules: StageRule[]
  onReload: () => void
}) {
  const supabase = createClient()
  const params = useParams()
  const projectId = params?.id as string

  // Local optimistic state — мгновенное отображение
  const [localStages, setLocalStages] = useState(initialStages)
  const [localRules, setLocalRules] = useState(initialRules)
  useEffect(() => { setLocalStages(initialStages) }, [initialStages])
  useEffect(() => { setLocalRules(initialRules) }, [initialRules])

  const [newStageName, setNewStageName] = useState('')
  const [addingStage, setAddingStage] = useState(false)
  const [savingStage, setSavingStage] = useState(false)
  const [editingStageId, setEditingStageId] = useState<string | null>(null)

  // Rule editor state
  const [addingRuleForStage, setAddingRuleForStage] = useState<string | null>(null)
  const [newRuleEventType, setNewRuleEventType] = useState('bot_start')
  const [newRuleFilters, setNewRuleFilters] = useState<Record<string, string>>({})

  // Контекстные данные для визуальных dropdown (лениво загружаются)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [contextData, setContextData] = useState<Record<string, any[]>>({})

  async function loadContextData() {
    const botsRes = await supabase.from('telegram_bots').select('id, name, bot_username').eq('project_id', projectId)
    const botIds = (botsRes.data ?? []).map((b: { id: string }) => b.id)

    const [landingsRes, videosRes, scenariosRes, productsRes, tariffsRes] = await Promise.all([
      supabase.from('landings').select('id, name, slug').eq('project_id', projectId),
      supabase.from('videos').select('id, title').eq('project_id', projectId),
      botIds.length > 0
        ? supabase.from('chatbot_scenarios').select('id, name, telegram_bot_id').in('telegram_bot_id', botIds)
        : Promise.resolve({ data: [] }),
      supabase.from('products').select('id, name').eq('project_id', projectId),
      supabase.from('tariffs').select('id, name, product_id'),
    ])

    // Загружаем сообщения и кнопки для всех сценариев
    const scenarioIds = ((scenariosRes.data ?? []) as { id: string }[]).map(s => s.id)
    let messages: { id: string; text: string | null; order_position: number; scenario_id: string }[] = []
    let buttons: { id: string; text: string; message_id: string }[] = []
    if (scenarioIds.length > 0) {
      const [msgsRes, btnsRes] = await Promise.all([
        supabase.from('scenario_messages').select('id, text, order_position, scenario_id').in('scenario_id', scenarioIds).order('order_position'),
        supabase.from('scenario_buttons').select('id, text, message_id').in('message_id',
          (await supabase.from('scenario_messages').select('id').in('scenario_id', scenarioIds)).data?.map((m: { id: string }) => m.id) ?? []
        ),
      ])
      messages = (msgsRes.data ?? []) as typeof messages
      buttons = (btnsRes.data ?? []) as typeof buttons
    }

    setContextData({
      bots: botsRes.data ?? [],
      landings: landingsRes.data ?? [],
      videos: videosRes.data ?? [],
      scenarios: (scenariosRes.data ?? []),
      products: productsRes.data ?? [],
      tariffs: tariffsRes.data ?? [],
      messages,
      buttons,
    })
  }
  useEffect(() => { loadContextData() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId])

  // Каскадные фильтры — для каждого event_type свой набор шагов выбора
  // Каждый шаг может зависеть от предыдущего (parentKey → фильтруем options)
  type FilterStep = { key: string; label: string; options?: Array<{ value: string; label: string }>; parentKey?: string }

  function getFilterSteps(eventType: string, currentFilters: Record<string, string>): FilterStep[] {
    const bots = (contextData.bots ?? []) as Array<{ id: string; name: string; bot_username: string }>
    const scenarios = (contextData.scenarios ?? []) as Array<{ id: string; name: string; telegram_bot_id: string }>
    const messages = (contextData.messages ?? []) as Array<{ id: string; text: string | null; order_position: number; scenario_id: string }>
    const buttons = (contextData.buttons ?? []) as Array<{ id: string; text: string; message_id: string }>
    const landings = (contextData.landings ?? []) as Array<{ id: string; name: string; slug: string }>
    const videos = (contextData.videos ?? []) as Array<{ id: string; title: string }>
    const products = (contextData.products ?? []) as Array<{ id: string; name: string }>
    const tariffs = (contextData.tariffs ?? []) as Array<{ id: string; name: string; product_id: string }>

    switch (eventType) {
      case 'bot_start':
        return [
          { key: 'bot_name', label: 'Какой бот?', options: bots.map(b => ({ value: b.name, label: `@${b.bot_username || b.name}` })) },
        ]

      case 'bot_button_click': {
        const steps: FilterStep[] = [
          { key: 'bot_id', label: 'Какой бот?', options: bots.map(b => ({ value: b.id, label: `@${b.bot_username || b.name}` })) },
        ]
        if (currentFilters.bot_id) {
          const botScenarios = scenarios.filter(s => s.telegram_bot_id === currentFilters.bot_id)
          steps.push({ key: 'scenario_id', label: 'Какой сценарий?', options: botScenarios.map(s => ({ value: s.id, label: s.name })), parentKey: 'bot_id' })
        }
        if (currentFilters.scenario_id) {
          const scenarioMsgs = messages.filter(m => m.scenario_id === currentFilters.scenario_id)
          steps.push({ key: 'message_id', label: 'Какое сообщение?', options: scenarioMsgs.map(m => ({ value: m.id, label: `#${m.order_position + 1}: ${(m.text ?? '').slice(0, 50) || 'Пустое'}` })), parentKey: 'scenario_id' })
        }
        if (currentFilters.message_id) {
          const msgButtons = buttons.filter(b => b.message_id === currentFilters.message_id)
          steps.push({ key: 'button_text', label: 'Какая кнопка?', options: msgButtons.map(b => ({ value: b.text, label: b.text })), parentKey: 'message_id' })
        }
        return steps
      }

      case 'bot_message_received': {
        const steps: FilterStep[] = [
          { key: 'bot_id', label: 'Какой бот?', options: bots.map(b => ({ value: b.id, label: `@${b.bot_username || b.name}` })) },
        ]
        if (currentFilters.bot_id) {
          const botScenarios = scenarios.filter(s => s.telegram_bot_id === currentFilters.bot_id)
          steps.push({ key: 'scenario_id', label: 'Какой сценарий?', options: botScenarios.map(s => ({ value: s.id, label: s.name })), parentKey: 'bot_id' })
        }
        if (currentFilters.scenario_id) {
          const scenarioMsgs = messages.filter(m => m.scenario_id === currentFilters.scenario_id)
          steps.push({ key: 'message_id', label: 'Какое сообщение?', options: scenarioMsgs.map(m => ({ value: m.id, label: `#${m.order_position + 1}: ${(m.text ?? '').slice(0, 50) || 'Пустое'}` })), parentKey: 'scenario_id' })
        }
        return steps
      }

      case 'landing_visit':
        return [{ key: 'source_slug', label: 'Какой лендинг?', options: landings.map(l => ({ value: l.slug, label: l.name })) }]

      case 'form_submit':
        return [{ key: 'landing_slug', label: 'На каком лендинге?', options: landings.map(l => ({ value: l.slug, label: l.name })) }]

      case 'video_start':
      case 'video_complete':
        return [{ key: 'video_id', label: 'Какое видео?', options: videos.map(v => ({ value: v.id, label: v.title })) }]

      case 'order_created':
      case 'order_paid': {
        const steps: FilterStep[] = [
          { key: 'product_id', label: 'Какой продукт?', options: products.map(p => ({ value: p.id, label: p.name })) },
        ]
        if (currentFilters.product_id) {
          const productTariffs = tariffs.filter(t => t.product_id === currentFilters.product_id)
          if (productTariffs.length > 0) {
            steps.push({ key: 'tariff_id', label: 'Какой тариф?', options: productTariffs.map(t => ({ value: t.id, label: t.name })), parentKey: 'product_id' })
          }
        }
        return steps
      }

      case 'button_click':
        return [
          { key: 'landing_slug', label: 'На каком сайте?', options: landings.map(l => ({ value: l.slug, label: l.name })) },
          { key: 'button_text', label: 'Текст кнопки' },
        ]

      case 'page_view':
        return [{ key: 'landing_slug', label: 'Какая страница?', options: landings.map(l => ({ value: l.slug, label: l.name })) }]

      default:
        return []
    }
  }

  async function addStage() {
    if (!newStageName.trim()) return
    const color = DEFAULT_STAGE_COLORS[localStages.length % DEFAULT_STAGE_COLORS.length]
    setSavingStage(true)
    const { data } = await supabase.from('crm_board_stages').insert({
      board_id: boardId, name: newStageName.trim(), color, order_position: localStages.length,
      automation_mode: 'manual', require_from_previous: false,
    }).select().single()
    if (data) setLocalStages(prev => [...prev, data as Stage])
    setNewStageName('')
    setAddingStage(false)
    setSavingStage(false)
  }

  async function removeStage(stageId: string) {
    if (!confirm('Удалить этап? Все клиенты с этого этапа будут потеряны.')) return
    setLocalStages(prev => prev.filter(s => s.id !== stageId))
    setLocalRules(prev => prev.filter(r => r.stage_id !== stageId))
    await supabase.from('crm_board_stages').delete().eq('id', stageId)
  }

  function toggleAutomation(stageId: string, currentMode: string) {
    const newMode = currentMode === 'auto' ? 'manual' : 'auto'
    // Мгновенное обновление
    setLocalStages(prev => prev.map(s => s.id === stageId ? { ...s, automation_mode: newMode } : s))
    // Фоновое сохранение
    supabase.from('crm_board_stages').update({ automation_mode: newMode }).eq('id', stageId)
  }

  function toggleRequirePrevious(stageId: string, currentValue: boolean) {
    setLocalStages(prev => prev.map(s => s.id === stageId ? { ...s, require_from_previous: !currentValue } : s))
    supabase.from('crm_board_stages').update({ require_from_previous: !currentValue }).eq('id', stageId)
  }

  async function addRule(stageId: string) {
    // Собираем только непустые фильтры
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filters: Record<string, any> = {}
    for (const [k, v] of Object.entries(newRuleFilters)) {
      if (v) filters[k] = v
    }

    // Генерируем человекопонятное описание из последнего заполненного шага
    const steps = getFilterSteps(newRuleEventType, newRuleFilters)
    const eventLabel = EVENT_TYPES.find(e => e.value === newRuleEventType)?.label ?? newRuleEventType
    let lastLabel = ''
    for (const step of [...steps].reverse()) {
      const val = newRuleFilters[step.key]
      if (val) {
        lastLabel = step.options?.find(o => o.value === val)?.label ?? val
        break
      }
    }
    const description = lastLabel ? `${eventLabel}: ${lastLabel}` : eventLabel

    const { data } = await supabase.from('crm_stage_rules').insert({
      stage_id: stageId,
      event_type: newRuleEventType,
      filters,
      description,
      order_index: localRules.filter(r => r.stage_id === stageId).length,
    }).select().single()
    if (data) setLocalRules(prev => [...prev, data as StageRule])
    setAddingRuleForStage(null)
    setNewRuleEventType('bot_start')
    setNewRuleFilters({})
  }

  async function removeRule(ruleId: string) {
    setLocalRules(prev => prev.filter(r => r.id !== ruleId))
    await supabase.from('crm_stage_rules').delete().eq('id', ruleId)
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Этапы CRM-доски</h3>
        <p className="text-xs text-gray-500 mb-4">Настройте столбцы, включите автоматизацию и задайте правила для каждого этапа</p>

        <div className="space-y-3">
          {localStages.map((stage, idx) => {
            const stageRules = localRules.filter(r => r.stage_id === stage.id)
            const isAuto = stage.automation_mode === 'auto'
            const isExpanded = editingStageId === stage.id

            return (
              <div key={stage.id} className={`border rounded-xl overflow-hidden ${isAuto ? 'border-[#6A55F8]/20 bg-[#F8F7FF]/30' : 'border-gray-100'}`}>
                {/* Stage header */}
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setEditingStageId(isExpanded ? null : stage.id)}>
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                  <span className="text-sm font-medium text-gray-800 flex-1">{stage.name}</span>
                  {isAuto && <span className="text-[9px] font-semibold text-[#6A55F8] bg-[#F0EDFF] px-1.5 py-0.5 rounded-full">⚡ AUTO</span>}
                  {stageRules.length > 0 && <span className="text-[9px] text-gray-400">{stageRules.length} правил</span>}
                  {stage.require_from_previous && <span className="text-[9px] text-gray-400">из предыд.</span>}
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
                        <p className="text-[10px] text-gray-400">Клиенты попадают сюда автоматически по правилам</p>
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
                        <p className="text-xs font-medium text-gray-700">Когда клиент попадает сюда? <span className="font-normal text-gray-400">(достаточно одного правила)</span></p>

                        {stageRules.length === 0 && (
                          <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">Добавьте хотя бы одно правило — без него автоматизация не сработает</p>
                        )}

                        {stageRules.map(rule => (
                          <div key={rule.id} className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-3 py-2">
                            <span className="text-xs text-[#6A55F8]">⚡</span>
                            <span className="text-xs text-gray-800 flex-1">
                              {rule.description || EVENT_TYPES.find(e => e.value === rule.event_type)?.label || rule.event_type}
                            </span>
                            <button onClick={() => removeRule(rule.id)} className="text-xs text-gray-400 hover:text-red-500">✕</button>
                          </div>
                        ))}

                        {/* Visual rule editor — каскадные dropdown */}
                        {addingRuleForStage === stage.id ? (
                          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
                            <div>
                              <label className="text-xs font-medium text-gray-700 mb-1 block">Когда происходит</label>
                              <select value={newRuleEventType}
                                onChange={e => { setNewRuleEventType(e.target.value); setNewRuleFilters({}) }}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
                                {EVENT_TYPES.map(et => <option key={et.value} value={et.value}>{et.label}</option>)}
                              </select>
                            </div>

                            {/* Каскадные фильтры — каждый шаг зависит от предыдущего */}
                            {getFilterSteps(newRuleEventType, newRuleFilters).map(step => (
                              <div key={step.key}>
                                <label className="text-xs font-medium text-gray-700 mb-1 block">{step.label}</label>
                                {step.options ? (
                                  <select
                                    value={newRuleFilters[step.key] ?? ''}
                                    onChange={e => {
                                      const val = e.target.value
                                      setNewRuleFilters(prev => {
                                        const next = { ...prev, [step.key]: val }
                                        // Очищаем дочерние фильтры при смене родителя
                                        const allSteps = getFilterSteps(newRuleEventType, next)
                                        const thisIdx = allSteps.findIndex(s => s.key === step.key)
                                        for (let i = thisIdx + 1; i < allSteps.length; i++) {
                                          delete next[allSteps[i].key]
                                        }
                                        return next
                                      })
                                    }}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
                                    <option value="">— Любой —</option>
                                    {step.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                  </select>
                                ) : (
                                  <input type="text" value={newRuleFilters[step.key] ?? ''}
                                    onChange={e => setNewRuleFilters(prev => ({ ...prev, [step.key]: e.target.value }))}
                                    placeholder="Введите значение..."
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
                                )}
                              </div>
                            ))}

                            <div className="flex gap-2 pt-1">
                              <button onClick={() => addRule(stage.id)}
                                className="px-4 py-2 bg-[#6A55F8] text-white text-xs rounded-lg font-medium hover:bg-[#5845e0]">Добавить правило</button>
                              <button onClick={() => { setAddingRuleForStage(null); setNewRuleFilters({}) }}
                                className="px-4 py-2 text-gray-500 text-xs rounded-lg border border-gray-200 hover:bg-gray-100">Отмена</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setAddingRuleForStage(stage.id)}
                            className="w-full py-2 rounded-lg border border-dashed border-[#6A55F8]/30 text-xs text-[#6A55F8] font-medium hover:bg-[#F8F7FF] transition-colors">
                            + Добавить правило
                          </button>
                        )}
                      </div>
                    )}

                    {/* Delete stage */}
                    <div className="pt-2 border-t border-gray-100">
                      <button onClick={() => removeStage(stage.id)}
                        className="text-xs text-red-400 hover:text-red-600 hover:underline">Удалить этап</button>
                    </div>
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
// BOARD SETTINGS TAB — удаление, дублирование, переименование доски
// ═══════════════════════════════════════════════════════════════════════════
function BoardSettingsTab({ board, onBack, onReload }: {
  board: Board; onBack: () => void; onReload: () => void
}) {
  const supabase = createClient()
  const [name, setName] = useState(board.name)
  const [saving, setSaving] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleRename() {
    if (!name.trim() || name === board.name) return
    setSaving(true)
    await supabase.from('crm_boards').update({ name: name.trim(), updated_at: new Date().toISOString() }).eq('id', board.id)
    setSaving(false)
    onReload()
  }

  async function handleDuplicate() {
    setDuplicating(true)
    // 1. Копируем доску
    const { data: newBoard } = await supabase.from('crm_boards')
      .insert({ project_id: board.project_id, name: `${board.name} (копия)` })
      .select().single()

    if (newBoard) {
      // 2. Копируем столбцы
      const { data: stages } = await supabase.from('crm_board_stages')
        .select('*').eq('board_id', board.id).order('order_position')

      if (stages && stages.length > 0) {
        const idMap = new Map<string, string>()
        for (const s of stages) {
          const { data: newStage } = await supabase.from('crm_board_stages').insert({
            board_id: newBoard.id, name: s.name, color: s.color,
            order_position: s.order_position, automation_mode: s.automation_mode,
            require_from_previous: s.require_from_previous,
          }).select().single()
          if (newStage) idMap.set(s.id, newStage.id)
        }

        // 3. Копируем правила
        const { data: rules } = await supabase.from('crm_stage_rules')
          .select('*').in('stage_id', stages.map(s => s.id))

        if (rules) {
          for (const r of rules) {
            const newStageId = idMap.get(r.stage_id)
            if (newStageId) {
              await supabase.from('crm_stage_rules').insert({
                stage_id: newStageId, event_type: r.event_type,
                filters: r.filters, description: r.description, order_index: r.order_index,
              })
            }
          }
        }
      }
    }

    setDuplicating(false)
    onBack() // Вернуться к списку досок чтобы увидеть копию
  }

  async function handleDelete() {
    await supabase.from('crm_boards').delete().eq('id', board.id)
    onBack()
  }

  return (
    <div className="max-w-xl space-y-5">
      {/* Переименование */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Название доски</h3>
        <div className="flex gap-2">
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
          <button onClick={handleRename} disabled={saving || !name.trim() || name === board.name}
            className="px-4 py-2 bg-[#6A55F8] text-white text-sm font-medium rounded-lg hover:bg-[#5845e0] disabled:opacity-50">
            {saving ? '...' : 'Сохранить'}
          </button>
        </div>
      </div>

      {/* Дублирование */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Дублировать доску</h3>
        <p className="text-xs text-gray-500 mb-3">Создаст копию доски со всеми столбцами и правилами автоматизации. Клиенты не копируются.</p>
        <button onClick={handleDuplicate} disabled={duplicating}
          className="px-4 py-2 bg-white border border-gray-200 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          {duplicating ? 'Копирую…' : '📋 Создать копию'}
        </button>
      </div>

      {/* Удаление */}
      <div className="bg-white rounded-xl border border-red-100 p-5">
        <h3 className="text-sm font-semibold text-red-700 mb-1">Удалить доску</h3>
        <p className="text-xs text-gray-500 mb-3">Удалит доску, все столбцы, правила и позиции клиентов на этой доске. Сами клиенты не удалятся.</p>
        {confirmDelete ? (
          <div className="flex gap-2 items-center">
            <span className="text-xs text-red-600">Точно удалить «{board.name}»?</span>
            <button onClick={handleDelete}
              className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600">
              Да, удалить
            </button>
            <button onClick={() => setConfirmDelete(false)}
              className="px-4 py-2 text-sm text-gray-500 rounded-lg border border-gray-200 hover:bg-gray-50">
              Отмена
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)}
            className="px-4 py-2 bg-white border border-red-200 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50">
            🗑 Удалить доску
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
    return <CrmDetail board={selectedBoard} onBack={() => { clearSelection(); loadBoards() }} />
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
