'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { SkeletonList } from '@/components/ui/Skeleton'

const tagColors = ['bg-purple-100 text-purple-700', 'bg-amber-100 text-amber-700', 'bg-blue-100 text-blue-700', 'bg-green-100 text-green-700']

type Stage = { id: string; name: string; color: string; order_position: number }
type Customer = {
  id: string
  name: string
  email: string | null
  telegram: string | null
  stage_id: string
  notes: string | null
  source_name: string | null
  source_slug: string | null
}
type Board = { id: string; name: string; project_id: string; created_at: string }

const DEFAULT_STAGE_COLORS = ['#6A55F8', '#F59E0B', '#10B981']

function TagPill({ tag, i }: { tag: string; i: number }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tagColors[i % tagColors.length]}`}>{tag}</span>
}

function stageLabel(stages: Stage[], stageId: string) {
  return stages.find(s => s.id === stageId)?.name ?? stageId
}

function stageColor(stages: Stage[], stageId: string) {
  return stages.find(s => s.id === stageId)?.color ?? '#94A3B8'
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function CrmDetail({ board, onBack }: { board: Board; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<'kanban' | 'table' | 'edit' | 'access'>('kanban')
  const [stages, setStages] = useState<Stage[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [newStageName, setNewStageName] = useState('')
  const [addingStage, setAddingStage] = useState(false)
  const [savingStage, setSavingStage] = useState(false)

  const supabase = createClient()

  async function loadBoardData() {
    const [stagesRes, customersRes] = await Promise.all([
      supabase
        .from('crm_board_stages')
        .select('*')
        .eq('board_id', board.id)
        .order('order_position'),
      supabase
        .from('customer_crm_positions')
        .select('id, stage_id, customers(id, name, email, telegram, notes, source_name, source_slug)')
        .eq('board_id', board.id),
    ])

    if (stagesRes.data) setStages(stagesRes.data)
    if (customersRes.data) {
      const flat: Customer[] = customersRes.data.map((row: Record<string, unknown>) => {
        const c = row.customers as Record<string, unknown> | null
        return {
          id: (c?.id as string) ?? (row.id as string),
          name: (c?.name as string) ?? 'Без имени',
          email: (c?.email as string) ?? null,
          telegram: (c?.telegram as string) ?? null,
          stage_id: row.stage_id as string,
          notes: (c?.notes as string) ?? null,
          source_name: (c?.source_name as string) ?? null,
          source_slug: (c?.source_slug as string) ?? null,
        }
      })
      setCustomers(flat)
    }
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadBoardData() }, [board.id])

  async function addStage() {
    if (!newStageName.trim()) return
    const color = DEFAULT_STAGE_COLORS[stages.length % DEFAULT_STAGE_COLORS.length]
    const tempStage: Stage = {
      id: 'temp-' + Date.now(),
      name: newStageName.trim(),
      color,
      order_position: stages.length,
    }
    setStages(prev => [...prev, tempStage])
    setNewStageName('')
    setAddingStage(false)
    setSavingStage(true)
    const { data, error } = await supabase
      .from('crm_board_stages')
      .insert({ board_id: board.id, name: tempStage.name, color, order_position: tempStage.order_position })
      .select()
      .single()
    if (!error && data) {
      setStages(prev => prev.map(s => s.id === tempStage.id ? data : s))
    }
    setSavingStage(false)
  }

  async function removeStage(stageId: string) {
    await supabase.from('crm_board_stages').delete().eq('id', stageId)
    setStages(prev => prev.filter(s => s.id !== stageId))
  }

  const tabs = [
    { id: 'kanban' as const, label: 'Канбан' },
    { id: 'table' as const, label: 'Таблица' },
    { id: 'edit' as const, label: 'Редактировать' },
    { id: 'access' as const, label: 'Доступ' },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">← Назад</button>
        <div className="w-9 h-9 rounded-lg bg-[#F0EDFF] flex items-center justify-center text-lg">📊</div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{board.name}</h1>
          <p className="text-xs text-gray-500">{stages.length} этапов · {customers.length} клиентов</p>
        </div>
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
          {/* Kanban */}
          {activeTab === 'kanban' && (
            <div className="flex gap-3 overflow-x-auto pb-4">
              {stages.map(stage => {
                const stageCustomers = customers.filter(c => c.stage_id === stage.id)
                return (
                  <div key={stage.id} className="min-w-[220px] flex-shrink-0 bg-gray-50/80 rounded-xl p-3 border border-gray-100">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                      <span className="text-sm font-semibold text-gray-700">{stage.name}</span>
                      <span className="text-xs text-gray-400 bg-white rounded-full px-2 py-0.5">{stageCustomers.length}</span>
                    </div>
                    <div className="space-y-2">
                      {stageCustomers.map(customer => (
                        <div key={customer.id} className="bg-white rounded-xl border border-gray-100 p-3 hover:shadow-sm transition-shadow cursor-pointer">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-7 h-7 rounded-full bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8]">
                              {getInitials(customer.name)}
                            </div>
                            <span className="text-sm font-medium text-gray-900 leading-tight">{customer.name}</span>
                          </div>
                          {customer.email && <p className="text-xs text-gray-500">{customer.email}</p>}
                          {customer.telegram && <p className="text-xs text-gray-400">{customer.telegram}</p>}
                          {customer.source_name && (
                            <p className="text-xs mt-1">
                              <span className="bg-[#F0EDFF] text-[#6A55F8] rounded px-1.5 py-0.5">📍 {customer.source_name}</span>
                            </p>
                          )}
                        </div>
                      ))}
                      {stageCustomers.length === 0 && (
                        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">Нет клиентов</div>
                      )}
                    </div>
                  </div>
                )
              })}
              {stages.length === 0 && (
                <div className="flex-1 bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400 text-sm">
                  Добавьте этапы в разделе «Редактировать»
                </div>
              )}
            </div>
          )}

          {/* Table */}
          {activeTab === 'table' && (
            customers.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400 text-sm">
                Нет клиентов в этой доске
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['Имя', 'Email', 'Telegram', 'Источник', 'Этап', 'Заметки'].map(h => (
                        <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map(customer => (
                      <tr key={customer.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8] flex-shrink-0">
                              {getInitials(customer.name)}
                            </div>
                            <span className="font-medium text-gray-900">{customer.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{customer.email ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{customer.telegram ?? '—'}</td>
                        <td className="px-4 py-3">
                          {customer.source_name
                            ? <span className="bg-[#F0EDFF] text-[#6A55F8] rounded px-2 py-0.5 text-xs">📍 {customer.source_name}</span>
                            : <span className="text-gray-400 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: stageColor(stages, customer.stage_id) }}>
                            {stageLabel(stages, customer.stage_id)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{customer.notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Edit stages */}
          {activeTab === 'edit' && (
            <div className="max-w-xl space-y-4">
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Этапы CRM-доски</h3>
                <div className="space-y-2">
                  {stages.map((stage, idx) => (
                    <div key={stage.id} className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                      <span className="text-sm font-medium text-gray-800 flex-1">{stage.name}</span>
                      <span className="text-xs text-gray-400">Этап {idx + 1}</span>
                      <button
                        onClick={() => removeStage(stage.id)}
                        className="text-xs text-gray-400 hover:text-red-500"
                      >✕</button>
                    </div>
                  ))}
                </div>

                {addingStage ? (
                  <div className="mt-3 flex gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={newStageName}
                      onChange={e => setNewStageName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addStage()}
                      placeholder="Название этапа"
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]"
                    />
                    <button
                      onClick={addStage}
                      disabled={savingStage}
                      className="bg-[#6A55F8] text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      {savingStage ? '...' : 'Добавить'}
                    </button>
                    <button
                      onClick={() => { setAddingStage(false); setNewStageName('') }}
                      className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-500"
                    >Отмена</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingStage(true)}
                    className="mt-3 w-full py-2.5 rounded-lg border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-[#6A55F8] hover:text-[#6A55F8] transition-colors"
                  >
                    + Добавить этап
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Access */}
          {activeTab === 'access' && (
            <div className="max-w-xl">
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-900">Доступ к CRM-доске</h3>
                  <button className="text-xs text-[#6A55F8] font-medium border border-[#6A55F8]/30 rounded-lg px-3 py-1.5 hover:bg-[#F0EDFF]">
                    + Добавить пользователя
                  </button>
                </div>
                <div className="p-8 text-center text-gray-400 text-sm">
                  Управление доступом будет доступно в следующей версии
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

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
    const { data } = await supabase
      .from('crm_boards')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at')
    setBoards(data ?? [])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (projectId) loadBoards() }, [projectId])

  async function createBoard() {
    if (!newBoardName.trim()) return
    const tempBoard: Board = {
      id: 'temp-' + Date.now(),
      name: newBoardName.trim(),
      project_id: projectId,
      created_at: new Date().toISOString(),
    }
    setBoards(prev => [...prev, tempBoard])
    setNewBoardName('')
    setShowCreate(false)
    setCreating(true)

    const { data: board, error } = await supabase
      .from('crm_boards')
      .insert({ project_id: projectId, name: tempBoard.name })
      .select()
      .single()

    if (!error && board) {
      // Create 3 default stages
      await supabase.from('crm_board_stages').insert([
        { board_id: board.id, name: 'Новый', color: '#94A3B8', order_position: 0 },
        { board_id: board.id, name: 'В работе', color: '#6A55F8', order_position: 1 },
        { board_id: board.id, name: 'Закрыт', color: '#10B981', order_position: 2 },
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
        <button
          onClick={() => setShowCreate(true)}
          className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Создать CRM-доску
        </button>
      </div>

      {/* Create board modal */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Новая CRM-доска</h3>
          <input
            autoFocus
            type="text"
            value={newBoardName}
            onChange={e => setNewBoardName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createBoard()}
            placeholder="Название доски, например «Отдел продаж»"
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]"
          />
          <div className="flex gap-2">
            <button
              onClick={createBoard}
              disabled={creating || !newBoardName.trim()}
              className="bg-[#6A55F8] hover:bg-[#5040D6] disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {creating ? 'Создание...' : 'Создать'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewBoardName('') }}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonList count={3} />
      ) : boards.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-4">📊</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Нет CRM-досок</h2>
          <p className="text-sm text-gray-500 mb-6">Создайте первую доску для управления клиентами</p>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            + Создать CRM-доску
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {boards.map(board => (
            <button
              key={board.id}
              onClick={() => selectBoard(board.id)}
              className="w-full bg-white rounded-xl border border-gray-100 p-5 flex items-center justify-between hover:border-[#6A55F8]/30 hover:shadow-sm transition-all text-left"
            >
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
