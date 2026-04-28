'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import NotificationBell from '@/components/learning/NotificationBell'

type SchoolMembership = {
  project_id: string
  project_name: string
  role_label: string
  role_code: string
  access_type: 'admin_panel' | 'student_panel' | 'no_access'
}

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<{ email: string | null; full_name: string | null } | null>(null)
  const [schools, setSchools] = useState<SchoolMembership[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [accessChecked, setAccessChecked] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) {
        router.replace('/login')
        return
      }

      // Все project_members этого юзера со связкой на роли и проекты
      const { data: memberships } = await supabase
        .from('project_members')
        .select('project_id, projects!inner(name), roles!inner(code, label, access_type)')
        .eq('user_id', u.id)
        .eq('status', 'active')

      type Row = { project_id: string; projects: { name: string }; roles: { code: string; label: string; access_type: 'admin_panel' | 'student_panel' | 'no_access' } }
      const rows: SchoolMembership[] = ((memberships ?? []) as unknown as Row[]).map(m => ({
        project_id: m.project_id,
        project_name: m.projects.name,
        role_label: m.roles.label,
        role_code: m.roles.code,
        access_type: m.roles.access_type,
      }))

      // Только школы где роль = student_panel (для витрины)
      const studentSchools = rows.filter(s => s.access_type === 'student_panel')

      // Если нет ни одной student-роли, но есть admin → отправляем в админку
      if (studentSchools.length === 0) {
        const adminSchool = rows.find(s => s.access_type === 'admin_panel')
        if (adminSchool) {
          router.replace(`/project/${adminSchool.project_id}`)
          return
        }
        // Совсем нет ролей
        router.replace('/projects')
        return
      }

      const { data: meta } = await supabase
        .from('users_meta').select('full_name').eq('user_id', u.id).maybeSingle()

      setUser({ email: u.email ?? null, full_name: meta?.full_name ?? null })
      setSchools(studentSchools)
      setActiveProjectId(studentSchools[0].project_id)
      setAccessChecked(true)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (!accessChecked) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Загрузка…</div>
  }

  const activeSchool = schools.find(s => s.project_id === activeProjectId) ?? schools[0]

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#F8F7FF] to-[#F0EDFF]">
      <header className="bg-white/80 backdrop-blur border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#6A55F8] to-[#8B7BFA] flex items-center justify-center text-white font-bold">
              {activeSchool?.project_name?.[0] ?? 'S'}
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">{activeSchool?.project_name}</div>
              <div className="text-xs text-gray-500">{activeSchool?.role_label}</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {schools.length > 1 && (
              <select
                value={activeProjectId ?? ''}
                onChange={e => setActiveProjectId(e.target.value)}
                className="text-sm rounded-lg border border-gray-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20"
              >
                {schools.map(s => (
                  <option key={s.project_id} value={s.project_id}>{s.project_name}</option>
                ))}
              </select>
            )}
            <NotificationBell />
            <div className="text-sm text-gray-700">
              {user?.full_name || user?.email}
            </div>
            <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-900">Выйти</button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-10">
        {children}
      </main>
    </div>
  )
}
