'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const [projectName, setProjectName] = useState('...')
  const [accessChecked, setAccessChecked] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)

  useEffect(() => {
    async function check() {
      const projectId = params.id as string
      if (!projectId) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      // Загружаем роль пользователя в проекте
      const { data: roleData } = await supabase.rpc('get_member_role', {
        p_project_id: projectId,
        p_user_id: user.id,
      })
      const role = Array.isArray(roleData) ? roleData[0] : roleData

      if (!role) {
        setAccessDenied(true)
        setAccessChecked(true)
        return
      }
      // Клиент в этом проекте — отправить на витрину
      if (role.access_type === 'student_panel') {
        router.replace('/learn')
        return
      }
      // no_access — не пускаем
      if (role.access_type === 'no_access') {
        setAccessDenied(true)
        setAccessChecked(true)
        return
      }

      // admin_panel — продолжаем, грузим имя проекта
      const { data: proj } = await supabase
        .from('projects').select('name').eq('id', projectId).single()
      if (proj) setProjectName(proj.name)
      setAccessChecked(true)
    }
    check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  if (accessDenied) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
        <div className="max-w-sm text-center">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center text-2xl mx-auto mb-4">!</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Нет доступа</h2>
          <p className="text-sm text-gray-500 mb-6">У вас нет прав на этот проект. Если вы недавно получили приглашение — попробуйте перезайти.</p>
          <button onClick={() => router.replace('/projects')} className="text-sm text-[#6A55F8] hover:underline">К списку школ</button>
        </div>
      </div>
    )
  }

  if (!accessChecked) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Загрузка…</div>
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar projectName={projectName} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6 bg-[#F5F5F7]">
          {children}
        </main>
      </div>
    </div>
  )
}
