'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { AiAssistantButton, AiAssistantOverlay } from '@/components/ui/AiAssistant'
import { SkeletonList } from '@/components/ui/Skeleton'

type Funnel = { id: string; name: string; project_id: string; status: string; created_at: string }
type FunnelStage = { id: string; funnel_id: string; name: string; stage_type: string; order_position: number; tool_id: string | null; settings: Record<string, unknown> }
type Customer = { id: string; name: string; email: string | null; telegram: string | null }

function SelectOrCreate({ children, placeholder, onSubmit }: { children: React.ReactNode; placeholder: string; onSubmit: (name: string) => Promise<void> }) {
  const [mode, setMode] = useState<'select' | 'create'>('select')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleCreate() {
    if (!name.trim()) return
    setSaving(true)
    await onSubmit(name.trim())
    setName('')
    setMode('select')
    setSaving(false)
  }

  if (mode === 'create') {
    return (
      <div className="space-y-2">
        <div className="bg-[#F8F7FF] rounded-lg p-3 border border-[#6A55F8]/10 space-y-2">
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder={placeholder} autoFocus
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] bg-white" />
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving || !name.trim()}
              className="bg-[#6A55F8] text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">
              {saving ? 'Создаю...' : 'Создать'}
            </button>
            <button onClick={() => { setMode('select'); setName('') }} className="text-xs text-gray-500">Отмена</button>
          </div>
        </div>
        <button onClick={() => setMode('select')} className="text-xs text-[#6A55F8] font-medium hover:underline">
          ← Выбрать из имеющихся
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {children}
      <button onClick={() => setMode('create')} className="text-xs text-[#6A55F8] font-medium hover:underline">
        + Или создать новый
      </button>
    </div>
  )
}

const stageTypeIcon: Record<string, string> = {
  bot: '🤖', landing: '🌐', order: '📋', payment: '💳', learning: '🎓',
}
const stageTypeLabel: Record<string, string> = {
  bot: 'Чат-бот', landing: 'Сайт', order: 'Заказ', payment: 'Оплата', learning: 'Обучение',
}
const stageTypes = [
  { type: 'bot', icon: '🤖', label: 'Чат-бот' },
  { type: 'landing', icon: '🌐', label: 'Сайт / Лендинг' },
  { type: 'order', icon: '📋', label: 'Заказ' },
  { type: 'payment', icon: '💳', label: 'Оплата' },
  { type: 'learning', icon: '🎓', label: 'Обучение' },
]

