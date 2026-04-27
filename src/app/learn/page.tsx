'use client'

// Витрина ученика — список купленных курсов на текущей школе.
// Берётся из customer_courses_view (миграция 47): только активные доступы,
// не истёкшие. Через RLS ученик видит только свои строки.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

type CourseRow = {
  course_id: string
  course_name: string
  course_description: string | null
  is_published: boolean
  access_id: string
  granted_at: string
  expires_at: string | null
}

export default function LearnHome() {
  const supabase = createClient()
  const [courses, setCourses] = useState<CourseRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Найдём project_members для текущего user-а на этом host'е, потом customer_courses_view
      // Простая модель: один поддомен — один аккаунт-владелец — но проектов
      // у него может быть несколько. Берём все project_id-ы где user — student.
      const { data: memberships } = await supabase
        .from('project_members')
        .select('project_id, roles!inner(access_type)')
        .eq('user_id', user.id)
        .eq('status', 'active')

      type RoleNode = { access_type: string }
      type Row = { project_id: string; roles: RoleNode | RoleNode[] }
      const studentProjects = ((memberships ?? []) as unknown as Row[])
        .filter(r => {
          const role = Array.isArray(r.roles) ? r.roles[0] : r.roles
          return role?.access_type === 'student_panel'
        })
        .map(r => r.project_id)

      if (studentProjects.length === 0) {
        if (!cancelled) setCourses([])
        return
      }

      const { data } = await supabase
        .from('customer_courses_view')
        .select('course_id, course_name, course_description, is_published, access_id, granted_at, expires_at')
        .in('project_id', studentProjects)

      if (!cancelled) setCourses(((data ?? []) as CourseRow[]).filter(c => c.is_published))
    }
    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (courses === null) {
    return <div className="text-sm text-gray-500">Загружаем курсы…</div>
  }

  if (courses.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#6A55F8]/10 to-[#8B7BFA]/10 flex items-center justify-center text-3xl mx-auto mb-6">
          📚
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Курсов пока нет</h1>
        <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
          Когда школа выдаст вам доступ к продукту — курсы появятся здесь автоматически.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Мои курсы</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {courses.map(c => (
          <div key={c.course_id} className="bg-white rounded-2xl border border-gray-100 p-6 hover:border-[#6A55F8]/30 hover:shadow-md hover:shadow-[#6A55F8]/5 transition-all cursor-pointer">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6A55F8] to-[#8B7BFA] flex items-center justify-center text-white text-xl mb-4">
              {c.course_name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{c.course_name}</h2>
            {c.course_description && (
              <p className="text-sm text-gray-500 line-clamp-2 mb-3">{c.course_description}</p>
            )}
            <div className="text-xs text-gray-400">
              {c.expires_at
                ? `Доступ до ${new Date(c.expires_at).toLocaleDateString('ru')}`
                : 'Бессрочный доступ'}
            </div>
            <div className="mt-4 text-xs text-gray-400">
              Уроки появятся здесь — сейчас курс в разработке.
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
