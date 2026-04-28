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
          <ProfileTab
            email={email}
            fullName={fullName}
            onLogout={handleLogout}
            loggingOut={loggingOut}
          />
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

        <ol className="text-sm text-gray-800 space-y-2 pt-4 border-t border-gray-100 list-decimal list-inside leading-relaxed">
          <li>Откройте <a href="https://www.reg.ru/user/account" target="_blank" rel="noopener" className="text-[#6A55F8] hover:underline">reg.ru</a> → «Мои домены» → <code className="bg-gray-100 px-1 rounded font-mono">{domain}</code> → «DNS-серверы и управление зоной».</li>
          <li>Удалите старые записи A/CNAME для имени <code className="bg-gray-100 px-1 rounded">@</code> или <code className="bg-gray-100 px-1 rounded">www</code>, если они есть.</li>
          <li>Нажмите «Добавить запись» и внесите {records.length === 1 ? 'запись' : 'обе записи'} из таблицы выше.</li>
          <li>Подождите 10–30 минут и нажмите <span className="font-semibold">«Проверить статус»</span>.</li>
        </ol>
      </div>
    </div>
  )
}

// ─── ProfileTab — email/имя/пароль ───
function ProfileTab({
  email, fullName, onLogout, loggingOut,
}: {
  email: string
  fullName: string
  onLogout: () => void
  loggingOut: boolean
}) {
  const supabase = createClient()
  const [editingEmail, setEditingEmail] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [showPwdForm, setShowPwdForm] = useState(false)

  const [emailDraft, setEmailDraft] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [emailSuccess, setEmailSuccess] = useState(false)

  const [nameDraft, setNameDraft] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameError, setNameError] = useState('')
  const [currentName, setCurrentName] = useState(fullName)

  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [newPwd2, setNewPwd2] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdError, setPwdError] = useState('')
  const [pwdSuccess, setPwdSuccess] = useState(false)

  async function handleSaveEmail() {
    setEmailError('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDraft)) {
      setEmailError('Некорректный email')
      return
    }
    setEmailSaving(true)
    const { error } = await supabase.auth.updateUser({ email: emailDraft.trim().toLowerCase() })
    setEmailSaving(false)
    if (error) { setEmailError(error.message); return }
    setEmailSuccess(true)
    setEditingEmail(false)
    setEmailDraft('')
  }

  async function handleSaveName() {
    setNameError('')
    setNameSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setNameSaving(false); return }
    const trimmed = nameDraft.trim() || null
    const { error } = await supabase.from('users_meta').upsert({
      user_id: user.id,
      full_name: trimmed,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    setNameSaving(false)
    if (error) { setNameError(error.message); return }
    setCurrentName(trimmed ?? '')
    setEditingName(false)
  }

  async function handleChangePassword() {
    setPwdError('')
    if (newPwd.length < 6) { setPwdError('Новый пароль не менее 6 символов'); return }
    if (newPwd !== newPwd2) { setPwdError('Пароли не совпадают'); return }

    setPwdSaving(true)
    // Сначала проверяем старый пароль через signInWithPassword
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: oldPwd })
    if (signInErr) { setPwdSaving(false); setPwdError('Текущий пароль неверный'); return }

    // Меняем на новый
    const { error: updErr } = await supabase.auth.updateUser({ password: newPwd })
    setPwdSaving(false)
    if (updErr) { setPwdError(updErr.message); return }
    setPwdSuccess(true)
    setOldPwd(''); setNewPwd(''); setNewPwd2('')
    setTimeout(() => { setShowPwdForm(false); setPwdSuccess(false) }, 2500)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
      {/* Email */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Email</label>
        {emailSuccess && (
          <div className="mb-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-2.5">
            ✓ Письмо с подтверждением отправлено на новый адрес. Кликните по ссылке в письме, чтобы завершить смену.
          </div>
        )}
        {!editingEmail ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 px-4 py-2.5 rounded-lg bg-gray-50 border border-gray-100 text-sm text-gray-900">
              {email}
            </div>
            <button
              onClick={() => { setEditingEmail(true); setEmailDraft(email) }}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-[#6A55F8] hover:text-[#6A55F8]"
            >
              Изменить
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="email"
              autoFocus
              value={emailDraft}
              onChange={e => setEmailDraft(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-[#6A55F8] text-sm focus:outline-none"
              placeholder="new@email.com"
            />
            {emailError && <div className="text-xs text-red-600">{emailError}</div>}
            <div className="flex gap-2">
              <button onClick={() => { setEditingEmail(false); setEmailError('') }} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm">Отмена</button>
              <button onClick={handleSaveEmail} disabled={emailSaving || !emailDraft || emailDraft === email} className="flex-1 py-2 rounded-lg bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium disabled:opacity-50">
                {emailSaving ? 'Отправляем…' : 'Сменить email'}
              </button>
            </div>
            <p className="text-xs text-gray-400">На новый адрес придёт письмо с ссылкой подтверждения. Email не сменится пока вы не подтвердите.</p>
          </div>
        )}
      </div>

      {/* Имя */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Имя</label>
        {!editingName ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 px-4 py-2.5 rounded-lg bg-gray-50 border border-gray-100 text-sm text-gray-900">
              {currentName || <span className="text-gray-400">Не указано</span>}
            </div>
            <button
              onClick={() => { setEditingName(true); setNameDraft(currentName) }}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-[#6A55F8] hover:text-[#6A55F8]"
            >
              Изменить
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              autoFocus
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-[#6A55F8] text-sm focus:outline-none"
              placeholder="Иван Иванов"
            />
            {nameError && <div className="text-xs text-red-600">{nameError}</div>}
            <div className="flex gap-2">
              <button onClick={() => { setEditingName(false); setNameError('') }} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm">Отмена</button>
              <button onClick={handleSaveName} disabled={nameSaving} className="flex-1 py-2 rounded-lg bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium disabled:opacity-50">
                {nameSaving ? 'Сохраняем…' : 'Сохранить'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Пароль */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Пароль</label>
        {pwdSuccess && (
          <div className="mb-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-2.5">
            ✓ Пароль успешно изменён.
          </div>
        )}
        {!showPwdForm ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 px-4 py-2.5 rounded-lg bg-gray-50 border border-gray-100 text-sm text-gray-500">
              ••••••••
            </div>
            <button
              onClick={() => setShowPwdForm(true)}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-[#6A55F8] hover:text-[#6A55F8]"
            >
              Сменить
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="password"
              autoFocus
              value={oldPwd}
              onChange={e => setOldPwd(e.target.value)}
              placeholder="Текущий пароль"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm"
            />
            <input
              type="password"
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              placeholder="Новый пароль (мин. 6 символов)"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm"
            />
            <input
              type="password"
              value={newPwd2}
              onChange={e => setNewPwd2(e.target.value)}
              placeholder="Повторите новый пароль"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm"
            />
            {pwdError && <div className="text-xs text-red-600">{pwdError}</div>}
            <div className="flex gap-2">
              <button onClick={() => { setShowPwdForm(false); setOldPwd(''); setNewPwd(''); setNewPwd2(''); setPwdError('') }} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm">Отмена</button>
              <button onClick={handleChangePassword} disabled={pwdSaving || !oldPwd || !newPwd || !newPwd2} className="flex-1 py-2 rounded-lg bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium disabled:opacity-50">
                {pwdSaving ? 'Сохраняем…' : 'Сменить пароль'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="pt-5 border-t border-gray-100 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">Выход из аккаунта</p>
          <p className="text-xs text-gray-500 mt-0.5">Завершит сессию на этом устройстве</p>
        </div>
        <button
          onClick={onLogout}
          disabled={loggingOut}
          className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-medium text-gray-700 transition-colors disabled:opacity-50"
        >
          {loggingOut ? 'Выходим...' : 'Выйти'}
        </button>
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
