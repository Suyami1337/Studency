'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ROOT_DOMAIN, validateSubdomain } from '@/lib/subdomain'

type Project = {
  id: string
  name: string
  created_at: string
}

type DomainConfig = {
  misconfigured: boolean
  configuredBy: string | null
  nameservers: string[]
  recommendedIPv4: string[]
  recommendedCNAME: string | null
  aValues: string[]
  cnames: string[]
}

type DomainState = {
  subdomain: string
  custom_domain: string | null
  custom_domain_status: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  verification?: any
  config?: DomainConfig | null
}

type Tab = 'profile' | 'domain' | 'projects' | 'danger'

function AccountSettingsInner() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab') as Tab | null
  const validTabs: Tab[] = ['profile', 'domain', 'projects', 'danger']
  const initialTab: Tab = tabParam && validTabs.includes(tabParam) ? tabParam : 'profile'
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)

  // Синхронизируем таб с URL — после reload остаёмся в том же разделе
  function selectTab(t: Tab) {
    setActiveTab(t)
    const p = new URLSearchParams(searchParams.toString())
    p.set('tab', t)
    router.replace(`?${p.toString()}`, { scroll: false })
  }

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
              onClick={() => selectTab(t.id)}
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
  const [refreshMsg, setRefreshMsg] = useState<{ kind: 'ok' | 'wait'; text: string } | null>(null)

  async function load(opts?: { silent?: boolean; check?: boolean }) {
    if (!opts?.silent) setLoading(true)
    const url = opts?.check ? '/api/account/domain?check=1' : '/api/account/domain'
    const res = await fetch(url)
    const j = await res.json()
    setState(prev => {
      // Если данные не изменились — не пере-сетим (избегаем лишний перерендер).
      // При check=1 сохраняем уже имеющийся config, если новый пустой (Vercel недоступен).
      if (prev && JSON.stringify(prev) === JSON.stringify(j)) return prev
      // Если запрос был без check — сохраняем имеющийся config из предыдущего состояния
      if (!opts?.check && prev?.config && !j.config) {
        return { ...j, config: prev.config, verification: prev.verification }
      }
      return j
    })
    setSubInput(prev => prev || (j.subdomain ?? ''))
    if (!opts?.silent) setLoading(false)
    return j as DomainState
  }
  useEffect(() => {
    // Быстрый рендер: данные из БД мгновенно (без Vercel API).
    // Затем в фоне дёргаем check=1 для актуального config.
    (async () => {
      await load()
      // background check (не блокируем UI)
      load({ silent: true, check: true })
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    await load({ silent: true })
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
    await load({ silent: true })
  }

  async function refreshDomainStatus() {
    setRefreshing(true)
    setRefreshMsg(null)
    const fresh = await load({ silent: true, check: true })
    const isVerified = fresh?.custom_domain_status === 'verified' && !fresh?.config?.misconfigured
    if (isVerified) {
      setRefreshMsg({ kind: 'ok', text: '✓ Домен успешно подключён!' })
    } else {
      setRefreshMsg({ kind: 'wait', text: 'DNS пока не отвечают. Попробуйте через 1–2 минуты.' })
    }
    setRefreshing(false)
    setTimeout(() => setRefreshMsg(null), 6000)
  }

  async function detachDomain() {
    if (!confirm('Отключить кастомный домен? Все проекты вернутся на поддомен.')) return
    await fetch('/api/account/domain', { method: 'DELETE' })
    await load()
  }

  if (loading) return <div className="text-sm text-gray-400 py-12 text-center">Загрузка...</div>

  // Реальный статус: учитываем misconfigured из Vercel config.
  // Vercel считает домен "verified" как только принял его в проект, но
  // misconfigured=true пока DNS-записи не настроены у регистратора.
  const isMisconfigured = state?.config?.misconfigured ?? true
  const dbStatus = state?.custom_domain_status ?? null
  const status: 'verified' | 'pending' | 'failed' | null =
    dbStatus === 'verified' && !isMisconfigured ? 'verified'
    : dbStatus === 'failed' ? 'failed'
    : state?.custom_domain ? 'pending'
    : null
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
            <p className="text-[11px] text-gray-400 mt-2">После подключения покажем точные DNS-записи которые надо добавить у вашего регистратора (Reg.ru, REG.RU, Namecheap и др.).</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono text-gray-900 px-3 py-2 bg-gray-50 rounded-lg flex-1">{state.custom_domain}</code>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusClass}`}>{statusLabel}</span>
            </div>

            {status !== 'verified' && (
              <DnsInstructions
                domain={state.custom_domain}
                verification={state.verification as Array<{ type: string; domain: string; value: string }> | null | undefined}
                config={state.config ?? null}
              />
            )}

            {status === 'verified' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
                ✓ Домен подключён. Клиенты могут открывать ваш сайт по адресу <code className="bg-white px-1.5 py-0.5 rounded font-mono text-green-900">{state.custom_domain}</code>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={refreshDomainStatus}
                disabled={refreshing}
                className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-60 inline-flex items-center gap-2 transition-colors"
              >
                {refreshing && (
                  <svg className="w-3.5 h-3.5 animate-spin text-[#6A55F8]" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                    <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                )}
                {refreshing ? 'Проверяем DNS...' : 'Проверить статус'}
              </button>
              <button onClick={detachDomain} className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">Отключить</button>

              {refreshMsg && (
                <span
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity ${
                    refreshMsg.kind === 'ok'
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {refreshMsg.text}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// DNS INSTRUCTIONS — пошаговая инструкция для Reg.ru / других регистраторов
// =============================================================================

type DnsRecord = {
  type: 'A' | 'CNAME' | 'TXT' | string
  name: string       // что вписать в поле «Имя» / «Subdomain»
  value: string      // что вписать в поле «Значение» / «Value»
  hint?: string      // пояснение
}

/**
 * Собирает DNS-записи которые юзеру нужно добавить.
 * Приоритет: 1) verification от Vercel (TXT для подтверждения владения),
 *            2) рекомендованные значения из config (точно правильные),
 *            3) дефолтные значения как fallback.
 */
function buildDnsRecords(
  domain: string,
  verification: Array<{ type: string; domain: string; value: string }> | null | undefined,
  config: DomainConfig | null | undefined,
): DnsRecord[] {
  const out: DnsRecord[] = []
  // apex — у него ровно одна точка (example.ru). У поддомена две и более (app.example.ru).
  const isApex = domain.split('.').length === 2

  // 1) verification (TXT и пр. от Vercel)
  if (verification && verification.length > 0) {
    for (const v of verification) {
      let name = v.domain.replace(`.${domain}`, '')
      if (v.domain === domain) name = '@'
      if (name === domain) name = '@'
      out.push({
        type: v.type,
        name: name || '@',
        value: v.value,
        hint: v.type === 'TXT' ? 'Подтверждение владения доменом — Vercel требует это перед выдачей SSL' : undefined,
      })
    }
  }

  // 2) Главная запись (A или CNAME) — указывает домен на Vercel
  const hasMainRecord = out.some(r => (r.name === '@' || r.name === domain.split('.')[0]) && (r.type === 'A' || r.type === 'CNAME'))
  if (!hasMainRecord) {
    if (isApex) {
      // Vercel рекомендует свой IP. Берём из config.recommendedIPv4 если есть.
      const ips = config?.recommendedIPv4 && config.recommendedIPv4.length > 0
        ? config.recommendedIPv4
        : ['76.76.21.21']
      for (const ip of ips) {
        out.push({
          type: 'A',
          name: '@',
          value: ip,
          hint: 'Указывает домен на серверы Vercel',
        })
      }
    } else {
      const cname = config?.recommendedCNAME ?? 'cname.vercel-dns.com.'
      out.push({
        type: 'CNAME',
        name: domain.split('.')[0],
        value: cname,
        hint: 'Указывает поддомен на Vercel',
      })
    }
  }

  return out
}

function DnsInstructions({
  domain,
  verification,
  config,
}: {
  domain: string
  verification: Array<{ type: string; domain: string; value: string }> | null | undefined
  config: DomainConfig | null | undefined
}) {
  const records = buildDnsRecords(domain, verification, config)
  const [copied, setCopied] = useState<string | null>(null)
  const isMisconfigured = config?.misconfigured ?? true

  function copy(text: string, key: string) {
    navigator.clipboard?.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="space-y-3">
      {/* Статус-полоса */}
      <div className={`rounded-lg p-4 border ${isMisconfigured ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
        <div className="flex items-start gap-3">
          <div className="text-xl shrink-0">{isMisconfigured ? '⏳' : '🔄'}</div>
          <div className="min-w-0">
            <h3 className={`text-sm font-semibold mb-1 ${isMisconfigured ? 'text-amber-900' : 'text-blue-900'}`}>
              {isMisconfigured ? 'Домен зарегистрирован, но DNS ещё не настроены' : 'Ждём подтверждения DNS'}
            </h3>
            <p className={`text-xs ${isMisconfigured ? 'text-amber-800/90' : 'text-blue-800/90'}`}>
              Чтобы домен заработал — добавьте DNS-записи ниже в личном кабинете Reg.ru.
            </p>
          </div>
        </div>
      </div>

      {/* DNS-записи */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Какие записи добавить</h3>
          <p className="text-xs text-gray-500">Зайдите в личный кабинет Reg.ru → раздел DNS-управления для <code className="bg-gray-100 px-1 rounded font-mono">{domain}</code> → добавьте {records.length === 1 ? 'эту запись' : 'эти записи'}:</p>
        </div>

        <div className="space-y-2">
          {records.map((r, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
              <div className="flex items-center gap-3 mb-2">
                <span className="px-2 py-0.5 rounded bg-[#6A55F8] text-white text-[11px] font-bold font-mono">{r.type}</span>
                {r.hint && <span className="text-[11px] text-gray-500">{r.hint}</span>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Имя / Subdomain</div>
                  <div className="flex items-center gap-2 bg-white rounded-md border border-gray-200 px-3 py-2">
                    <code className="font-mono text-sm text-gray-900 flex-1 truncate">{r.name}</code>
                    <button onClick={() => copy(r.name, `n${i}`)} className="text-[11px] text-[#6A55F8] hover:underline shrink-0">
                      {copied === `n${i}` ? '✓ скопировано' : 'копировать'}
                    </button>
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Значение / Value</div>
                  <div className="flex items-center gap-2 bg-white rounded-md border border-gray-200 px-3 py-2 min-w-0">
                    <code className="font-mono text-sm text-gray-900 flex-1 truncate">{r.value}</code>
                    <button onClick={() => copy(r.value, `v${i}`)} className="text-[11px] text-[#6A55F8] hover:underline shrink-0">
                      {copied === `v${i}` ? '✓ скопировано' : 'копировать'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <ol className="text-xs text-gray-700 space-y-1.5 pt-3 border-t border-gray-100 list-decimal list-inside leading-relaxed">
          <li>Если для имени <code className="bg-gray-100 px-1 rounded">@</code> или <code className="bg-gray-100 px-1 rounded">www</code> уже есть старые записи A/CNAME — удалите их.</li>
          <li>Сохраните изменения у регистратора.</li>
          <li>Подождите 10–30 минут — DNS кешируется в интернете.</li>
          <li>Нажмите кнопку <span className="font-semibold">«Проверить статус»</span> ниже.</li>
          <li>Когда статус станет «Подключён» — SSL-сертификат выдастся автоматически.</li>
        </ol>
      </div>

      {/* Гайд по конкретным регистраторам */}
      <details className="bg-white border border-gray-200 rounded-lg">
        <summary className="cursor-pointer p-4 text-sm font-semibold text-gray-900 hover:text-[#6A55F8]">
          Пошаговый гайд для Reg.ru
        </summary>
        <div className="px-4 pb-4 text-xs text-gray-600 space-y-2 leading-relaxed">
          <ol className="space-y-1.5 list-decimal list-inside">
            <li>Откройте <a href="https://www.reg.ru/user/account" target="_blank" rel="noopener" className="text-[#6A55F8] hover:underline">reg.ru/user/account</a> и войдите.</li>
            <li>«Мои домены и услуги» → нажмите на <code className="bg-gray-100 px-1 rounded">{domain}</code>.</li>
            <li>В левом меню выберите <strong>«DNS-серверы и управление зоной»</strong>.</li>
            <li>Если стоит «Не использовать DNS reg.ru» — переключите на <strong>«Использовать DNS-серверы reg.ru»</strong> и сохраните. Иначе настройки DNS не будут видны.</li>
            <li>В таблице DNS-записей нажмите <strong>«Добавить запись»</strong>.</li>
            <li>Выберите тип записи ({records.map(r => r.type).filter((v, i, a) => a.indexOf(v) === i).join(' / ')}), скопируйте «Имя» и «Значение» из таблицы выше.</li>
            <li>Сохраните. Повторите для каждой записи.</li>
            <li>DNS обновится за 10–30 минут.</li>
          </ol>
          <p className="pt-2 text-gray-500">⚠️ Если в кабинете не активен раздел «Управление зоной» — проверьте, что в DNS-серверах выбрано «Бесплатные DNS-серверы Reg.ru» (ns1.reg.ru / ns2.reg.ru). Если стоят чужие NS — DNS управляется не в Reg.ru, и записи надо добавлять там же.</p>
        </div>
      </details>
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
