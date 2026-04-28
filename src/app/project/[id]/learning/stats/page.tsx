'use client'

// Phase 7.9 — Статистика учебной платформы.
// 4 уровня: продукт / курс / урок / ученик.

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type CourseStats = {
  course_id: string
  course_name: string
  product_id: string | null
  product_name: string | null
  total_students: number
  active_students: number
  completed_students: number
  avg_progress: number
}

type LessonStats = {
  lesson_id: string
  lesson_name: string
  total_opened: number
  total_completed: number
  completion_rate: number
  avg_video_percent: number
  homework_pending: number
  homework_accepted: number
}

type StudentStats = {
  customer_id: string
  customer_name: string
  customer_email: string | null
  customer_public_code: string | null
  lessons_completed: number
  lessons_total: number
  progress: number
  homework_submitted: number
  homework_accepted: number
}

export default function StatsPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const projectId = params.id
  const supabase = createClient()
  const [tab, setTab] = useState<'courses' | 'lessons' | 'students'>('courses')
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null)
  const [coursesData, setCoursesData] = useState<CourseStats[]>([])
  const [lessonsData, setLessonsData] = useState<LessonStats[]>([])
  const [studentsData, setStudentsData] = useState<StudentStats[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)

    // Все курсы проекта
    const { data: courses } = await supabase.from('courses').select('id, name, product_id').eq('project_id', projectId)
    const courseIds = (courses ?? []).map(c => c.id)
    if (courseIds.length === 0) { setLoading(false); return }

    const { data: products } = await supabase.from('products').select('id, name').in('id', [...new Set((courses ?? []).map(c => c.product_id).filter(Boolean) as string[])])
    const productMap = new Map((products ?? []).map(p => [p.id, p.name]))

    // Все модули и уроки
    const { data: modules } = await supabase.from('course_modules').select('id, course_id').in('course_id', courseIds)
    const moduleToCourse = new Map(((modules as Array<{ id: string; course_id: string }>) ?? []).map(m => [m.id, m.course_id]))
    const { data: lessons } = await supabase.from('course_lessons').select('id, name, course_id, module_id, is_bonus, is_exam').or(`course_id.in.(${courseIds.join(',')}),module_id.in.(${[...moduleToCourse.keys()].join(',') || '00000000-0000-0000-0000-000000000000'})`)
    const lessonToCoure = new Map<string, string>()
    for (const l of (lessons as Array<{ id: string; course_id: string | null; module_id: string | null }>) ?? []) {
      const cid = l.course_id ?? (l.module_id ? moduleToCourse.get(l.module_id) : null)
      if (cid) lessonToCoure.set(l.id, cid)
    }

    // Все progress по этим урокам
    const { data: progress } = await supabase.from('lesson_progress').select('customer_id, lesson_id, completed_at, video_max_percent').in('lesson_id', [...lessonToCoure.keys()])

    // Customers с доступом к продуктам
    const productIds = [...new Set((courses ?? []).map(c => c.product_id).filter(Boolean) as string[])]
    const { data: tariffs } = productIds.length > 0
      ? await supabase.from('tariffs').select('id, product_id').in('product_id', productIds)
      : { data: [] }
    const tariffToProduct = new Map(((tariffs as Array<{ id: string; product_id: string }>) ?? []).map(t => [t.id, t.product_id]))
    const { data: accesses } = (tariffs ?? []).length > 0
      ? await supabase.from('customer_access').select('customer_id, tariff_id').in('tariff_id', (tariffs ?? []).map((t: { id: string }) => t.id))
      : { data: [] }
    const productCustomers = new Map<string, Set<string>>()
    for (const a of (accesses as Array<{ customer_id: string; tariff_id: string }>) ?? []) {
      const pid = tariffToProduct.get(a.tariff_id)
      if (!pid) continue
      if (!productCustomers.has(pid)) productCustomers.set(pid, new Set())
      productCustomers.get(pid)!.add(a.customer_id)
    }
    // Все customer_ids
    const allCustomerIds = [...new Set((accesses as Array<{ customer_id: string }>)?.map(a => a.customer_id) ?? [])]
    const { data: customers } = allCustomerIds.length > 0
      ? await supabase.from('customers').select('id, full_name, email, public_code').in('id', allCustomerIds)
      : { data: [] }
    const customerMap = new Map(((customers as Array<{ id: string; full_name: string; email: string | null; public_code: string | null }>) ?? []).map(c => [c.id, c]))

    // Submissions
    const { data: assignments } = await supabase.from('lesson_assignments').select('id, lesson_id').in('lesson_id', [...lessonToCoure.keys()])
    const assignmentIds = ((assignments as Array<{ id: string }>) ?? []).map(a => a.id)
    const { data: submissions } = assignmentIds.length > 0
      ? await supabase.from('assignment_submissions').select('assignment_id, customer_id, status').in('assignment_id', assignmentIds)
      : { data: [] }

    // ── Course stats ──
    const courseStats: CourseStats[] = (courses ?? []).map(c => {
      const lessonIds = [...lessonToCoure.entries()].filter(([, cid]) => cid === c.id).map(([lid]) => lid)
      const regularLessonIds = lessonIds.filter(lid => {
        const l = (lessons as Array<{ id: string; is_bonus: boolean; is_exam: boolean }>)?.find(x => x.id === lid)
        return l && !l.is_bonus && !l.is_exam
      })
      const studentsInProduct = c.product_id ? (productCustomers.get(c.product_id) ?? new Set()) : new Set<string>()
      const studentProgresses: Record<string, { completed: number }> = {}
      for (const p of (progress as Array<{ customer_id: string; lesson_id: string; completed_at: string | null }>) ?? []) {
        if (!regularLessonIds.includes(p.lesson_id)) continue
        if (!studentsInProduct.has(p.customer_id)) continue
        if (!studentProgresses[p.customer_id]) studentProgresses[p.customer_id] = { completed: 0 }
        if (p.completed_at) studentProgresses[p.customer_id].completed++
      }
      const totalStudents = studentsInProduct.size
      const avgProgress = totalStudents > 0 && regularLessonIds.length > 0
        ? Math.round([...studentsInProduct].reduce((s, sid) => s + ((studentProgresses[sid]?.completed ?? 0) / regularLessonIds.length * 100), 0) / totalStudents)
        : 0
      const activeStudents = Object.keys(studentProgresses).filter(sid => (studentProgresses[sid]?.completed ?? 0) > 0).length
      const completedStudents = Object.keys(studentProgresses).filter(sid => (studentProgresses[sid]?.completed ?? 0) === regularLessonIds.length && regularLessonIds.length > 0).length
      return {
        course_id: c.id, course_name: c.name,
        product_id: c.product_id, product_name: c.product_id ? (productMap.get(c.product_id) ?? null) : null,
        total_students: totalStudents,
        active_students: activeStudents,
        completed_students: completedStudents,
        avg_progress: avgProgress,
      }
    })
    setCoursesData(courseStats)

    setLoading(false)
  }, [projectId, supabase])

  const loadLessons = useCallback(async (courseId: string) => {
    // Уроки курса
    const { data: modules } = await supabase.from('course_modules').select('id').eq('course_id', courseId)
    const { data: lessons } = await supabase.from('course_lessons').select('id, name, is_bonus, is_exam').or(`course_id.eq.${courseId},module_id.in.(${(modules ?? []).map((m: { id: string }) => m.id).join(',') || '00000000-0000-0000-0000-000000000000'})`)
    const lessonIds = (lessons ?? []).map((l: { id: string }) => l.id)
    if (lessonIds.length === 0) { setLessonsData([]); return }

    const { data: progress } = await supabase.from('lesson_progress').select('lesson_id, completed_at, video_max_percent').in('lesson_id', lessonIds)
    const { data: assignments } = await supabase.from('lesson_assignments').select('id, lesson_id').in('lesson_id', lessonIds)
    const assignmentToLesson = new Map(((assignments as Array<{ id: string; lesson_id: string }>) ?? []).map(a => [a.id, a.lesson_id]))
    const { data: submissions } = (assignments ?? []).length > 0
      ? await supabase.from('assignment_submissions').select('assignment_id, status').in('assignment_id', (assignments ?? []).map((a: { id: string }) => a.id))
      : { data: [] }

    const stats: LessonStats[] = (lessons ?? []).map((l: { id: string; name: string }) => {
      const lProgress = ((progress as Array<{ lesson_id: string; completed_at: string | null; video_max_percent: number }>) ?? []).filter(p => p.lesson_id === l.id)
      const opened = lProgress.length
      const completed = lProgress.filter(p => p.completed_at).length
      const avgVideo = opened > 0 ? Math.round(lProgress.reduce((s, p) => s + (p.video_max_percent ?? 0), 0) / opened) : 0
      const lAssignments = [...assignmentToLesson.entries()].filter(([, lid]) => lid === l.id).map(([aid]) => aid)
      const lSubmissions = ((submissions as Array<{ assignment_id: string; status: string }>) ?? []).filter(s => lAssignments.includes(s.assignment_id))
      return {
        lesson_id: l.id, lesson_name: l.name,
        total_opened: opened, total_completed: completed,
        completion_rate: opened > 0 ? Math.round(completed / opened * 100) : 0,
        avg_video_percent: avgVideo,
        homework_pending: lSubmissions.filter(s => s.status === 'in_review' || s.status === 'pending').length,
        homework_accepted: lSubmissions.filter(s => s.status === 'accepted').length,
      }
    })
    setLessonsData(stats)
  }, [supabase])

  const loadStudents = useCallback(async (courseId: string) => {
    // Студенты которые имеют доступ к этому курсу
    const { data: course } = await supabase.from('courses').select('product_id').eq('id', courseId).single()
    if (!course?.product_id) { setStudentsData([]); return }

    const { data: tariffs } = await supabase.from('tariffs').select('id').eq('product_id', course.product_id)
    const { data: accesses } = await supabase.from('customer_access').select('customer_id').in('tariff_id', (tariffs ?? []).map((t: { id: string }) => t.id))
    const customerIds = [...new Set((accesses ?? []).map((a: { customer_id: string }) => a.customer_id))]
    if (customerIds.length === 0) { setStudentsData([]); return }

    const { data: customers } = await supabase.from('customers').select('id, full_name, email, public_code').in('id', customerIds)

    const { data: modules } = await supabase.from('course_modules').select('id').eq('course_id', courseId)
    const { data: lessons } = await supabase.from('course_lessons').select('id, is_bonus, is_exam').or(`course_id.eq.${courseId},module_id.in.(${(modules ?? []).map((m: { id: string }) => m.id).join(',') || '00000000-0000-0000-0000-000000000000'})`)
    const regularLessonIds = ((lessons as Array<{ id: string; is_bonus: boolean; is_exam: boolean }>) ?? []).filter(l => !l.is_bonus && !l.is_exam).map(l => l.id)

    const { data: progress } = regularLessonIds.length > 0
      ? await supabase.from('lesson_progress').select('customer_id, lesson_id, completed_at').in('lesson_id', regularLessonIds).in('customer_id', customerIds)
      : { data: [] }

    const { data: assignments } = await supabase.from('lesson_assignments').select('id').in('lesson_id', ((lessons as Array<{ id: string }>) ?? []).map(l => l.id))
    const { data: submissions } = (assignments ?? []).length > 0
      ? await supabase.from('assignment_submissions').select('customer_id, status').in('assignment_id', (assignments ?? []).map((a: { id: string }) => a.id))
      : { data: [] }

    const stats: StudentStats[] = ((customers as Array<{ id: string; full_name: string; email: string | null; public_code: string | null }>) ?? []).map(c => {
      const completed = ((progress as Array<{ customer_id: string; completed_at: string | null }>) ?? [])
        .filter(p => p.customer_id === c.id && p.completed_at).length
      const subs = ((submissions as Array<{ customer_id: string; status: string }>) ?? []).filter(s => s.customer_id === c.id)
      return {
        customer_id: c.id,
        customer_name: c.full_name ?? '—',
        customer_email: c.email,
        customer_public_code: c.public_code,
        lessons_completed: completed,
        lessons_total: regularLessonIds.length,
        progress: regularLessonIds.length > 0 ? Math.round(completed / regularLessonIds.length * 100) : 0,
        homework_submitted: subs.length,
        homework_accepted: subs.filter(s => s.status === 'accepted').length,
      }
    }).sort((a, b) => b.progress - a.progress)
    setStudentsData(stats)
  }, [supabase])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (selectedCourse && tab === 'lessons') loadLessons(selectedCourse)
    if (selectedCourse && tab === 'students') loadStudents(selectedCourse)
  }, [selectedCourse, tab, loadLessons, loadStudents])

  if (loading) return <div className="text-sm text-gray-500">Загружаем…</div>

  return (
    <div className="space-y-5">
      <div>
        <button onClick={() => router.push(`/project/${projectId}/learning`)} className="text-sm text-gray-500 hover:text-gray-800">← Курсы</button>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Статистика обучения</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['courses', 'lessons', 'students'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-[#6A55F8] text-[#6A55F8]' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}>
            {t === 'courses' && 'По курсам'}
            {t === 'lessons' && 'По урокам'}
            {t === 'students' && 'По ученикам'}
          </button>
        ))}
      </div>

      {tab !== 'courses' && (
        <select value={selectedCourse ?? ''} onChange={e => setSelectedCourse(e.target.value || null)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm">
          <option value="">— выбери курс —</option>
          {coursesData.map(c => <option key={c.course_id} value={c.course_id}>{c.course_name}</option>)}
        </select>
      )}

      {tab === 'courses' && (
        <div className="space-y-2">
          {coursesData.length === 0 && <div className="text-sm text-gray-400">Нет данных</div>}
          {coursesData.map(c => (
            <div key={c.course_id} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-base font-semibold text-gray-900">{c.course_name}</div>
                  {c.product_name && <div className="text-xs text-gray-500">{c.product_name}</div>}
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-[#6A55F8]">{c.avg_progress}%</div>
                  <div className="text-xs text-gray-500">средний прогресс</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xl font-bold text-gray-900">{c.total_students}</div>
                  <div className="text-xs text-gray-500">всего</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-3">
                  <div className="text-xl font-bold text-blue-700">{c.active_students}</div>
                  <div className="text-xs text-blue-600">активных</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3">
                  <div className="text-xl font-bold text-green-700">{c.completed_students}</div>
                  <div className="text-xs text-green-600">завершили</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'lessons' && (
        <div className="space-y-2">
          {!selectedCourse && <div className="text-sm text-gray-400">Выбери курс из списка выше</div>}
          {selectedCourse && lessonsData.length === 0 && <div className="text-sm text-gray-400">У этого курса нет уроков с активностью</div>}
          {lessonsData.map(l => (
            <div key={l.lesson_id} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-gray-900 flex-1 min-w-0 truncate">{l.lesson_name}</div>
                <div className="text-xs text-[#6A55F8] font-semibold flex-shrink-0">{l.completion_rate}% завершили</div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div><div className="text-gray-500">Открыло</div><div className="font-semibold text-gray-900">{l.total_opened}</div></div>
                <div><div className="text-gray-500">Завершило</div><div className="font-semibold text-gray-900">{l.total_completed}</div></div>
                <div><div className="text-gray-500">Видео ср.</div><div className="font-semibold text-gray-900">{l.avg_video_percent}%</div></div>
                <div><div className="text-gray-500">ДЗ принято</div><div className="font-semibold text-gray-900">{l.homework_accepted}{l.homework_pending > 0 && <span className="text-amber-600"> +{l.homework_pending}</span>}</div></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'students' && (
        <div className="space-y-2">
          {!selectedCourse && <div className="text-sm text-gray-400">Выбери курс из списка выше</div>}
          {selectedCourse && studentsData.map(s => (
            <div key={s.customer_id} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{s.customer_name}</span>
                    {s.customer_public_code && <span className="text-xs text-gray-400">{s.customer_public_code}</span>}
                  </div>
                  {s.customer_email && <div className="text-xs text-gray-500">{s.customer_email}</div>}
                </div>
                <div className="text-sm font-semibold text-[#6A55F8] flex-shrink-0">{s.progress}%</div>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                <div className="h-full bg-gradient-to-r from-[#6A55F8] to-[#8B7BFA]" style={{ width: `${s.progress}%` }} />
              </div>
              <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
                <span>Уроков: {s.lessons_completed}/{s.lessons_total}</span>
                <span>ДЗ сдано: {s.homework_submitted}</span>
                <span>ДЗ принято: {s.homework_accepted}</span>
              </div>
            </div>
          ))}
          {selectedCourse && studentsData.length === 0 && <div className="text-sm text-gray-400">У этого курса нет учеников</div>}
        </div>
      )}
    </div>
  )
}
