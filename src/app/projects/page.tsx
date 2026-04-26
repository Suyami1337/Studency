'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { validateSubdomain, suggestSubdomainFromName, ROOT_DOMAIN } from '@/lib/subdomain'

type Project = {
  id: string
  name: string
  subdomain: string
  custom_domain: string | null
  custom_domain_status: string | null
  created_at: string
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSubdomain, setNewSubdomain] = useState('')
  const [subdomainTouched, setSubdomainTouched] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function loadProjects() {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })

    setProjects(data ?? [])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadProjects() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    const sub = (newSubdomain || suggestSubdomainFromName(newName)).toLowerCase().trim()
    const validErr = validateSubdomain(sub)
    if (validErr) { setCreateError(validErr); return }
    setCreating(true)
    setCreateError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('projects')
      .insert({ name: newName.trim(), owner_id: user.id, subdomain: sub })
      .select()
      .single()

    if (error) {
      console.error('Create project error:', error)
      // Уникальность subdomain → понятное сообщение
      if (/duplicate|unique/i.test(error.message)) {
        setCreateError(`Поддомен «${sub}» уже занят. Попробуй другое имя.`)
      } else {
        setCreateError('Ошибка: ' + error.message)
      }
      setCreating(false)
      return
    }

    if (data) {
      // Add owner as member
      await supabase.from('project_members').insert({
        project_id: data.id,
        user_id: user.id,
        role: 'owner',
      })

      // Регистрируем поддомен в Vercel (чтобы Vercel выдал SSL для <sub>.studency.ru)
      fetch(`/api/projects/${data.id}/register-subdomain`, {
        method: 'POST',
      }).catch(err => console.error('register-subdomain failed:', err))

      // Создаём Kinescope папку (не блокируем если недоступно)
      fetch('/api/projects/setup-kinescope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: data.id }),
      }).catch(err => console.error('kinescope setup failed:', err))

      router.push(`/project/${data.id}`)
    }

    setCreating(false)
  }

  async function handleLogout() {
    try { await supabase.auth.signOut() } catch { /* ignore */ }
    // Принудительно убиваем все Supabase cookies с любыми вариантами domain
    // (host-only от старых логинов и domain=.studency.ru от новых).
    if (typeof document !== 'undefined') {
      const root = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'studency.ru')
      const variants = ['', `; domain=${root}`, `; domain=.${root}`, `; domain=${location.hostname}`]
      for (const cookie of document.cookie.split(';')) {
        const name = cookie.split('=')[0].trim()
        if (name.startsWith('sb-')) {
          for (const dom of variants) {
            document.cookie = `${name}=; path=/${dom}; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
          }
        }
      }
    }
    // Hard redirect — чтобы middleware гарантированно не увидел старый session
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    } else {
      router.push('/login')
    }
  }

  function selectProject(id: string) {
    router.push(`/project/${id}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-[#F8F7FF] to-[#F0EDFF]">
        <div className="text-center">
          <div className="w-10 h-10 rounded-xl bg-[#6A55F8] flex items-center justify-center text-white font-bold mx-auto mb-3 animate-pulse">S</div>
          <p className="text-sm text-gray-500">Загрузка проектов...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#F8F7FF] to-[#F0EDFF] py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Мои проекты</h1>
            <p className="text-sm text-gray-500">Выберите проект или создайте новый</p>
          </div>
          <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            Выйти
          </button>
        </div>

        <div className="space-y-3">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => selectProject(p.id)}
              className="w-full bg-white rounded-xl border border-gray-100 p-5 flex items-center justify-between hover:border-[#6A55F8]/30 hover:shadow-md hover:shadow-[#6A55F8]/5 transition-all group text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6A55F8] to-[#8B7BFA] flex items-center justify-center text-white text-sm font-bold shadow-sm shadow-[#6A55F8]/20">
                  {p.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-[#6A55F8] transition-colors">{p.name}</h3>
                  <p className="text-sm text-gray-500 mt-0.5 font-mono">
                    {p.custom_domain && p.custom_domain_status === 'verified'
                      ? p.custom_domain
                      : `${p.subdomain}.${ROOT_DOMAIN}`}
                  </p>
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          ))}

          {/* Create new */}
          {showCreate ? (
            <form onSubmit={handleCreate} className="bg-white rounded-xl border border-[#6A55F8]/30 p-5 shadow-md shadow-[#6A55F8]/5">
              <h3 className="font-semibold text-gray-900 mb-3">Новый проект</h3>
              <label className="block text-xs font-medium text-gray-600 mb-1">Название</label>
              <input
                type="text"
                value={newName}
                onChange={e => {
                  setNewName(e.target.value)
                  setCreateError('')
                  if (!subdomainTouched) setNewSubdomain(suggestSubdomainFromName(e.target.value))
                }}
                placeholder="Например: Маркетинг школа"
                autoFocus
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8] mb-3"
              />
              <label className="block text-xs font-medium text-gray-600 mb-1">Поддомен сайта</label>
              <div className="flex items-center gap-1 mb-1">
                <input
                  type="text"
                  value={newSubdomain}
                  onChange={e => { setNewSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setSubdomainTouched(true); setCreateError('') }}
                  placeholder="shkola"
                  className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8]"
                />
                <span className="text-sm text-gray-500 font-mono whitespace-nowrap">.{ROOT_DOMAIN}</span>
              </div>
              <p className="text-xs text-gray-400 mb-3">Можно поменять позже в настройках. Свой домен подключается отдельно.</p>
              {createError && (
                <p className="text-sm text-red-500 mb-3">{createError}</p>
              )}
              <div className="flex items-center gap-2">
                <button type="submit" disabled={creating || !newName.trim()}
                  className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                  {creating ? 'Создаём...' : 'Создать'}
                </button>
                <button type="button" onClick={() => { setShowCreate(false); setNewSubdomain(''); setSubdomainTouched(false) }}
                  className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50 transition-colors">
                  Отмена
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full bg-white rounded-xl border-2 border-dashed border-gray-200 p-5 flex items-center justify-center gap-2 hover:border-[#6A55F8] hover:bg-[#F8F7FF] transition-all text-gray-400 hover:text-[#6A55F8]"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              <span className="text-sm font-medium">Создать новый проект</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
