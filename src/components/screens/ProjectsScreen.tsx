'use client'

import { projects } from '@/lib/mock-data'

export default function ProjectsScreen({ onSelect }: { onSelect: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#F8F7FF] to-[#F0EDFF] py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Мои проекты</h1>
        <p className="text-sm text-gray-500 mb-8">Выберите проект или создайте новый</p>

        <div className="space-y-3">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={onSelect}
              className="w-full bg-white rounded-xl border border-gray-100 p-5 flex items-center justify-between hover:border-[#6A55F8]/30 hover:shadow-md hover:shadow-[#6A55F8]/5 transition-all group text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6A55F8] to-[#8B7BFA] flex items-center justify-center text-white text-sm font-bold shadow-sm shadow-[#6A55F8]/20">
                  {p.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-[#6A55F8] transition-colors">{p.name}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {p.domain || 'Домен не привязан'} · {p.clients.toLocaleString('ru')} клиентов
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{p.revenue.toLocaleString('ru')} ₽</p>
                <p className="text-xs text-gray-400">выручка</p>
              </div>
            </button>
          ))}

          {/* Create new */}
          <button className="w-full bg-white rounded-xl border-2 border-dashed border-gray-200 p-5 flex items-center justify-center gap-2 hover:border-[#6A55F8] hover:bg-[#F8F7FF] transition-all text-gray-400 hover:text-[#6A55F8]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            <span className="text-sm font-medium">Создать новый проект</span>
          </button>
        </div>
      </div>
    </div>
  )
}
