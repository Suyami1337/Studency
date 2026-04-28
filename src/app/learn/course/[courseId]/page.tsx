'use client'

// Phase 7.6 — Карта курса для ученика. Линейная сверху вниз.
// Модули → клик → раскрывается список уроков. Закрытые модули с замком.

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Course = { id: string; name: string; description: string | null; cover_url: string | null; project_id: string; product_id: string | null }

type Module = {
  id: string; parent_module_id: string | null; name: string; description: string | null; cover_url: string | null;
  is_bonus: boolean; is_hidden_until_open: boolean;
  open_rule_type: string; open_at: string | null; open_after_days: number | null; previous_module_id: string | null;
  order_position: number;
  // computed
  is_open?: boolean
  open_when?: string | null
  is_tariff_locked?: boolean
}

type Lesson = {
  id: string; course_id: string | null; module_id: string | null; name: string;
  is_bonus: boolean; is_exam: boolean; cover_url: string | null;
  order_position: number;
  is_completed?: boolean;
  is_locked?: boolean;
  lock_reason?: string;
  is_tariff_locked?: boolean;
}

export default function StudentCoursePage() {
  const params = useParams<{ courseId: string }>()
  const router = useRouter()
  const courseId = params.courseId
  const supabase = createClient()
  const [course, setCourse] = useState<Course | null>(null)
  const [modules, setModules] = useState<Module[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [productId, setProductId] = useState<string | null>(null)
  const [accessGrantedAt, setAccessGrantedAt] = useState<string | null>(null)
  const [tariffId, setTariffId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: c } = await supabase.from('courses').select('*').eq('id', courseId).single()
      if (cancelled) return
      setCourse(c as Course | null)
      setProductId((c as Course | null)?.product_id ?? null)

      const { data: mods } = await supabase.from('course_modules').select('*').eq('course_id', courseId).order('order_position')
      const { data: lessonsData } = await supabase.from('course_lessons').select('id, course_id, module_id, name, is_bonus, is_exam, cover_url, order_position').or(`course_id.eq.${courseId},module_id.in.(${(mods ?? []).map((m: { id: string }) => m.id).join(',') || '00000000-0000-0000-0000-000000000000'})`).order('order_position')

      // Прогресс ученика
      const { data: customers } = await supabase.from('customers').select('id').eq('user_id', user.id)
      const customerIds = (customers ?? []).map(c => c.id)
      const { data: progress } = customerIds.length > 0
        ? await supabase.from('lesson_progress').select('lesson_id, completed_at').in('customer_id', customerIds)
        : { data: [] }
      const completedSet = new Set((progress ?? []).filter((p: { completed_at: string | null }) => p.completed_at).map((p: { lesson_id: string }) => p.lesson_id))

      // Доступ ученика и тариф
      const productId = (c as Course | null)?.product_id
      let userTariffId: string | null = null
      let accessGranted: string | null = null
      if (productId && customerIds.length > 0) {
        const { data: tariffs } = await supabase.from('tariffs').select('id').eq('product_id', productId)
        const tariffIds = (tariffs ?? []).map((t: { id: string }) => t.id)
        const { data: accesses } = tariffIds.length > 0
          ? await supabase.from('customer_access').select('tariff_id, granted_at')
              .in('customer_id', customerIds).in('tariff_id', tariffIds)
              .order('granted_at', { ascending: false }).limit(1)
          : { data: [] }
        const a = accesses?.[0]
        if (a) { userTariffId = a.tariff_id; accessGranted = a.granted_at }
      }
      if (!cancelled) { setTariffId(userTariffId); setAccessGrantedAt(accessGranted) }

      // Тарифные ограничения для всех узлов курса
      const moduleIds = ((mods as Module[]) ?? []).map(m => m.id)
      const lessonIds = ((lessonsData as Lesson[]) ?? []).map(l => l.id)
      const { data: tariffAccess } = (moduleIds.length + lessonIds.length) > 0
        ? await supabase.from('tariff_content_access').select('node_type, node_id, tariff_id')
            .in('node_id', [...moduleIds, ...lessonIds])
        : { data: [] }
      const accessByNode = new Map<string, string[]>()
      for (const ta of tariffAccess ?? []) {
        const arr = accessByNode.get(ta.node_id) ?? []
        arr.push(ta.tariff_id)
        accessByNode.set(ta.node_id, arr)
      }
      function isTariffLocked(nodeId: string): boolean {
        const allowed = accessByNode.get(nodeId)
        if (!allowed || allowed.length === 0) return false  // нет ограничений
        return !userTariffId || !allowed.includes(userTariffId)
      }

      // Расчёт is_open для модулей
      const computedModules: Module[] = ((mods as Module[]) ?? []).map(m => {
        const tariffLocked = isTariffLocked(m.id)
        const result: Module = { ...m, is_tariff_locked: tariffLocked }
        if (tariffLocked) {
          result.is_open = false
          return result
        }
        switch (m.open_rule_type) {
          case 'instant':
            result.is_open = true
            break
          case 'date':
            result.is_open = m.open_at ? new Date(m.open_at) <= new Date() : true
            result.open_when = m.open_at
            break
          case 'days_after_access':
            if (accessGranted && m.open_after_days != null) {
              const target = new Date(accessGranted)
              target.setDate(target.getDate() + m.open_after_days)
              result.is_open = target <= new Date()
              result.open_when = target.toISOString()
            } else {
              result.is_open = true
            }
            break
          case 'after_previous': {
            // Проверяем что previous_module все уроки пройдены
            if (!m.previous_module_id) { result.is_open = true; break }
            const prevLessons = ((lessonsData as Lesson[]) ?? []).filter(l => l.module_id === m.previous_module_id && !l.is_bonus && !l.is_exam)
            result.is_open = prevLessons.length > 0 && prevLessons.every(l => completedSet.has(l.id))
            break
          }
          case 'manual':
            // Открывается только админом — пока считаем закрытым (TODO: таблица manual_module_unlock)
            result.is_open = false
            break
          default:
            result.is_open = true
        }
        return result
      })
      if (!cancelled) setModules(computedModules)

      // Расчёт is_locked для уроков
      const computedLessons: Lesson[] = ((lessonsData as Lesson[]) ?? []).map(l => {
        const tariffLocked = isTariffLocked(l.id)
        const result: Lesson = { ...l, is_completed: completedSet.has(l.id), is_tariff_locked: tariffLocked }
        if (tariffLocked) {
          result.is_locked = true
          result.lock_reason = 'tariff'
        } else {
          // Если урок в модуле — модуль должен быть открыт
          const m = computedModules.find(x => x.id === l.module_id)
          if (m && !m.is_open) {
            result.is_locked = true
            result.lock_reason = 'module_locked'
          }
          // Экзамен открывается только когда все обычные уроки пройдены
          if (l.is_exam) {
            const allRegular = ((lessonsData as Lesson[]) ?? []).filter(x => !x.is_exam && !x.is_bonus)
            const allDone = allRegular.length > 0 && allRegular.every(x => completedSet.has(x.id))
            if (!allDone) {
              result.is_locked = true
              result.lock_reason = 'exam_locked'
            }
          }
        }
        return result
      })
      if (!cancelled) setLessons(computedLessons)
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId])

  if (loading) return <div className="text-sm text-gray-500">Загружаем…</div>
  if (!course) return <div className="text-sm text-gray-500">Курс не найден</div>

  const rootModules = modules.filter(m => !m.parent_module_id).sort((a, b) => a.order_position - b.order_position)
  const submodulesOf = (id: string) => modules.filter(m => m.parent_module_id === id).sort((a, b) => a.order_position - b.order_position)
  const lessonsOfCourse = lessons.filter(l => l.course_id === courseId && !l.module_id && !l.is_exam).sort((a, b) => a.order_position - b.order_position)
  const lessonsOf = (mid: string) => lessons.filter(l => l.module_id === mid && !l.is_exam).sort((a, b) => a.order_position - b.order_position)
  const exam = lessons.find(l => l.is_exam)

  return (
    <div className="space-y-6">
      <button onClick={() => productId ? router.push(`/learn/product/${productId}`) : router.push('/learn')} className="text-sm text-gray-500 hover:text-gray-800">← К продукту</button>

      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h1 className="text-2xl font-bold text-gray-900">{course.name}</h1>
        {course.description && <p className="text-sm text-gray-500 mt-2">{course.description}</p>}
      </div>

      {/* Уроки в корне курса */}
      {lessonsOfCourse.map(l => (
        <LessonCard key={l.id} lesson={l} courseId={courseId} />
      ))}

      {/* Модули */}
      {rootModules.map(m => (
        <ModuleCard
          key={m.id}
          module={m}
          submodules={submodulesOf(m.id)}
          lessonsInModule={lessonsOf(m.id)}
          lessonsInSubmodules={Object.fromEntries(submodulesOf(m.id).map(sm => [sm.id, lessonsOf(sm.id)]))}
          courseId={courseId}
        />
      ))}

      {/* Экзамен */}
      {exam && (
        <ExamCard exam={exam} courseId={courseId} />
      )}
    </div>
  )
}

