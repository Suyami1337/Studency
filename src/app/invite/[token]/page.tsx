'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type InvitationInfo = {
  valid: boolean
  reason?: 'expired' | 'used' | 'not_found'
  email?: string
  school_name?: string
  role_label?: string
  role_code?: string
  role_access_type?: 'admin_panel' | 'student_panel' | 'no_access'
  is_existing_user?: boolean
}

export default function InvitePage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string
  const supabase = createClient()

  const [info, setInfo] = useState<InvitationInfo | null>(null)
  const [loading, setLoading] = useState(true)

  // Форма регистрации (новый user)
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  // Форма входа (существующий user)
  const [loginPassword, setLoginPassword] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/auth/invitation/${token}`)
      .then(r => r.json())
      .then((data: InvitationInfo) => setInfo(data))
      .catch(() => setInfo({ valid: false, reason: 'not_found' }))
      .finally(() => setLoading(false))
  }, [token])

  async function landingAfterAccept(accessType?: string) {
    // Куда отправлять после успеха:
    // student_panel → /learn
    // admin_panel → /projects (выбор проекта; на текущем хосте — это школа)
    if (accessType === 'student_panel') {
      window.location.href = '/learn'
    } else {
      window.location.href = '/projects'
    }
  }

  async function handleAcceptNew(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Пароль должен быть не менее 6 символов')
      return
    }
    setSubmitting(true)

    const res = await fetch('/api/auth/accept-invitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, full_name: fullName, password }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Не удалось принять приглашение')
      setSubmitting(false)
      return
    }

    // Логиним юзера
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: data.email,
      password,
    })
    if (signInErr) {
      setError('Аккаунт создан, но не удалось войти. Попробуйте на странице входа.')
      setSubmitting(false)
      router.push('/login')
      return
    }

    await landingAfterAccept(info?.role_access_type)
  }

  async function handleAcceptExisting(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!info?.email) return
    setSubmitting(true)

    // Сначала логин — чтобы убедиться что пароль верный
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: info.email,
      password: loginPassword,
    })
    if (signInErr) {
      setError('Неверный пароль')
      setSubmitting(false)
      return
    }

    // Потом accept
    const res = await fetch('/api/auth/accept-invitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Не удалось принять приглашение')
      setSubmitting(false)
      return
    }

    await landingAfterAccept(info?.role_access_type)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-[#F8F7FF] to-[#F0EDFF]">
        <div className="text-sm text-gray-500">Загрузка приглашения…</div>
      </div>
    )
  }

  if (!info?.valid) {
    const reasonText = {
      expired: 'Срок действия приглашения истёк. Попросите менеджера выслать новое.',
      used: 'Это приглашение уже использовано.',
      not_found: 'Приглашение не найдено.',
    }[info?.reason || 'not_found']
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-[#F8F7FF] to-[#F0EDFF]">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center text-2xl mx-auto mb-4">!</div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Ссылка недоступна</h2>
            <p className="text-sm text-gray-500">{reasonText}</p>
          </div>
        </div>
      </div>
    )
  }

  const headerCard = (
    <div className="text-center mb-6">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#6A55F8] to-[#8B7BFA] flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4 shadow-lg shadow-[#6A55F8]/20">S</div>
      <h1 className="text-xl font-bold text-gray-900">{info.school_name}</h1>
      <p className="text-sm text-gray-500 mt-1">
        Вас пригласили как «<strong>{info.role_label}</strong>»
      </p>
      <p className="text-xs text-gray-400 mt-1">{info.email}</p>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-[#F8F7FF] to-[#F0EDFF] py-10">
      <div className="w-full max-w-sm">
        {headerCard}

        {info.is_existing_user ? (
          <form onSubmit={handleAcceptExisting} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <h2 className="text-base font-semibold text-gray-900 mb-2">Войти и принять</h2>
            <p className="text-sm text-gray-500 mb-6">У вас уже есть аккаунт. Введите пароль, чтобы получить доступ к школе.</p>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Пароль</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8]"
                  placeholder="Ваш пароль"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-lg bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium transition-colors shadow-sm shadow-[#6A55F8]/25 disabled:opacity-50"
              >
                {submitting ? 'Принимаем…' : 'Войти и принять'}
              </button>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-100 text-center">
              <a href="/forgot" className="text-sm text-[#6A55F8] hover:underline">Забыли пароль?</a>
            </div>
          </form>
        ) : (
          <form onSubmit={handleAcceptNew} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <h2 className="text-base font-semibold text-gray-900 mb-2">Завершите регистрацию</h2>
            <p className="text-sm text-gray-500 mb-6">Укажите имя и придумайте пароль для входа.</p>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Имя</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8]"
                  placeholder="Как к вам обращаться"
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
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-lg bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium transition-colors shadow-sm shadow-[#6A55F8]/25 disabled:opacity-50"
              >
                {submitting ? 'Создаём аккаунт…' : 'Принять приглашение'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
