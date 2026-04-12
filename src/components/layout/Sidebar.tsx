'use client'

import Link from 'next/link'
import { usePathname, useParams } from 'next/navigation'

type NavItem = {
  id: string
  label: string
  icon: string
  disabled?: boolean
  tooltip?: string
}

// Группы — между ними в UI будет разделитель
const navGroups: NavItem[][] = [
  // Основа
  [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'funnels', label: 'Воронки', icon: '🔄' },
    { id: 'crm', label: 'CRM', icon: '👥' },
  ],
  // Коммуникации
  [
    { id: 'chatbots', label: 'Чат-боты', icon: '💬' },
    { id: 'broadcasts', label: 'Рассылки', icon: '📢' },
    { id: 'conversations', label: 'Переписки', icon: '✉️', disabled: true, tooltip: 'Скоро' },
    { id: 'sites', label: 'Сайты', icon: '🌐' },
  ],
  // Медиа
  [
    { id: 'videos', label: 'Видеохостинг', icon: '🎬' },
    { id: 'media', label: 'Хранилище', icon: '🗂' },
  ],
  // Обучение
  [
    { id: 'learning', label: 'Обучение', icon: '📚' },
    { id: 'products', label: 'Продукты', icon: '📦' },
  ],
  // Работа
  [
    { id: 'orders', label: 'Заказы', icon: '🧾' },
    { id: 'users', label: 'Пользователи', icon: '👤' },
  ],
  // Инструменты
  [
    { id: 'analytics', label: 'Аналитика', icon: '📈' },
    { id: 'journal', label: 'Журнал', icon: '📋' },
  ],
]

const bottomItems = [
  { id: 'settings', label: 'Настройки', icon: '⚙️' },
]

export default function Sidebar({ projectName }: { projectName?: string }) {
  const pathname = usePathname()
  const params = useParams()

  const segments = pathname.split('/')
  const active = segments[segments.length - 1] === params.id ? 'dashboard' : segments[segments.length - 1]

  function href(page: string) {
    return page === 'dashboard' ? `/project/${params.id}` : `/project/${params.id}/${page}`
  }

  return (
    <aside className="w-[260px] h-screen bg-white border-r border-gray-100 flex flex-col shrink-0">
      <div className="h-16 px-6 flex items-center border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6A55F8] to-[#8B7BFA] flex items-center justify-center text-white text-sm font-bold">S</div>
          <span className="text-lg font-semibold text-gray-900">Studency</span>
        </div>
      </div>

      <div className="px-4 py-3">
        <Link
          href="/projects"
          className="w-full px-3 py-2.5 rounded-lg bg-[#F0EDFF] hover:bg-[#E8E4FF] transition-colors flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[#6A55F8] flex items-center justify-center text-white text-[10px] font-bold">
              {(projectName ?? 'P').slice(0, 2).toUpperCase()}
            </div>
            <span className="text-sm font-medium text-[#6A55F8]">{projectName || 'Проект'}</span>
          </div>
          <svg className="w-4 h-4 text-[#6A55F8]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        {navGroups.map((group, groupIdx) => (
          <div
            key={groupIdx}
            className={`space-y-0.5 ${groupIdx > 0 ? 'mt-1.5 pt-1.5 border-t border-gray-100' : ''}`}
          >
            {group.map((item) => {
              const isActive = active === item.id
              const baseClass = `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all`
              if (item.disabled) {
                return (
                  <div
                    key={item.id}
                    title={item.tooltip}
                    className={`${baseClass} text-gray-300 cursor-not-allowed select-none`}
                  >
                    <span className="text-base opacity-60">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.tooltip && (
                      <span className="text-[9px] uppercase tracking-wide text-gray-300 font-semibold">
                        {item.tooltip}
                      </span>
                    )}
                  </div>
                )
              }
              return (
                <Link
                  key={item.id}
                  href={href(item.id)}
                  prefetch={true}
                  className={`${baseClass} ${
                    isActive
                      ? 'bg-[#6A55F8] text-white shadow-sm shadow-[#6A55F8]/25'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-gray-100">
        {bottomItems.map((item) => {
          const isActive = active === item.id
          return (
            <Link
              key={item.id}
              href={href(item.id)}
              prefetch={true}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[#6A55F8] text-white shadow-sm shadow-[#6A55F8]/25'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </aside>
  )
}
