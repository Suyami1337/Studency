'use client'

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'funnels', label: 'Воронки', icon: '🔄' },
  { id: 'crm', label: 'CRM', icon: '👥' },
  { id: 'chatbots', label: 'Чат-боты', icon: '💬' },
  { id: 'sites', label: 'Сайты', icon: '🌐' },
  { id: 'learning', label: 'Обучение', icon: '📚' },
  { id: 'products', label: 'Продукты', icon: '📦' },
  { id: 'orders', label: 'Заказы', icon: '🧾' },
  { id: 'analytics', label: 'Аналитика', icon: '📈' },
  { id: 'users', label: 'Пользователи', icon: '👤' },
]

const bottomItems = [
  { id: 'settings', label: 'Настройки', icon: '⚙️' },
]

export default function Sidebar({ active, onNavigate }: { active: string; onNavigate: (s: string) => void }) {
  return (
    <aside className="w-[260px] h-screen bg-white border-r border-gray-100 flex flex-col shrink-0">
      {/* Logo */}
      <div className="h-16 px-6 flex items-center border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6A55F8] to-[#8B7BFA] flex items-center justify-center text-white text-sm font-bold">
            S
          </div>
          <span className="text-lg font-semibold text-gray-900">Studency</span>
        </div>
      </div>

      {/* Project selector */}
      <div className="px-4 py-3">
        <button
          onClick={() => onNavigate('projects')}
          className="w-full px-3 py-2.5 rounded-lg bg-[#F0EDFF] hover:bg-[#E8E4FF] transition-colors flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[#6A55F8] flex items-center justify-center text-white text-[10px] font-bold">AI</div>
            <span className="text-sm font-medium text-[#6A55F8]">AI-Маркетинг Школа</span>
          </div>
          <svg className="w-4 h-4 text-[#6A55F8]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = active === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[#6A55F8] text-white shadow-sm shadow-[#6A55F8]/25'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-3 border-t border-gray-100">
        {bottomItems.map((item) => {
          const isActive = active === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[#6A55F8] text-white shadow-sm shadow-[#6A55F8]/25'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
