'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ROOT_DOMAIN, validateSubdomain } from '@/lib/subdomain'

type Project = {
  id: string
  name: string
  created_at: string
}

type DomainState = {
  subdomain: string
  custom_domain: string | null
  custom_domain_status: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  verification?: any
}

function AccountSettingsInner() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as 'profile' | 'domain' | 'projects' | 'danger') || 'profile'
  const [activeTab, setActiveTab] = useState<'profile' | 'domain' | 'projects' | 'danger'>(initialTab)

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
      .select('id, name, created_at')
      .order('created_at', { ascending: false })
    setProjects(data ?? [])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  async function handleLogout() {
    setLoggingOut(true)
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
    { id: 'domain' as const, label: 'Домен' },
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

        {activeTab === 'domain' && <DomainTab />}

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
                    <p className="text-xs text-gray-500 mt-0.5">
                      создан {new Date(p.created_at).toLocaleDateString('ru')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={`/project/${p.id}`}
                    className="text-xs text-[#6A55F8] hover:underline px-2"
                  >
                    Открыть
                  </a>
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

// =============================================================================
// DOMAIN TAB — настройка subdomain и custom_domain аккаунта
// =============================================================================
function DomainTab() {
  const [state, setState] = useState<DomainState | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingSub, setEditingSub] = useState(false)
  const [subInput, setSubInput] = useState('')
  const [subSaving, setSubSaving] = useState(false)
  const [subError, setSubError] = useState('')
  const [domainInput, setDomainInput] = useState('')
  const [domainSaving, setDomainSaving] = useState(false)
  const [domainError, setDomainError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/account/domain')
    const j = await res.json()
    setState(j)
    setSubInput(j.subdomain ?? '')
    setLoading(false)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  async function saveSubdomain() {
    const sub = subInput.toLowerCase().trim()
    const err = validateSubdomain(sub)
    if (err) { setSubError(err); return }
    setSubSaving(true); setSubError('')
    const res = await fetch('/api/account/domain', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subdomain: sub }),
    })
    const j = await res.json()
    if (!res.ok) { setSubError(j.error || 'Не удалось сохранить'); setSubSaving(false); return }
    setEditingSub(false)
    setSubSaving(false)
    await load()
  }

  async function attachDomain() {
    const d = domainInput.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!d) { setDomainError('Укажи домен'); return }
    setDomainSaving(true); setDomainError('')
    const res = await fetch('/api/account/domain', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ custom_domain: d }),
    })
    const j = await res.json()
    if (!res.ok) { setDomainError(j.error || 'Не удалось добавить домен'); setDomainSaving(false); return }
    setDomainInput('')
    setDomainSaving(false)
    await load()
  }

  async function refreshDomainStatus() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function detachDomain() {
    if (!confirm('Отключить кастомный домен? Все проекты вернутся на поддомен.')) return
    await fetch('/api/account/domain', { method: 'DELETE' })
    await load()
  }

  if (loading) return <div className="text-sm text-gray-400 py-12 text-center">Загрузка...</div>

  const status = state?.custom_domain_status ?? null
  const statusLabel = status === 'verified' ? 'Подключён' : status === 'failed' ? 'Ошибка' : 'Ожидает DNS'
  const statusClass = status === 'verified' ? 'bg-green-50 text-green-700 border-green-200' : status === 'failed' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'

  return (
    <div className="space-y-5">
      {/* Поддомен */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Поддомен аккаунта</h2>
            <p className="text-xs text-gray-500 mt-0.5">Под этим адресом живут ВСЕ ваши проекты.</p>
          </div>
          {!editingSub && state?.subdomain && (
            <button onClick={() => setEditingSub(true)} className="text-sm text-[#6A55F8] hover:underline">Изменить</button>
          )}
        </div>
        {editingSub || !state?.subdomain ? (
          <div>
            <div className="flex items-center gap-1 mb-2">
              <input value={subInput} onChange={e => { setSubInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setSubError('') }}
                placeholder="shkola"
                className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8]" />
              <span className="text-sm text-gray-500 font-mono whitespace-nowrap">.{ROOT_DOMAIN}</span>
            </div>
            {subError && <p className="text-sm text-red-500 mb-2">{subError}</p>}
            <div className="flex gap-2">
              <button onClick={saveSubdomain} disabled={subSaving} className="px-4 py-2 bg-[#6A55F8] text-white rounded-lg text-sm font-medium hover:bg-[#5040D6] disabled:opacity-50">
                {subSaving ? 'Сохраняем...' : 'Сохранить'}
              </button>
              {state?.subdomain && (
                <button onClick={() => { setEditingSub(false); setSubInput(state.subdomain); setSubError('') }} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg">Отмена</button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 rounded-lg">
            <code className="text-sm font-mono text-gray-900">{state.subdomain}.{ROOT_DOMAIN}</code>
            <a href={`https://${state.subdomain}.${ROOT_DOMAIN}`} target="_blank" rel="noopener" className="text-xs text-[#6A55F8] hover:underline ml-auto">Открыть ↗</a>
          </div>
        )}
      </div>

      {/* Кастомный домен */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Свой домен</h2>
        <p className="text-xs text-gray-500 mb-4">Подключите свой домен — клиенты будут видеть его вместо поддомена.</p>

        {!state?.custom_domain ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <input value={domainInput} onChange={e => { setDomainInput(e.target.value); setDomainError('') }}
                placeholder="shkola.com"
                className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8]" />
              <button onClick={attachDomain} disabled={domainSaving || !domainInput.trim()}
                className="px-4 py-2 bg-[#6A55F8] text-white rounded-lg text-sm font-medium hover:bg-[#5040D6] disabled:opacity-50 whitespace-nowrap">
                {domainSaving ? 'Подключаем...' : 'Подключить'}
              </button>
            </div>
            {domainError && <p className="text-sm text-red-500">{domainError}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono text-gray-900 px-3 py-2 bg-gray-50 rounded-lg flex-1">{state.custom_domain}</code>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusClass}`}>{statusLabel}</span>
            </div>
            {state.verification && Array.isArray(state.verification) && state.verification.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-blue-900 mb-2">Настройте DNS у регистратора:</p>
                <div className="space-y-1.5 font-mono text-xs">
                  {(state.verification as Array<{ type: string; domain: string; value: string }>).map((v, i) => (
                    <div key={i} className="flex flex-wrap gap-2 text-gray-700">
                      <span className="font-bold text-blue-700">{v.type}</span>
                      <span>{v.domain}</span>
                      <span>→</span>
                      <span className="break-all">{v.value}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-blue-700 mt-3">После настройки DNS — нажмите «Проверить». Vercel сам выдаст SSL.</p>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={refreshDomainStatus} disabled={refreshing} className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
                {refreshing ? 'Проверяем...' : 'Проверить статус'}
              </button>
              <button onClick={detachDomain} className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">Отключить</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AccountSettingsPage() {
  return (
    <Suspense fallback={null}>
      <AccountSettingsInner />
    </Suspense>
  )
}
