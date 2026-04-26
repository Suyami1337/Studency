'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { ROOT_DOMAIN } from '@/lib/subdomain'

type Project = {
  id: string
  name: string
  subdomain: string
  custom_domain: string | null
  custom_domain_status: string | null
  created_at: string
}

export default function AccountSettingsPage() {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<'profile' | 'projects' | 'danger'>('profile')

  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(true)

  const [projects, setProjects] = useState<Project[]>([])
  const [deletingProject, setDeletingProject] = useState<string | null>(null)
  const [confirmProjectId, setConfirmProjectId] = useState<string | null>(null)

  const [confirmAccount, setConfirmAccount] = useState(false)
  const [accountConfirmText, setAccountConfirmText] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [accountError, setAccountError] = useState('')

  const [loggingOut, setLoggingOut] = useState(false)

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setEmail(user.email ?? '')
      setFullName((user.user_metadata?.full_name as string) ?? '')
    }
    const { data } = await supabase
      .from('projects')
      .select('id, name, subdomain, custom_domain, custom_domain_status, created_at')
      .order('created_at', { ascending: false })
    setProjects(data ?? [])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  async function handleLogout() {
    setLoggingOut(true)
    // global-logout сам почистит cookie на текущем хосте, потом redirect через main domain
    window.location.assign('/api/auth/global-logout')
  }

  async function handleDeleteProject(projectId: string) {
    setDeletingProject(projectId)
    const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert('Не удалось удалить: ' + (j.error || 'неизвестная ошибка'))
      setDeletingProject(null)
      return
    }
    setProjects(prev => prev.filter(p => p.id !== projectId))
    setDeletingProject(null)
    setConfirmProjectId(null)
  }

  async function handleDeleteAccount() {
    setDeletingAccount(true)
    setAccountError('')
    const res = await fetch('/api/account/delete', { method: 'POST' })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      setAccountError(j.error || 'Не удалось удалить аккаунт')
      setDeletingAccount(false)
      return
    }
    window.location.assign(j.redirect || `https://${ROOT_DOMAIN}/login`)
  }

  const tabs = [
    { id: 'profile' as const, label: 'Профиль' },
    { id: 'projects' as const, label: 'Мои проекты' },
    { id: 'danger' as const, label: 'Опасная зона' },
  ]

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-[#F8F7FF] to-[#F0EDFF]">
        <div className="text-sm text-gray-500">Загрузка...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#F8F7FF] to-[#F0EDFF]">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Настройки аккаунта</h1>
            <p className="text-sm text-gray-500 mt-0.5">{email}</p>
          </div>
          <Link href="/projects" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
            ← К проектам
          </Link>
        </div>

        <div className="flex items-center gap-1 border-b border-gray-200 mb-6">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${
                activeTab === t.id ? 'border-[#6A55F8] text-[#6A55F8]' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'profile' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Email</label>
              <div className="px-4 py-2.5 rounded-lg bg-gray-50 border border-gray-100 text-sm text-gray-900">
                {email}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Имя</label>
              <div className="px-4 py-2.5 rounded-lg bg-gray-50 border border-gray-100 text-sm text-gray-900">
                {fullName || <span className="text-gray-400">Не указано</span>}
              </div>
            </div>

            <div className="pt-5 border-t border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">Выход из аккаунта</p>
                <p className="text-xs text-gray-500 mt-0.5">Завершит сессию на этом устройстве</p>
              </div>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-medium text-gray-700 transition-colors disabled:opacity-50"
              >
                {loggingOut ? 'Выходим...' : 'Выйти'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'projects' && (
          <div className="space-y-3">
            {projects.length === 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-sm text-gray-500">
                У вас пока нет проектов
              </div>
            )}
            {projects.map(p => (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center justify-between">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#6A55F8] to-[#8B7BFA] flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {p.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{p.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5 font-mono truncate">
                      {p.custom_domain && p.custom_domain_status === 'verified'
                        ? p.custom_domain
                        : `${p.subdomain}.${ROOT_DOMAIN}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/project/${p.id}`}
                    className="text-xs text-[#6A55F8] hover:underline px-2"
                  >
                    Открыть
                  </Link>
                  {confirmProjectId === p.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDeleteProject(p.id)}
                        disabled={deletingProject === p.id}
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                      >
                        {deletingProject === p.id ? 'Удаляем...' : 'Да, удалить'}
                      </button>
                      <button
                        onClick={() => setConfirmProjectId(null)}
                        className="px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-50"
                      >
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmProjectId(p.id)}
                      className="px-3 py-1.5 rounded-lg border border-red-200 text-xs text-red-600 hover:bg-red-50"
                    >
                      Удалить
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'danger' && (
          <div className="bg-white rounded-2xl border border-red-200 p-6">
            <h2 className="text-base font-semibold text-red-700 mb-1">Удалить аккаунт</h2>
            <p className="text-sm text-gray-600 mb-4">
              Это действие необратимо. Будут удалены: ваш аккаунт, все проекты ({projects.length}),
              все клиенты, лендинги, боты, рассылки и связанные данные.
            </p>

            {!confirmAccount ? (
              <button
                onClick={() => setConfirmAccount(true)}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
              >
                Удалить аккаунт
              </button>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Для подтверждения введите <code className="bg-gray-100 px-1 rounded font-mono">УДАЛИТЬ</code>
                  </label>
                  <input
                    type="text"
                    value={accountConfirmText}
                    onChange={e => setAccountConfirmText(e.target.value)}
                    autoFocus
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                    placeholder="УДАЛИТЬ"
                  />
                </div>
                {accountError && (
                  <p className="text-sm text-red-600">{accountError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleDeleteAccount}
                    disabled={accountConfirmText !== 'УДАЛИТЬ' || deletingAccount}
                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deletingAccount ? 'Удаляем...' : 'Подтвердить удаление'}
                  </button>
                  <button
                    onClick={() => { setConfirmAccount(false); setAccountConfirmText(''); setAccountError('') }}
                    className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