function ModuleCard({ module: m, submodules, lessonsInModule, lessonsInSubmodules, courseId }: {
  module: Module; submodules: Module[]; lessonsInModule: Lesson[];
  lessonsInSubmodules: Record<string, Lesson[]>; courseId: string;
}) {
  const [expanded, setExpanded] = useState(m.is_open)
  const totalLessons = lessonsInModule.length + Object.values(lessonsInSubmodules).reduce((s, ls) => s + ls.length, 0)
  const completed = [...lessonsInModule, ...Object.values(lessonsInSubmodules).flat()].filter(l => l.is_completed).length
  const progress = totalLessons > 0 ? Math.round(completed / totalLessons * 100) : 0

  if (m.is_hidden_until_open && !m.is_open) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        disabled={!m.is_open}
        className={`w-full p-5 flex items-center justify-between text-left ${m.is_open ? 'hover:bg-gray-50' : 'cursor-not-allowed'}`}
      >
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${
            !m.is_open ? 'bg-gray-100 text-gray-400' : m.is_bonus ? 'bg-amber-100 text-amber-700' : 'bg-[#6A55F8]/10 text-[#6A55F8]'
          }`}>
            {!m.is_open ? '🔒' : m.is_bonus ? '⭐' : '📂'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-gray-900">{m.name}</h3>
              {m.is_bonus && <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">Бонус</span>}
            </div>
            {!m.is_open && (
              <div className="text-xs text-gray-500 mt-0.5">
                {m.is_tariff_locked && '🔒 Доступно на другом тарифе'}
                {!m.is_tariff_locked && m.open_when && `📅 Откроется ${new Date(m.open_when).toLocaleDateString('ru')}`}
                {!m.is_tariff_locked && !m.open_when && m.open_rule_type === 'after_previous' && '🔒 Откроется после предыдущего модуля'}
                {!m.is_tariff_locked && !m.open_when && m.open_rule_type === 'manual' && '🔒 Откроется по команде преподавателя'}
              </div>
            )}
            {m.is_open && totalLessons > 0 && (
              <div className="text-xs text-gray-500 mt-0.5">{completed}/{totalLessons} уроков · {progress}%</div>
            )}
          </div>
        </div>
        {m.is_tariff_locked && (
          <button className="text-xs px-3 py-1.5 rounded-lg bg-[#6A55F8] text-white hover:bg-[#5040D6]" onClick={e => { e.stopPropagation(); alert('Модалка покупки тарифа — TODO') }}>
            Доплатить
          </button>
        )}
        {m.is_open && <div className={`text-gray-300 transition-transform ${expanded ? 'rotate-180' : ''}`}>▼</div>}
      </button>

      {m.is_open && expanded && (
        <div className="border-t border-gray-100 p-4 space-y-2">
          {/* Уроки модуля */}
          {lessonsInModule.map(l => <LessonCard key={l.id} lesson={l} courseId={courseId} indent />)}
          {/* Подмодули */}
          {submodules.map(sm => (
            <div key={sm.id} className="ml-4">
              <div className="text-xs font-semibold text-gray-500 px-3 py-2">📁 {sm.name}</div>
              <div className="space-y-2">
                {(lessonsInSubmodules[sm.id] ?? []).map(l => <LessonCard key={l.id} lesson={l} courseId={courseId} indent />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LessonCard({ lesson: l, courseId, indent }: { lesson: Lesson; courseId: string; indent?: boolean }) {
  const router = useRouter()
  const onClick = () => {
    if (l.is_locked) return
    router.push(`/learn/course/${courseId}/lesson/${l.id}`)
  }
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg border border-gray-100 px-4 py-3 flex items-center justify-between ${
        l.is_locked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-[#6A55F8]/30'
      } ${indent ? 'ml-2' : ''}`}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`w-8 h-8 rounded-md flex items-center justify-center text-sm flex-shrink-0 ${
          l.is_completed ? 'bg-green-100 text-green-700' :
          l.is_locked ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-600'
        }`}>
          {l.is_completed ? '✓' : l.is_locked ? '🔒' : '📝'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900 truncate">{l.name}</span>
            {l.is_bonus && <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">Бонус</span>}
          </div>
          {l.is_locked && (
            <div className="text-xs text-gray-500 mt-0.5">
              {l.lock_reason === 'tariff' && '🔒 Доступно на другом тарифе'}
              {l.lock_reason === 'module_locked' && 'Модуль ещё закрыт'}
              {l.lock_reason === 'exam_locked' && 'Экзамен откроется после прохождения всех уроков'}
            </div>
          )}
        </div>
      </div>
      {l.is_tariff_locked && (
        <button className="text-xs px-3 py-1.5 rounded-lg bg-[#6A55F8] text-white hover:bg-[#5040D6]" onClick={e => { e.stopPropagation(); alert('Модалка покупки тарифа — TODO') }}>
          Доплатить
        </button>
      )}
    </div>
  )
}

function ExamCard({ exam, courseId }: { exam: Lesson; courseId: string }) {
  const router = useRouter()
  return (
    <div
      onClick={() => !exam.is_locked && router.push(`/learn/course/${courseId}/lesson/${exam.id}`)}
      className={`bg-amber-50 border border-amber-200 rounded-2xl p-5 ${exam.is_locked ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:border-amber-400'}`}
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-amber-200 flex items-center justify-center text-2xl flex-shrink-0">🎓</div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-gray-900">{exam.name}</h3>
          <div className="text-xs text-amber-800 mt-0.5">
            {exam.is_completed ? '✓ Сдан · сертификат выдан' : exam.is_locked ? 'Откроется когда вы пройдёте все уроки курса' : 'Финальный экзамен · ваш шанс получить сертификат'}
          </div>
        </div>
      </div>
    </div>
  )
}
