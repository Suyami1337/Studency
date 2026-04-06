'use client'

import { useState } from 'react'
import { clients, crmStages } from '@/lib/mock-data'

const tagColors = ['bg-purple-100 text-purple-700', 'bg-amber-100 text-amber-700', 'bg-blue-100 text-blue-700', 'bg-green-100 text-green-700']

function TagPill({ tag, i }: { tag: string; i: number }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tagColors[i % tagColors.length]}`}>{tag}</span>
  )
}

function stageLabel(stageId: string) {
  return crmStages.find(s => s.id === stageId)?.name ?? stageId
}

function stageColor(stageId: string) {
  return crmStages.find(s => s.id === stageId)?.color ?? '#94A3B8'
}

export default function CrmScreen() {
  const [view, setView] = useState<'kanban' | 'table'>('kanban')

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CRM</h1>
          <p className="text-sm text-gray-500 mt-0.5">{clients.length} клиентов в базе</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setView('kanban')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'kanban' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Канбан
            </button>
            <button
              onClick={() => setView('table')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'table' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Таблица
            </button>
          </div>
        </div>
      </div>

      {/* Kanban */}
      {view === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {crmStages.map(stage => {
            const stageClients = clients.filter(c => c.stage === stage.id)
            return (
              <div key={stage.id} className="min-w-[220px] flex-shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                  <span className="text-sm font-semibold text-gray-700">{stage.name}</span>
                  <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{stageClients.length}</span>
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
                      <p className="text-xs text-gray-500 leading-snug">{client.lastAction}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{client.lastActionTime}</p>
                      {client.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {client.tags.map((tag, i) => <TagPill key={tag} tag={tag} i={i} />)}
                        </div>
                      )}
                    </div>
                  ))}
                  {stageClients.length === 0 && (
                    <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
                      Нет клиентов
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Table */}
      {view === 'table' && (
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
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: stageColor(client.stage) }}>
                      {stageLabel(client.stage)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {client.tags.map((tag, i) => <TagPill key={tag} tag={tag} i={i} />)}
                      {client.tags.length === 0 && <span className="text-gray-300">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-700">{client.lastAction}</div>
                    <div className="text-xs text-gray-400">{client.lastActionTime}</div>
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
    </div>
  )
}
