'use client'

export default function ProjectDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">Аналитика будет доступна после настройки воронок и модулей</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
        <div className="text-4xl mb-4">📊</div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Добро пожаловать в проект</h2>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Начните с создания воронки или CRM-доски. Данные появятся здесь автоматически по мере работы.
        </p>
        <div className="flex items-center justify-center gap-3 mt-6">
          <a href="funnels" className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Создать воронку
          </a>
          <a href="crm" className="border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            Создать CRM
          </a>
        </div>
      </div>
    </div>
  )
}
