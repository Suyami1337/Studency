'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Project = {
  id: string
  name: string
  domain: string | null
  created_at: string
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
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
    setCreating(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('projects')
      .insert({ name: newName.trim(), owner_id: user.id })
      .select()
      .single()

    if (data) {
      // Add owner as member
      await supabase.from('project_members').insert({
        project_id: data.id,
        user_id: user.id,
        role: 'owner',
      })
      router.push(`/project/${data.id}`)
    }

    setCreating(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
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
                  <p className="text-sm text-gray-500 mt-0.5">
                    {p.domain || 'Домен не привязан'}
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
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Название проекта"
                autoFocus
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8] mb-3"
              />
              <div className="flex items-center gap-2">
                <button type="submit" disabled={creating}
                  className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                  {creating ? 'Создаём...' : 'Создать'}
                </button>
                <button type="button" onClick={() => setShowCreate(false)}
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
