'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { AiAssistantButton, AiAssistantOverlay } from '@/components/ui/AiAssistant'

type Funnel = { id: string; name: string; project_id: string; status: string; created_at: string }
type FunnelStage = { id: string; funnel_id: string; name: string; stage_type: string; order_position: number }
type Customer = { id: string; name: string; email: string | null; telegram: string | null }

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

function FunnelDetail({ funnel, onBack }: { funnel: Funnel; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<'settings' | 'analytics' | 'users'>('settings')
  const [stages, setStages] = useState<FunnelStage[]>([])
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({})
  const [stageCustomers, setStageCustomers] = useState<Customer[]>([])
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [showAI, setShowAI] = useState(false)

  const supabase = createClient()

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

  async function addStage(type: string) {
    setShowAddMenu(false)
    const label = stageTypeLabel[type] ?? type
    const { data, error } = await supabase
      .from('funnel_stages')
      .insert({ funnel_id: funnel.id, name: label, stage_type: type, order_position: stages.length })
      .select()
      .single()
    if (!error && data) {
      setStages(prev => [...prev, data])
      setStageCounts(prev => ({ ...prev, [data.id]: 0 }))
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
    { id: 'settings' as const, label: 'Настройка воронки' },
    { id: 'analytics' as const, label: 'Аналитика' },
    { id: 'users' as const, label: 'Пользователи' },
  ]

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
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Загрузка...</div>
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
                      <div key={stage.id} className="flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors cursor-pointer group">
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
                  <button
                    onClick={() => setShowAddMenu(!showAddMenu)}
                    className="w-full py-3.5 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-[#6A55F8] hover:text-[#6A55F8] transition-colors font-medium"
                  >
                    + Добавить этап
                  </button>
                  {showAddMenu && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 z-50 p-2">
                      <p className="text-xs text-gray-400 px-3 py-1.5 font-medium">Выберите тип этапа:</p>
                      {stageTypes.map(st => (
                        <button
                          key={st.type}
                          onClick={() => addStage(st.type)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#F0EDFF] transition-colors text-left"
                        >
                          <span className="text-lg">{st.icon}</span>
                          <span className="text-sm font-medium text-gray-800">{st.label}</span>
                        </button>
                      ))}
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
                      <div className="flex items-center justify-center py-8 text-gray-400 text-sm">Загрузка...</div>
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
    return <FunnelDetail funnel={selectedFunnel} onBack={clearSelection} />
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
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Загрузка...</div>
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
