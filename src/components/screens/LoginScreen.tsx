'use client'

export default function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-[#F8F7FF] to-[#F0EDFF]">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#6A55F8] to-[#8B7BFA] flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4 shadow-lg shadow-[#6A55F8]/20">
            S
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Studency</h1>
          <p className="text-sm text-gray-500 mt-1">Маркетинговая платформа</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Вход в аккаунт</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                defaultValue="hasan@studency.ru"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8] transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Пароль</label>
              <input
                type="password"
                defaultValue="password123"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8] transition-all"
              />
            </div>

            <button
              onClick={onLogin}
              className="w-full py-2.5 rounded-lg bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium transition-colors shadow-sm shadow-[#6A55F8]/25"
            >
              Войти
            </button>
          </div>

          <div className="mt-4 text-center">
            <a href="#" className="text-sm text-[#6A55F8] hover:underline">Забыли пароль?</a>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-500">
              Нет аккаунта?{' '}
              <a href="#" className="text-[#6A55F8] font-medium hover:underline">Зарегистрироваться</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
