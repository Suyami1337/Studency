'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const next = searchParams.get('next') || ''

  // Если next ведёт на наш subdomain (sub.studency.ru/...) — после логина
  // нужен handoff (cookie на main не виден на subdomain). Иначе обычный push.
  function isSubdomainNext(url: string): boolean {
    try {
      const u = new URL(url)
      const root = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'studency.ru').toLowerCase()
      const h = u.hostname.toLowerCase()
      const suffix = `.${root}`
      if (!h.endsWith(suffix)) return false
      const sub = h.slice(0, h.length - suffix.length)
      return Boolean(sub) && !sub.includes('.') && sub !== 'www'
    } catch {
      return false
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? 'Неверный email или пароль'
        : error.message)
      setLoading(false)
      return
    }

    if (next && isSubdomainNext(next)) {
      // Cookie main-домена не доступна на subdomain'е — отправляем через handoff
      window.location.assign(`/api/auth/handoff-redirect?next=${encodeURIComponent(next)}`)
      return
    }

    if (next && next.startsWith('/')) {
      router.push(next)
      return
    }

    router.push('/projects')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-[#F8F7FF] to-[#F0EDFF]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#6A55F8] to-[#8B7BFA] flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4 shadow-lg shadow-[#6A55F8]/20">
            S
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Studency</h1>
          <p className="text-sm text-gray-500 mt-1">Маркетинговая платформа</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Вход в аккаунт</h2>

          {next && isSubdomainNext(next) && (
            <div className="mb-4 p-3 rounded-lg bg-[#F0EDFF] border border-[#D9D2FF] text-sm text-[#4A3FB8]">
              Войдите, чтобы продолжить — после входа вернём вас обратно.
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8] transition-all"
                placeholder="your@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Пароль</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8] transition-all"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium transition-colors shadow-sm shadow-[#6A55F8]/25 disabled:opacity-50"
            >
              {loading ? 'Входим...' : 'Войти'}
            </button>

            <div className="text-center">
              <a href="/forgot" className="text-sm text-gray-500 hover:text-[#6A55F8] hover:underline">
                Забыли пароль?
              </a>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-500">
              Нет аккаунта?{' '}
              <a
                href={next ? `/register?next=${encodeURIComponent(next)}` : '/register'}
                className="text-[#6A55F8] font-medium hover:underline"
              >
                Зарегистрироваться
              </a>
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
