'use client'

import { useState } from 'react'
import { clients, crmStages } from '@/lib/mock-data'

const tagColors = ['bg-purple-100 text-purple-700', 'bg-amber-100 text-amber-700', 'bg-blue-100 text-blue-700', 'bg-green-100 text-green-700']

type CrmBoard = { id: number; name: string; stages: typeof crmStages }

const initialBoards: CrmBoard[] = [
  { id: 1, name: 'Отдел продаж', stages: crmStages },
  { id: 2, name: 'VIP-клиенты', stages: [
    { id: 'new', name: 'Новый', color: '#94A3B8' },
    { id: 'paid', name: 'Оплатил', color: '#10B981' },
    { id: 'learning', name: 'Учится', color: '#06B6D4' },
  ]},
]

const fakeAccess = [
  { name: 'Хасан', role: 'Владелец', access: true },
  { name: 'Менеджер Анна', role: 'Администратор', access: true },
  { name: 'Куратор Мария', role: 'Куратор', access: false },
]

function TagPill({ tag, i }: { tag: string; i: number }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tagColors[i % tagColors.length]}`}>{tag}</span>
}

function stageLabel(stages: typeof crmStages, stageId: string) {
  return stages.find(s => s.id === stageId)?.name ?? stageId
}

function stageColor(stages: typeof crmStages, stageId: string) {
  return stages.find(s => s.id === stageId)?.color ?? '#94A3B8'
}

function CrmDetail({ board, onBack }: { board: CrmBoard; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<'kanban' | 'table' | 'edit' | 'access'>('kanban')

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
          <p className="text-xs text-gray-500">{board.stages.length} этапов · {clients.length} клиентов</p>
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

      {/* Kanban */}
      {activeTab === 'kanban' && (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {board.stages.map(stage => {
            const stageClients = clients.filter(c => c.stage === stage.id)
            return (
              <div key={stage.id} className="min-w-[220px] flex-shrink-0 bg-gray-50/80 rounded-xl p-3 border border-gray-100">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                  <span className="text-sm font-semibold text-gray-700">{stage.name}</span>
                  <span className="text-xs text-gray-400 bg-white rounded-full px-2 py-0.5">{stageClients.length}</span>
                </div>
                <div className="space-y-2">
                  {stageClients.map(client => (
                    <div key={client.id} className="bg-white rounded-xl border border-gray-100 p-3 hover:shadow-sm transition-shadow cursor-pointer">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 rounded-full bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8]">
                          {client.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span className="text-sm font-medium text-gray-900 leading-tight">{client.name}</span>
                      </div>
                      <p className="text-xs text-gray-500">{client.lastAction}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{client.lastActionTime}</p>
                      {client.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {client.tags.map((tag, i) => <TagPill key={tag} tag={tag} i={i} />)}
                        </div>
                      )}
                    </div>
                  ))}
                  {stageClients.length === 0 && (
                    <div className="bg-white rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">Нет клиентов</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Table */}
      {activeTab === 'table' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Имя', 'Email', 'Telegram', 'Этап', 'Теги', 'Последнее действие', 'Выручка'].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.map(client => (
                <tr key={client.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8] flex-shrink-0">
                        {client.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <span className="font-medium text-gray-900">{client.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{client.email}</td>
                  <td className="px-4 py-3 text-gray-500">{client.telegram}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: stageColor(board.stages, client.stage) }}>
                      {stageLabel(board.stages, client.stage)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {client.tags.map((tag, i) => <TagPill key={tag} tag={tag} i={i} />)}
                      {client.tags.length === 0 && <span className="text-gray-300">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-700 text-xs">{client.lastAction}</div>
                    <div className="text-[10px] text-gray-400">{client.lastActionTime}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-900 font-medium">
                    {client.revenue > 0 ? `${client.revenue.toLocaleString('ru')} ₽` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit stages */}
      {activeTab === 'edit' && (
        <div className="max-w-xl space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Этапы CRM-доски</h3>
            <div className="space-y-2">
              {board.stages.map((stage, idx) => (
                <div key={stage.id} className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                  <span className="text-sm font-medium text-gray-800 flex-1">{stage.name}</span>
                  <span className="text-xs text-gray-400">Этап {idx + 1}</span>
                  <button className="text-xs text-gray-400 hover:text-[#6A55F8]">✏</button>
                  <button className="text-xs text-gray-400 hover:text-red-500">✕</button>
                </div>
              ))}
            </div>
            <button className="mt-3 w-full py-2.5 rounded-lg border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-[#6A55F8] hover:text-[#6A55F8] transition-colors">
              + Добавить этап
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Привязка к воронке</h3>
            <p className="text-xs text-gray-500 mb-3">Этапы CRM автоматически синхронизируются с этапами выбранной воронки</p>
            <select className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700">
              <option>Автовебинар AI-маркетинг</option>
              <option>Лид-магнит: чек-лист</option>
              <option>Не привязана</option>
            </select>
          </div>
        </div>
      )}

      {/* Access */}
      {activeTab === 'access' && (
        <div className="max-w-xl space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Доступ к CRM-доске</h3>
              <button className="text-xs text-[#6A55F8] font-medium border border-[#6A55F8]/30 rounded-lg px-3 py-1.5 hover:bg-[#F0EDFF]">
                + Добавить пользователя
              </button>
            </div>
            <div className="space-y-2">
              {fakeAccess.map((user, idx) => (
                <div key={idx} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8]">
                      {user.name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{user.name}</p>
                      <p className="text-xs text-gray-500">{user.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${user.access ? 'bg-[#6A55F8]' : 'bg-gray-300'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${user.access ? 'right-0.5' : 'left-0.5'}`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CrmScreen() {
  const [boards] = useState(initialBoards)
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null)

  const selectedBoard = boards.find(b => b.id === selectedBoardId)

  if (selectedBoard) {
    return <CrmDetail board={selectedBoard} onBack={() => setSelectedBoardId(null)} />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">CRM</h1>
          <p className="text-sm text-gray-500 mt-0.5">Управляйте клиентами на каждом этапе</p>
        </div>
        <button className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Создать CRM-доску
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {boards.map(board => (
          <button
            key={board.id}
            onClick={() => setSelectedBoardId(board.id)}
            className="w-full bg-white rounded-xl border border-gray-100 p-5 flex items-center justify-between hover:border-[#6A55F8]/30 hover:shadow-sm transition-all text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-2xl">📊</div>
              <div>
                <h3 className="font-semibold text-gray-900">{board.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  {board.stages.map(s => (
                    <span key={s.id} className="flex items-center gap-1 text-xs text-gray-500">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        ))}
      </div>
    </div>
  )
}