function FunnelDetail({ funnel, onBack, onDeleted, onDuplicated }: { funnel: Funnel; onBack: () => void; onDeleted: (id: string) => void; onDuplicated: (newFunnel: Funnel) => void }) {
  const [activeTab, setActiveTab] = useState<'settings' | 'analytics' | 'users' | 'config'>('settings')
  const [stages, setStages] = useState<FunnelStage[]>([])
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({})
  const [stageCustomers, setStageCustomers] = useState<Customer[]>([])
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [addStep, setAddStep] = useState<'type' | 'select' | null>(null)
  const [addType, setAddType] = useState('')
  const [existingItems, setExistingItems] = useState<{id: string; name: string}[]>([])
  const [selectedToolId, setSelectedToolId] = useState('')
  const [addProductId, setAddProductId] = useState('')
  const [addTariffId, setAddTariffId] = useState('')
  const [addCourseId, setAddCourseId] = useState('')
  const [addBotMessageId, setAddBotMessageId] = useState('')
  const [productsList, setProductsList] = useState<{id: string; name: string}[]>([])
  const [tariffsList, setTariffsList] = useState<{id: string; name: string}[]>([])
  const [coursesList, setCoursesList] = useState<{id: string; name: string}[]>([])
  const [botMessagesList, setBotMessagesList] = useState<{id: string; text: string; is_start: boolean; trigger_word: string | null}[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [showAI, setShowAI] = useState(false)

  const supabase = createClient()
  const params = useParams()

  async function loadStages() {
    setLoading(true)
    const { data } = await supabase
      .from('funnel_stages')
      .select('*')
      .eq('funnel_id', funnel.id)
      .order('order_position')
    setStages(data ?? [])

    // Load customer counts per stage
    if (data && data.length > 0) {
      const counts: Record<string, number> = {}
      await Promise.all(
        data.map(async (stage) => {
          const { count } = await supabase
            .from('customer_funnel_positions')
            .select('*', { count: 'exact', head: true })
            .eq('stage_id', stage.id)
          counts[stage.id] = count ?? 0
        })
      )
      setStageCounts(counts)
    }
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadStages() }, [funnel.id])

  async function startAddStage(type: string) {
    setShowAddMenu(false)
    setAddType(type)
    setSelectedToolId('')
    setAddProductId('')
    setAddTariffId('')
    setAddCourseId('')

    // Load existing items for this type
    if (type === 'bot') {
      const { data } = await supabase.from('chatbot_scenarios').select('id, name').eq('project_id', funnel.project_id)
      setExistingItems((data ?? []) as {id: string; name: string}[])
    } else if (type === 'landing') {
      const { data } = await supabase.from('landings').select('id, name').eq('project_id', funnel.project_id)
      setExistingItems((data ?? []) as {id: string; name: string}[])
    } else if (type === 'order' || type === 'payment') {
      const { data } = await supabase.from('products').select('id, name').eq('project_id', funnel.project_id)
      setProductsList((data ?? []) as {id: string; name: string}[])
      setExistingItems([])
    } else if (type === 'learning') {
      const { data } = await supabase.from('courses').select('id, name').eq('project_id', funnel.project_id)
      setCoursesList((data ?? []) as {id: string; name: string}[])
      setExistingItems([])
    }
    setAddStep('select')
  }

  async function loadBotMessages(scenarioId: string) {
    setSelectedToolId(scenarioId)
    setAddBotMessageId('')
    const { data } = await supabase.from('scenario_messages').select('id, text, is_start, trigger_word').eq('scenario_id', scenarioId).order('order_position')
    setBotMessagesList((data ?? []) as {id: string; text: string; is_start: boolean; trigger_word: string | null}[])
  }

  async function loadTariffsForProduct(productId: string) {
    setAddProductId(productId)
    const { data } = await supabase.from('tariffs').select('id, name').eq('product_id', productId)
    setTariffsList((data ?? []) as {id: string; name: string}[])
  }

  async function confirmAddStage() {
    let name = stageTypeLabel[addType] ?? addType
    let toolId: string | null = null
    const settings: Record<string, unknown> = {}

    if (addType === 'bot' && selectedToolId) {
      const item = existingItems.find(i => i.id === selectedToolId)
      const msg = botMessagesList.find(m => m.id === addBotMessageId)
      name = item?.name ?? 'Чат-бот'
      if (msg) name += ` → ${(msg.text || '').slice(0, 30)}`
      toolId = selectedToolId
      if (addBotMessageId) settings.message_id = addBotMessageId
    } else if (addType === 'landing' && selectedToolId) {
      const item = existingItems.find(i => i.id === selectedToolId)
      name = item?.name ?? 'Сайт'
      toolId = selectedToolId
    } else if (addType === 'order' || addType === 'payment') {
      const prod = productsList.find(p => p.id === addProductId)
      const tariff = tariffsList.find(t => t.id === addTariffId)
      name = addType === 'order' ? `Заказ: ${prod?.name ?? 'Продукт'}` : `Оплата: ${prod?.name ?? 'Продукт'}`
      if (tariff) name += ` (${tariff.name})`
      settings.product_id = addProductId
      settings.tariff_id = addTariffId || null
    } else if (addType === 'learning' && addCourseId) {
      const course = coursesList.find(c => c.id === addCourseId)
      name = course?.name ?? 'Курс'
      toolId = addCourseId
    }

    const tempStage: FunnelStage = {
      id: 'temp-' + Date.now(), funnel_id: funnel.id, name, stage_type: addType,
      order_position: stages.length, tool_id: toolId, settings,
    }
    setStages(prev => [...prev, tempStage])
    setStageCounts(prev => ({ ...prev, [tempStage.id]: 0 }))
    setAddStep(null)

    const { data } = await supabase.from('funnel_stages').insert({
      funnel_id: funnel.id, name, stage_type: addType, order_position: stages.length,
      tool_id: toolId, settings,
    }).select().single()
    if (data) {
      setStages(prev => prev.map(s => s.id === tempStage.id ? data : s))
    }
  }

  async function removeStage(stageId: string) {
    await supabase.from('funnel_stages').delete().eq('id', stageId)
    setStages(prev => prev.filter(s => s.id !== stageId))
    setStageCounts(prev => { const n = { ...prev }; delete n[stageId]; return n })
  }

  async function loadCustomersForStage(stageId: string) {
    setLoadingCustomers(true)
    const { data } = await supabase
      .from('customer_funnel_positions')
      .select('customers(id, name, email, telegram)')
      .eq('stage_id', stageId)
    const flat: Customer[] = (data ?? []).map((row: Record<string, unknown>) => {
      const c = row.customers as Record<string, unknown> | null
      return {
        id: (c?.id as string) ?? '',
        name: (c?.name as string) ?? 'Без имени',
        email: (c?.email as string) ?? null,
        telegram: (c?.telegram as string) ?? null,
      }
    })
    setStageCustomers(flat)
    setLoadingCustomers(false)
  }

  function selectStage(stageId: string) {
    if (selectedStageId === stageId) {
      setSelectedStageId(null)
      setStageCustomers([])
    } else {
      setSelectedStageId(stageId)
      loadCustomersForStage(stageId)
    }
  }

  // AI assistant is now an overlay component

  const tabs = [
    { id: 'settings' as const, label: 'Воронка' },
    { id: 'analytics' as const, label: 'Аналитика' },
    { id: 'users' as const, label: 'Пользователи' },
    { id: 'config' as const, label: 'Настройки' },
  ]

  const [confirmDelete, setConfirmDelete] = useState(false)

  async function deleteFunnel() {
    onDeleted(funnel.id) // instant remove from list
    onBack()
    await supabase.from('funnels').delete().eq('id', funnel.id) // background
  }

  async function duplicateFunnel() {
    const tempFunnel: Funnel = {
      id: 'temp-' + Date.now(), name: `${funnel.name} (копия)`,
      project_id: funnel.project_id, status: 'draft', created_at: new Date().toISOString(),
    }
    onDuplicated(tempFunnel) // instant add to list
    onBack()
    // Background: create in DB
    const { data: newFunnel } = await supabase.from('funnels').insert({
      project_id: funnel.project_id, name: tempFunnel.name, status: 'draft',
    }).select().single()
    if (newFunnel) {
      for (const stage of stages) {
        await supabase.from('funnel_stages').insert({
          funnel_id: newFunnel.id, name: stage.name, stage_type: stage.stage_type, order_position: stage.order_position,
        })
      }
    }
  }

  async function updateFunnelStatus(status: string) {
    await supabase.from('funnels').update({ status }).eq('id', funnel.id)
  }

  const totalCustomers = stages.length > 0 ? (stageCounts[stages[0]?.id] ?? 0) : 0
  const lastStageCount = stages.length > 0 ? (stageCounts[stages[stages.length - 1]?.id] ?? 0) : 0
  const conversionPct = totalCustomers > 0 ? Math.round((lastStageCount / totalCustomers) * 100) : 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">← Назад</button>
        <div className="w-9 h-9 rounded-lg bg-[#F0EDFF] flex items-center justify-center text-lg">🔀</div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{funnel.name}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${funnel.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {funnel.status === 'active' ? 'Активна' : 'Черновик'}
            </span>
          </div>
          <p className="text-xs text-gray-500">{stages.length} этапов · {totalCustomers} клиентов</p>
        </div>
        </div>
        <AiAssistantButton isOpen={showAI} onClick={() => setShowAI(!showAI)} />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-100">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${
              activeTab === tab.id ? 'border-[#6A55F8] text-[#6A55F8]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonList count={3} />
      ) : (
        <>
          {/* TAB: Настройка воронки */}
          {activeTab === 'settings' && (
            <div className="flex gap-4">
              {/* Left: Stage list */}
              <div className="flex-1">
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  {stages.length === 0 && (
                    <div className="p-8 text-center text-gray-400 text-sm">Добавьте первый этап воронки</div>
                  )}
                  {stages.map((stage, idx) => {
                    const count = stageCounts[stage.id] ?? 0
                    const prevCount = idx === 0 ? count : (stageCounts[stages[idx - 1].id] ?? 0)
                    const convPct = idx === 0 ? null : (prevCount > 0 ? Math.round((count / prevCount) * 100) : 0)

                    return (
                      <div key={stage.id} onClick={() => {
                        startAddStage(stage.stage_type)
                        if (stage.tool_id) setSelectedToolId(stage.tool_id)
                      }} className="flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors cursor-pointer group">
                        <div className="w-8 h-8 rounded-lg bg-[#F0EDFF] flex items-center justify-center text-sm font-bold text-[#6A55F8] flex-shrink-0">
                          {idx + 1}
                        </div>
                        <div className="text-lg flex-shrink-0">{stageTypeIcon[stage.stage_type] ?? '📌'}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{stage.name}</p>
                          <p className="text-xs text-gray-400">{stageTypeLabel[stage.stage_type] ?? stage.stage_type}</p>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0">
                          {convPct !== null && (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              convPct >= 70 ? 'bg-green-100 text-green-700' : convPct >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
                            }`}>
                              {convPct}%
                            </span>
                          )}
                          <span className="text-sm font-bold text-[#6A55F8]">{count}</span>
                          <span className="text-xs text-gray-400">чел.</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button
                            onClick={() => removeStage(stage.id)}
                            className="text-xs text-gray-400 hover:text-red-500 px-1"
                          >✕</button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Add stage */}
                <div className="relative mt-3">
                  {!addStep && (
                    <button
                      onClick={() => setShowAddMenu(!showAddMenu)}
                      className="w-full py-3.5 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-[#6A55F8] hover:text-[#6A55F8] transition-colors font-medium"
                    >
                      + Добавить этап
                    </button>
                  )}
                  {showAddMenu && !addStep && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 z-50 p-2">
                      <p className="text-xs text-gray-400 px-3 py-1.5 font-medium">Выберите тип этапа:</p>
                      {stageTypes.map(st => (
                        <button key={st.type} onClick={() => startAddStage(st.type)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#F0EDFF] transition-colors text-left">
                          <span className="text-lg">{st.icon}</span>
                          <span className="text-sm font-medium text-gray-800">{st.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Step 2: Select existing or configure */}
                  {addStep === 'select' && (
                    <div className="bg-white rounded-xl border border-[#6A55F8]/30 p-5 shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-gray-900">
                          {stageTypeIcon[addType]} Настройка этапа: {stageTypeLabel[addType]}
                        </h4>
                        <button onClick={() => setAddStep(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                      </div>

                      {/* Bot: select scenario + message */}
                      {addType === 'bot' && (
                        <div className="space-y-3">
                          <SelectOrCreate placeholder="Название сценария" onSubmit={async (name) => {
                            const { data } = await supabase.from('chatbot_scenarios').insert({ project_id: funnel.project_id, name }).select().single()
                            if (data) { setExistingItems(prev => [...prev, { id: data.id, name: data.name }]); loadBotMessages(data.id) }
                          }}>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Сценарий чат-бота</label>
                              <select value={selectedToolId} onChange={e => loadBotMessages(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
                                <option value="">Выберите сценарий...</option>
                                {existingItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                              </select>
                            </div>
                          </SelectOrCreate>
                          {selectedToolId && (
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Конкретный этап/сообщение</label>
                              <select value={addBotMessageId} onChange={e => setAddBotMessageId(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
                                <option value="">Весь сценарий целиком</option>
                                {botMessagesList.map((m, idx) => (
                                  <option key={m.id} value={m.id}>
                                    #{idx + 1}: {m.is_start ? '⭐' : '💬'} {(m.text || 'Пустое').slice(0, 50)}
                                  </option>
                                ))}
                              </select>
                              {botMessagesList.length === 0 && (
                                <p className="text-[10px] text-gray-400 mt-1">Сообщений пока нет — будет отслеживаться весь сценарий. Добавьте сообщения в разделе Чат-боты.</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Landing: select existing or create */}
                      {addType === 'landing' && (
                        <SelectOrCreate placeholder="Название сайта" onSubmit={async (name) => {
                          const { data } = await supabase.from('landings').insert({ project_id: funnel.project_id, name, slug: name.toLowerCase().replace(/\s+/g, '-') }).select().single()
                          if (data) { setExistingItems(prev => [...prev, { id: data.id, name: data.name }]); setSelectedToolId(data.id) }
                        }}>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Сайт/Лендинг</label>
                            <select value={selectedToolId} onChange={e => setSelectedToolId(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
                              <option value="">Выберите сайт...</option>
                              {existingItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                            </select>
                          </div>
                        </SelectOrCreate>
                      )}

                      {/* Order / Payment: select product + tariff */}
                      {(addType === 'order' || addType === 'payment') && (
                        <div className="space-y-3">
                          <SelectOrCreate placeholder="Название продукта" onSubmit={async (name) => {
                            const { data } = await supabase.from('products').insert({ project_id: funnel.project_id, name }).select().single()
                            if (data) { setProductsList(prev => [...prev, { id: data.id, name: data.name }]); loadTariffsForProduct(data.id) }
                          }}>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Продукт</label>
                              <select value={addProductId} onChange={e => loadTariffsForProduct(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
                                <option value="">Выберите продукт...</option>
                                {productsList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                            </div>
                          </SelectOrCreate>
                          {addProductId && (
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Тариф (необязательно — пусто = все тарифы)</label>
                              <select value={addTariffId} onChange={e => setAddTariffId(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
                                <option value="">Все тарифы</option>
                                {tariffsList.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                              </select>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Learning: select course */}
                      {addType === 'learning' && (
                        <SelectOrCreate placeholder="Название курса" onSubmit={async (name) => {
                          const { data } = await supabase.from('courses').insert({ project_id: funnel.project_id, name }).select().single()
                          if (data) { setCoursesList(prev => [...prev, { id: data.id, name: data.name }]); setAddCourseId(data.id) }
                        }}>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Курс</label>
                            <select value={addCourseId} onChange={e => setAddCourseId(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
                              <option value="">Выберите курс...</option>
                              {coursesList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                        </SelectOrCreate>
                      )}

                      <div className="flex gap-2 pt-2">
                        <button onClick={confirmAddStage}
                          disabled={
                            (addType === 'bot' && !selectedToolId) ||
                            (addType === 'landing' && !selectedToolId) ||
                            ((addType === 'order' || addType === 'payment') && !addProductId) ||
                            (addType === 'learning' && !addCourseId)
                          }
                          className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                          Добавить этап
                        </button>
                        <button onClick={() => setAddStep(null)} className="text-sm text-gray-500 hover:text-gray-700">Отмена</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: Настройки */}
          {activeTab === 'config' && (
            <div className="max-w-2xl space-y-4">
              <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
                <h3 className="text-sm font-semibold text-gray-900">Основные</h3>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Название воронки</label>
                  <input type="text" defaultValue={funnel.name} onBlur={e => {
                    if (e.target.value.trim() && e.target.value !== funnel.name) {
                      supabase.from('funnels').update({ name: e.target.value.trim() }).eq('id', funnel.id)
                    }
                  }} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Статус</label>
                  <select defaultValue={funnel.status} onChange={e => updateFunnelStatus(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
                    <option value="draft">Черновик</option>
                    <option value="active">Активна</option>
                    <option value="archived">Архив</option>
                  </select>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Дублировать воронку</h3>
                <p className="text-xs text-gray-500 mb-3">Создаст копию воронки со всеми этапами.</p>
                <button onClick={duplicateFunnel} className="px-4 py-2 rounded-lg text-sm font-medium text-[#6A55F8] border border-[#6A55F8]/30 hover:bg-[#F0EDFF]">
                  📋 Дублировать воронку
                </button>
              </div>

              <div className="bg-white rounded-xl border border-red-100 p-5">
                <h3 className="text-sm font-semibold text-red-600 mb-2">Опасная зона</h3>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-700">Удалить воронку и все этапы</p>
                  {!confirmDelete ? (
                    <button onClick={() => setConfirmDelete(true)} className="px-3 py-1.5 rounded-lg border border-red-300 text-sm text-red-600 hover:bg-red-50">Удалить</button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={deleteFunnel} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">Да, удалить</button>
                      <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-50">Отмена</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <AiAssistantOverlay
            isOpen={showAI}
            onClose={() => setShowAI(false)}
            title="AI-помощник воронки"
            placeholder="Настроить воронку..."
            initialMessages={[{ from: 'ai', text: 'Привет! Я помогу настроить воронку. Опиши что нужно изменить.' }]}
          />

          {/* TAB: Аналитика */}
          {activeTab === 'analytics' && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-xs text-gray-500 mb-1">Вошли в воронку</p>
                  <p className="text-2xl font-bold text-gray-900">{totalCustomers}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-xs text-gray-500 mb-1">Дошли до конца</p>
                  <p className="text-2xl font-bold text-[#6A55F8]">{lastStageCount}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-xs text-gray-500 mb-1">Итоговая конверсия</p>
                  <p className="text-2xl font-bold text-green-600">{conversionPct}%</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-xs text-gray-500 mb-1">Этапов</p>
                  <p className="text-2xl font-bold text-gray-900">{stages.length}</p>
                </div>
              </div>

              {stages.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400 text-sm">
                  Добавьте этапы воронки, чтобы видеть аналитику
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Конверсия по этапам</h3>
                  <div className="space-y-3">
                    {stages.map((stage, idx) => {
                      const count = stageCounts[stage.id] ?? 0
                      const barWidth = totalCustomers > 0 ? Math.max(8, Math.round((count / totalCustomers) * 100)) : 8
                      const prevCount = idx === 0 ? count : (stageCounts[stages[idx - 1].id] ?? 0)
                      const convPct = idx === 0 ? 100 : (prevCount > 0 ? Math.round((count / prevCount) * 100) : 0)

                      return (
                        <div key={stage.id} className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg bg-[#F0EDFF] flex items-center justify-center text-sm flex-shrink-0">
                            {stageTypeIcon[stage.stage_type] ?? '📌'}
                          </div>
                          <div className="w-32 flex-shrink-0">
                            <p className="text-xs font-medium text-gray-800 truncate">{stage.name}</p>
                          </div>
                          <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                            <div
                              className="h-5 rounded-full flex items-center px-2"
                              style={{
                                width: `${barWidth}%`,
                                backgroundColor: idx === 0 ? '#6A55F8' : idx === stages.length - 1 ? '#10B981' : '#8B7BFA',
                              }}
                            >
                              {barWidth >= 15 && <span className="text-white text-[10px] font-medium">{count}</span>}
                            </div>
                          </div>
                          <div className="w-16 text-right flex-shrink-0">
                            <span className="text-xs font-semibold text-gray-700">{count} чел.</span>
                          </div>
                          <div className="w-12 text-right flex-shrink-0">
                            {idx > 0 && (
                              <span className={`text-xs font-medium ${convPct >= 70 ? 'text-green-600' : convPct >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                                {convPct}%
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: Пользователи */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              {stages.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400 text-sm">
                  Добавьте этапы воронки, чтобы видеть пользователей
                </div>
              ) : (
                <>
                  {/* Stage selector */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-gray-500">Этап:</span>
                    {stages.map(stage => (
                      <button
                        key={stage.id}
                        onClick={() => selectStage(stage.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                          selectedStageId === stage.id ? 'bg-[#6A55F8] text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {stageTypeIcon[stage.stage_type] ?? '📌'} {stage.name}
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${selectedStageId === stage.id ? 'bg-white/20' : 'bg-gray-100'}`}>
                          {stageCounts[stage.id] ?? 0}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* User list */}
                  {selectedStageId ? (
                    loadingCustomers ? (
                      <SkeletonList count={3} />
                    ) : stageCustomers.length === 0 ? (
                      <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400 text-sm">
                        На этом этапе нет клиентов
                      </div>
                    ) : (
                      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                          <p className="text-sm font-semibold text-gray-700">
                            {stageTypeIcon[stages.find(s => s.id === selectedStageId)?.stage_type ?? ''] ?? '📌'} {stages.find(s => s.id === selectedStageId)?.name} — {stageCustomers.length} человек
                          </p>
                        </div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-100">
                              {['Имя', 'Email', 'Telegram'].map(h => (
                                <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {stageCustomers.map(customer => (
                              <tr key={customer.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8]">
                                      {customer.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                                    </div>
                                    <span className="font-medium text-gray-900">{customer.name}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-gray-500">{customer.email ?? '—'}</td>
                                <td className="px-4 py-3 text-gray-500">{customer.telegram ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  ) : (
                    <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400 text-sm">
                      Выберите этап воронки, чтобы увидеть пользователей
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function FunnelsScreen() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const projectId = params?.id as string

  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newFunnelName, setNewFunnelName] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const openFunnelId = searchParams.get('open')
  const selectedFunnel = openFunnelId ? funnels.find(f => f.id === openFunnelId) ?? null : null

  function selectFunnel(id: string) {
    const p = new URLSearchParams(searchParams.toString())
    p.set('open', id)
    router.push(`?${p.toString()}`, { scroll: false })
  }
  function clearSelection() {
    const p = new URLSearchParams(searchParams.toString())
    p.delete('open')
    router.push(`?${p.toString()}`, { scroll: false })
  }

  const supabase = createClient()

  async function loadFunnels() {
    setLoading(true)
    const { data } = await supabase
      .from('funnels')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at')
    setFunnels(data ?? [])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (projectId) loadFunnels() }, [projectId])

  async function createFunnel() {
    if (!newFunnelName.trim()) return
    const tempFunnel: Funnel = {
      id: 'temp-' + Date.now(),
      name: newFunnelName.trim(),
      project_id: projectId,
      status: 'draft',
      created_at: new Date().toISOString(),
    }
    setFunnels(prev => [...prev, tempFunnel])
    setNewFunnelName('')
    setShowCreate(false)
    setCreating(true)
    const { data, error } = await supabase
      .from('funnels')
      .insert({ project_id: projectId, name: tempFunnel.name, status: 'draft' })
      .select()
      .single()
    if (!error && data) {
      setFunnels(prev => prev.map(f => f.id === tempFunnel.id ? data : f))
    }
    setCreating(false)
  }

  if (selectedFunnel) {
    return <FunnelDetail funnel={selectedFunnel} onBack={clearSelection}
      onDeleted={(id) => setFunnels(prev => prev.filter(f => f.id !== id))}
      onDuplicated={(newF) => setFunnels(prev => [...prev, newF])}
    />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Воронки</h1>
          <p className="text-sm text-gray-500 mt-0.5">Настройте путь клиента от первого касания до оплаты</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Создать воронку
        </button>
      </div>

      {/* Create funnel form */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Новая воронка</h3>
          <input
            autoFocus
            type="text"
            value={newFunnelName}
            onChange={e => setNewFunnelName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createFunnel()}
            placeholder="Название воронки, например «Автовебинар»"
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]"
          />
          <div className="flex gap-2">
            <button
              onClick={createFunnel}
              disabled={creating || !newFunnelName.trim()}
              className="bg-[#6A55F8] hover:bg-[#5040D6] disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {creating ? 'Создание...' : 'Создать'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewFunnelName('') }}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonList count={3} />
      ) : funnels.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-4">🔀</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Нет воронок</h2>
          <p className="text-sm text-gray-500 mb-6">Создайте первую воронку для управления путём клиента</p>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            + Создать воронку
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {funnels.map(funnel => (
            <button
              key={funnel.id}
              onClick={() => selectFunnel(funnel.id)}
              className="w-full bg-white rounded-xl border border-gray-100 p-5 flex items-center justify-between hover:border-[#6A55F8]/30 hover:shadow-sm transition-all text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#F0EDFF] flex items-center justify-center text-lg">🔀</div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{funnel.name}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${funnel.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {funnel.status === 'active' ? 'Активна' : 'Черновик'}
                    </span>
                  </div>
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
