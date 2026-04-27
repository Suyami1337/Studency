'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Stage = 'email' | 'code' | 'success'

export default function ForgotPage() {
  const router = useRouter()
  const supabase = createClient()
  const [stage, setStage] = useState<Stage>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setSubmitting(true)

    const res = await fetch('/api/auth/forgot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await res.json()
    setSubmitting(false)

    if (!res.ok) {
      setError(data.error || 'Что-то пошло не так')
      return
    }
    if (data.info === 'rate_limited') {
      setInfo(`Подождите ${data.wait_seconds} сек прежде чем запросить новый код.`)
      // не переключаем stage — пусть юзер попробует ввести код от прошлого письма
      setStage('code')
      return
    }
    setStage('code')
    setInfo('Код отправлен на почту. Проверьте папку «Спам» если не пришёл.')
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')

    if (!/^\d{6}$/.test(code)) {
      setError('Код должен быть 6 цифр')
      return
    }
    if (newPassword.length < 6) {
      setError('Пароль не менее 6 символов')
      return
    }
    setSubmitting(true)

    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, new_password: newPassword }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Не удалось сменить пароль')
      setSubmitting(false)
      return
    }

    // Логиним сразу с новым паролем
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password: newPassword,
    })
    setSubmitting(false)

    if (signInErr) {
      setStage('success')
      return
    }
    setStage('success')
    setTimeout(() => router.push('/projects'), 1500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-[#F8F7FF] to-[#F0EDFF] py-10 px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#6A55F8] to-[#8B7BFA] flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4 shadow-lg shadow-[#6A55F8]/20">S</div>
          <h1 className="text-2xl font-bold text-gray-900">Восстановление пароля</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {stage === 'email' && (
            <form onSubmit={handleSendCode}>
              <h2 className="text-base font-semibold text-gray-900 mb-2">Введите email</h2>
              <p className="text-sm text-gray-500 mb-6">Мы отправим 6-значный код для смены пароля.</p>

              {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="your@email.com"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8] mb-4"
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-lg bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium disabled:opacity-50"
              >
                {submitting ? 'Отправляем…' : 'Отправить код'}
              </button>

              <div className="mt-6 pt-6 border-t border-gray-100 text-center">
                <a href="/login" className="text-sm text-[#6A55F8] hover:underline">← Вернуться к входу</a>
              </div>
            </form>
          )}

          {stage === 'code' && (
            <form onSubmit={handleResetPassword}>
              <h2 className="text-base font-semibold text-gray-900 mb-2">Введите код и новый пароль</h2>
              <p className="text-sm text-gray-500 mb-6">Код выслан на <strong>{email}</strong>.</p>

              {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
              {info && <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-700">{info}</div>}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">6-значный код</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    autoFocus
                    placeholder="123456"
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-lg tracking-[0.5em] font-mono text-center focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Новый пароль</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Минимум 6 символов"
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 rounded-lg bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium disabled:opacity-50"
                >
                  {submitting ? 'Сохраняем…' : 'Сменить пароль'}
                </button>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-100 flex items-center justify-between">
                <button type="button" onClick={() => { setStage('email'); setCode(''); setNewPassword('') }} className="text-sm text-gray-500 hover:underline">← Изменить email</button>
                <button
                  type="button"
                  onClick={async () => {
                    setError('')
                    setInfo('')
                    const res = await fetch('/api/auth/forgot', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email }),
                    })
                    const data = await res.json()
                    if (data.info === 'rate_limited') {
                      setInfo(`Подождите ${data.wait_seconds} сек.`)
                    } else {
                      setInfo('Код выслан повторно.')
                    }
                  }}
                  className="text-sm text-[#6A55F8] hover:underline"
                >
                  Выслать снова
                </button>
              </div>
            </form>
          )}

          {stage === 'success' && (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center text-2xl mx-auto mb-4">✓</div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Пароль изменён</h2>
              <p className="text-sm text-gray-500 mb-6">Сейчас перенаправим в кабинет…</p>
              <a href="/projects" className="text-sm text-[#6A55F8] font-medium hover:underline">Перейти вручную →</a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
