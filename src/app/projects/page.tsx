'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ROOT_DOMAIN } from '@/lib/subdomain'

type SchoolMembership = {
  project_id: string
  project_name: string
  created_at: string
  role_label: string
  role_code: string
  access_type: 'admin_panel' | 'student_panel' | 'no_access'
  school_url: string  // полный URL школы (https://...)
}

export default function ProjectsPage() {
  const [schools, setSchools] = useState<SchoolMembership[]>([])
  const [canCreate, setCanCreate] = useState(false)
  const [accountSubdomain, setAccountSubdomain] = useState<string>('')
  const [accountCustomDomain, setAccountCustomDomain] = useState<string | null>(null)
  const [accountCustomStatus, setAccountCustomStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/login')
      return
    }

    // Параллельно: meta + свои account_domains + все project_members с роли+проектами
    const [{ data: meta }, { data: ad }, { data: memberships }] = await Promise.all([
      supabase.from('users_meta').select('can_create_projects').eq('user_id', user.id).maybeSingle(),
      supabase.from('account_domains').select('subdomain, custom_domain, custom_domain_status').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('project_members')
        .select('project_id, projects!inner(id, name, created_at, owner_id), roles!inner(code, label, access_type)')
        .eq('user_id', user.id)
        .eq('status', 'active'),
    ])

    setCanCreate(Boolean(meta?.can_create_projects))
    setAccountSubdomain(ad?.subdomain ?? '')
    setAccountCustomDomain(ad?.custom_domain ?? null)
    setAccountCustomStatus(ad?.custom_domain_status ?? null)

    type Row = {
      project_id: string
      projects: { id: string; name: string; created_at: string; owner_id: string }
      roles: { code: string; label: string; access_type: 'admin_panel' | 'student_panel' | 'no_access' }
    }
    const rows = (memberships ?? []) as unknown as Row[]

    // Для каждой школы — её URL (по owner_id).
    // Чтобы не делать N запросов: собрать unique owner_ids, fetch одним батчом.
    const ownerIds = Array.from(new Set(rows.map(r => r.projects.owner_id)))
    const ownerDomains = new Map<string, { subdomain: string; custom_domain: string | null; custom_domain_status: string | null }>()
    if (ownerIds.length > 0) {
      const { data: domains } = await supabase
        .from('account_domains')
        .select('user_id, subdomain, custom_domain, custom_domain_status')
        .in('user_id', ownerIds)
      ;((domains ?? []) as Array<{ user_id: string; subdomain: string; custom_domain: string | null; custom_domain_status: string | null }>).forEach(d => {
        ownerDomains.set(d.user_id, d)
      })
    }

    function urlFor(ownerId: string): string {
      const d = ownerDomains.get(ownerId)
      if (d?.custom_domain && d.custom_domain_status === 'verified') return `https://${d.custom_domain}`
      if (d?.subdomain) return `https://${d.subdomain}.${ROOT_DOMAIN}`
      return `https://${ROOT_DOMAIN}`
    }

    const list: SchoolMembership[] = rows
      .filter(r => r.roles.access_type !== 'no_access')
      .map(r => ({
        project_id: r.project_id,
        project_name: r.projects.name,
        created_at: r.projects.created_at,
        role_label: r.roles.label,
        role_code: r.roles.code,
        access_type: r.roles.access_type,
        school_url: urlFor(r.projects.owner_id),
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    setSchools(list)
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    setCreateError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('projects')
      .insert({ name: newName.trim(), owner_id: user.id })
      .select()
      .single()

    if (error) {
      console.error('Create project error:', error)
      setCreateError('Ошибка: ' + error.message)
      setCreating(false)
      return
    }

    if (data) {
      // project_members(role=owner) создаётся триггером seed_project_roles_and_owner
      fetch('/api/projects/setup-kinescope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: data.id }),
      }).catch(err => console.error('kinescope setup failed:', err))
      window.location.href = `/project/${data.id}`
    }

    setCreating(false)
  }

  function openSchool(s: SchoolMembership) {
    // Полный кросс-доменный переход. Куку-сессию подхватит middleware на той стороне
    // через /api/auth/handoff-redirect (если cookie ещё не на том хосте).
    const path = s.access_type === 'student_panel' ? '/learn' : `/project/${s.project_id}`
    window.location.href = `${s.school_url}${path}`
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/global-logout', { method: 'POST' })
    } catch { /* ignore */ }
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-[#F8F7FF] to-[#F0EDFF]">
        <div className="text-center">
          <div className="w-10 h-10 rounded-xl bg-[#6A55F8] flex items-center justify-center text-white font-bold mx-auto mb-3 animate-pulse">S</div>
          <p className="text-sm text-gray-500">Загрузка школ…</p>
        </div>
      </div>
    )
  }

  // Платформенный владелец без своего поддомена — попросить настроить
  if (canCreate && !accountSubdomain) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-[#F8F7FF] to-[#F0EDFF]">
        <div className="max-w-sm bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <div className="text-3xl mb-3">🌐</div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Не настроен поддомен</h1>
          <p className="text-sm text-gray-500 mb-5">
            Для работы платформы нужно выбрать поддомен — это адрес вашей школы.
          </p>
          <a
            href="/account/settings?tab=domain"
            className="inline-block px-4 py-2 rounded-lg bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium"
          >
            Настроить поддомен
          </a>
        </div>
      </div>
    )
  }

  const accountUrl = accountCustomDomain && accountCustomStatus === 'verified'
    ? accountCustomDomain
    : (accountSubdomain ? `${accountSubdomain}.${ROOT_DOMAIN}` : '')

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#F8F7FF] to-[#F0EDFF] py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Мои школы</h1>
            {accountUrl && <p className="text-sm text-gray-500 font-mono mt-0.5">{accountUrl}</p>}
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/account/settings"
              className="px-3 py-2 rounded-lg bg-white border border-gray-200 hover:border-[#6A55F8]/30 text-sm font-medium text-gray-700 hover:text-[#6A55F8] transition-colors"
            >
              ⚙️ Аккаунт
            </a>
            <button
              onClick={handleLogout}
              className="px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              Выйти
            </button>
          </div>
        </div>

        {schools.length === 0 && !showCreate && (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
            <div className="text-3xl mb-3">📚</div>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Школ пока нет</h2>
            <p className="text-sm text-gray-500 mb-5">
              {canCreate
                ? 'Создайте первую школу или дождитесь приглашения.'
                : 'Вас не пригласили ни в одну школу. Если ждёте приглашение — проверьте почту.'}
            </p>
          </div>
        )}

        <div className="space-y-3">
          {schools.map(s => (
            <button
              key={s.project_id}
              onClick={() => openSchool(s)}
              className="w-full bg-white rounded-xl border border-gray-100 p-5 flex items-center justify-between hover:border-[#6A55F8]/30 hover:shadow-md hover:shadow-[#6A55F8]/5 transition-all group text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6A55F8] to-[#8B7BFA] flex items-center justify-center text-white text-sm font-bold shadow-sm shadow-[#6A55F8]/20">
                  {s.project_name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-[#6A55F8] transition-colors">{s.project_name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#6A55F8]/10 text-[#6A55F8] font-medium">
                      {s.role_label}
                    </span>
                    <span className="text-xs text-gray-400">{new URL(s.school_url).host}</span>
                  </div>
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          ))}

          {/* Создание новой школы — только для платформенных владельцев */}
          {canCreate && showCreate && (
            <form onSubmit={handleCreate} className="bg-white rounded-xl border border-[#6A55F8]/30 p-5 shadow-md shadow-[#6A55F8]/5">
              <h3 className="font-semibold text-gray-900 mb-3">Новая школа</h3>
              <label className="block text-xs font-medium text-gray-600 mb-1">Название</label>
              <input
                type="text"
                value={newName}
                onChange={e => { setNewName(e.target.value); setCreateError('') }}
                placeholder="Школа маркетинга"
                autoFocus
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8]"
              />
              {createError && <div className="mt-2 text-xs text-red-600">{createError}</div>}
              <div className="flex gap-2 mt-4">
                <button type="submit" disabled={creating || !newName.trim()} className="flex-1 py-2 rounded-lg bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium disabled:opacity-50">
                  {creating ? 'Создаём…' : 'Создать'}
                </button>
                <button type="button" onClick={() => { setShowCreate(false); setNewName(''); setCreateError('') }} className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100">
                  Отмена
                </button>
              </div>
            </form>
          )}

          {canCreate && !showCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full py-4 rounded-xl border border-dashed border-gray-300 hover:border-[#6A55F8]/40 text-sm text-gray-500 hover:text-[#6A55F8] transition-colors"
            >
              + Создать новую школу
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
