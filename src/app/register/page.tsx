'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { validateSubdomain, suggestSubdomainFromName, ROOT_DOMAIN } from '@/lib/subdomain'

function RegisterForm() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [subdomain, setSubdomain] = useState('')
  const [subdomainTouched, setSubdomainTouched] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const searchParams = useSearchParams()
  const supabase = createClient()
  const next = searchParams.get('next') || ''
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : '/login'

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (password.length < 6) {
      setError('Пароль должен быть не менее 6 символов')
      setLoading(false)
      return
    }

    const sub = (subdomain || suggestSubdomainFromName(fullName)).toLowerCase().trim()
    const subErr = validateSubdomain(sub)
    if (subErr) {
      setError('Поддомен: ' + subErr)
      setLoading(false)
      return
    }

    // Проверяем что subdomain не занят (до signUp, чтобы не создавать юзера зря)
    const checkRes = await fetch(`/api/account/subdomain-available?sub=${encodeURIComponent(sub)}`)
    const checkData = await checkRes.json()
    if (!checkData.available) {
      setError(`Поддомен «${sub}» уже занят. Попробуй другой.`)
      setLoading(false)
      return
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, pending_subdomain: sub },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    // Если подтверждение email отключено — сразу создаём account_domains
    // и инициализируем users_meta (can_create_projects=TRUE — это «владелец платформы»).
    if (signUpData.session) {
      await Promise.all([
        fetch('/api/account/domain', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subdomain: sub }),
        }).catch(() => { /* ignore — юзер сможет настроить позже */ }),
        fetch('/api/auth/init-self-registration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ full_name: fullName }),
        }).catch(() => { /* ignore — может пере-инициализироваться позже */ }),
      ])
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-[#F8F7FF] to-[#F0EDFF]">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center text-2xl mx-auto mb-4">✓</div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Проверьте почту</h2>
            <p className="text-sm text-gray-500 mb-6">
              Мы отправили письмо на <strong>{email}</strong>. Перейдите по ссылке для подтверждения аккаунта.
            </p>
            <a href={loginHref} className="text-sm text-[#6A55F8] font-medium hover:underline">Перейти на страницу входа →</a>
          </div>
        </div>
      </div>
    )
  }

  const previewSub = (subdomain || (fullName ? suggestSubdomainFromName(fullName) : '')).toLowerCase()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-[#F8F7FF] to-[#F0EDFF] py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#6A55F8] to-[#8B7BFA] flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4 shadow-lg shadow-[#6A55F8]/20">
            S
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Studency</h1>
          <p className="text-sm text-gray-500 mt-1">Создайте аккаунт</p>
        </div>

        <form onSubmit={handleRegister} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Регистрация</h2>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Имя</label>
              <input
                type="text"
                value={fullName}
                onChange={e => {
                  setFullName(e.target.value)
                  if (!subdomainTouched) setSubdomain(suggestSubdomainFromName(e.target.value))
                }}
                required
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8]"
                placeholder="Ваше имя"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8]"
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
                minLength={6}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8]"
                placeholder="Минимум 6 символов"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Поддомен школы</label>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={subdomain}
                  onChange={e => { setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setSubdomainTouched(true) }}
                  required
                  className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8]"
                  placeholder="shkola"
                />
                <span className="text-sm text-gray-500 font-mono whitespace-nowrap">.{ROOT_DOMAIN}</span>
              </div>
              {previewSub && (
                <p className="text-xs text-gray-500 mt-1.5">
                  Все ваши проекты будут жить на <code className="bg-gray-100 px-1 rounded font-mono">{previewSub}.{ROOT_DOMAIN}</code>
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium transition-colors shadow-sm shadow-[#6A55F8]/25 disabled:opacity-50"
            >
              {loading ? 'Регистрируем...' : 'Создать аккаунт'}
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-500">
              Уже есть аккаунт?{' '}
              <a href={loginHref} className="text-[#6A55F8] font-medium hover:underline">Войти</a>
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  )
}
