'use client'

// Phase 7.6 — Карточка продукта в витрине ученика.
// Сводка по продукту: имя, прогресс, счётчики, список курсов.

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type ProductInfo = {
  id: string
  name: string
  description: string | null
}

type CourseInfo = {
  id: string
  name: string
  cover_url: string | null
  module_count: number
  lesson_count: number
  bonus_count: number
  exam_count: number
  progress: number
  completed_count: number
}

export default function StudentProductPage() {
  const params = useParams<{ productId: string }>()
  const router = useRouter()
  const productId = params.productId
  const supabase = createClient()
  const [product, setProduct] = useState<ProductInfo | null>(null)
  const [courses, setCourses] = useState<CourseInfo[]>([])
  const [accessExpiry, setAccessExpiry] = useState<{ expires_at: string | null; is_expired: boolean } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: prodData } = await supabase.from('products').select('id, name, description').eq('id', productId).single()
      if (cancelled) return
      setProduct(prodData as ProductInfo | null)

      // Customer access на этот продукт через тарифы
      const { data: tariffs } = await supabase.from('tariffs').select('id').eq('product_id', productId)
      const tariffIds = (tariffs ?? []).map(t => t.id)

      const { data: customers } = await supabase.from('customers').select('id').eq('user_id', user.id)
      const customerIds = (customers ?? []).map(c => c.id)

      if (tariffIds.length > 0 && customerIds.length > 0) {
        const { data: accesses } = await supabase.from('customer_access')
          .select('expires_at')
          .in('customer_id', customerIds)
          .in('tariff_id', tariffIds)
          .order('granted_at', { ascending: false })
          .limit(1)
        const a = accesses?.[0]
        if (a) {
          const isExpired = a.expires_at ? new Date(a.expires_at) < new Date() : false
          if (!cancelled) setAccessExpiry({ expires_at: a.expires_at, is_expired: isExpired })
        }
      }

      // Курсы продукта
      const { data: courseData } = await supabase
        .from('course_summary_view')
        .select('*')
        .eq('product_id', productId)
        .eq('is_published', true)

      // Прогресс ученика
      const { data: progress } = await supabase
        .from('lesson_progress')
        .select('lesson_id, completed_at')
        .in('customer_id', customerIds)
      const completedLessons = new Set((progress ?? []).filter(p => p.completed_at).map(p => p.lesson_id as string))

      const courseIds = (courseData ?? []).map((c: { course_id: string }) => c.course_id)
      const { data: allLessons } = courseIds.length > 0
        ? await supabase.from('course_lessons').select('id, course_id, module_id, is_bonus, is_exam').or(`course_id.in.(${courseIds.join(',')}),module_id.not.is.null`)
        : { data: [] }
      const { data: allModules } = courseIds.length > 0
        ? await supabase.from('course_modules').select('id, course_id').in('course_id', courseIds)
        : { data: [] }
      const moduleMap = new Map(((allModules as Array<{ id: string; course_id: string }>) ?? []).map(m => [m.id, m.course_id]))
      const lessonsByCourse: Record<string, string[]> = {}
      for (const l of (allLessons as Array<{ id: string; course_id: string | null; module_id: string | null; is_bonus: boolean; is_exam: boolean }>) ?? []) {
        if (l.is_bonus || l.is_exam) continue
        const cid = l.course_id ?? (l.module_id ? moduleMap.get(l.module_id) : null)
        if (!cid) continue
        if (!lessonsByCourse[cid]) lessonsByCourse[cid] = []
        lessonsByCourse[cid].push(l.id)
      }

      const result: CourseInfo[] = (courseData ?? []).map((c: { course_id: string; name: string; cover_url: string | null; module_count: number; lesson_count: number; bonus_lesson_count: number; exam_count: number }) => {
        const lessonIds = lessonsByCourse[c.course_id] ?? []
        const completed = lessonIds.filter(id => completedLessons.has(id)).length
        return {
          id: c.course_id,
          name: c.name,
          cover_url: c.cover_url,
          module_count: c.module_count,
          lesson_count: c.lesson_count,
          bonus_count: c.bonus_lesson_count,
          exam_count: c.exam_count,
          progress: lessonIds.length > 0 ? Math.round(completed / lessonIds.length * 100) : 0,
          completed_count: completed,
        }
      })
      if (!cancelled) setCourses(result)
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId])

  if (loading) return <div className="text-sm text-gray-500">Загружаем…</div>
  if (!product) return <div className="text-sm text-gray-500">Продукт не найден</div>

  const totalProgress = courses.length === 0 ? 0 : Math.round(courses.reduce((s, c) => s + c.progress, 0) / courses.length)
  const totalLessons = courses.reduce((s, c) => s + c.lesson_count, 0)
  const totalCompleted = courses.reduce((s, c) => s + c.completed_count, 0)

  return (
    <div className="space-y-6">
      <button onClick={() => router.push('/learn')} className="text-sm text-gray-500 hover:text-gray-800">← Все продукты</button>

      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
        {product.description && <p className="text-sm text-gray-500 mt-2">{product.description}</p>}

        {accessExpiry?.is_expired && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mt-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-amber-900">Доступ истёк</div>
              <div className="text-xs text-amber-700 mt-0.5">
                Срок закончился {new Date(accessExpiry.expires_at!).toLocaleDateString('ru')}. Прогресс сохранён, но новые уроки недоступны.
              </div>
            </div>
            <button className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium">
              Продлить доступ
            </button>
          </div>
        )}

        {/* Прогресс */}
        {!accessExpiry?.is_expired && courses.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Общий прогресс</span>
              <span className="text-sm font-semibold text-[#6A55F8]">{totalProgress}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#6A55F8] to-[#8B7BFA] transition-all" style={{ width: `${totalProgress}%` }} />
            </div>
            <div className="text-xs text-gray-500 mt-2">{totalCompleted} из {totalLessons} уроков пройдено</div>
          </div>
        )}
      </div>

      {/* Курсы */}
      {courses.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
          В этом продукте пока нет опубликованных курсов
        </div>
      ) : (
        <div className="space-y-3">
          {courses.map(c => (
            <div
              key={c.id}
              onClick={() => !accessExpiry?.is_expired && router.push(`/learn/course/${c.id}`)}
              className={`bg-white rounded-xl border border-gray-100 p-5 hover:border-[#6A55F8]/30 transition-all ${
                accessExpiry?.is_expired ? 'cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <div className="flex items-center gap-4">
                {c.cover_url ? (
                  <img src={c.cover_url} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-[#6A55F8] to-[#8B7BFA] flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                    {c.name?.[0]?.toUpperCase() ?? 'C'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-gray-900">{c.name}</h3>
                  <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                    <span>{c.module_count} мод.</span>
                    <span>{c.lesson_count} уроков</span>
                    {c.bonus_count > 0 && <span>{c.bonus_count} бонусных</span>}
                    {c.exam_count > 0 && <span>🎓 экзамен</span>}
                  </div>
                  {c.lesson_count > 0 && (
                    <div className="mt-2">
                      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-[#6A55F8] to-[#8B7BFA]" style={{ width: `${c.progress}%` }} />
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{c.completed_count}/{c.lesson_count} · {c.progress}%</div>
                    </div>
                  )}
                </div>
                {!accessExpiry?.is_expired && <div className="text-gray-300 group-hover:text-gray-500">→</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
