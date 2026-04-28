'use client'

// Phase 7.6 — Витрина ученика. Главная страница со списком продуктов.
// Ученик видит купленные продукты карточками с обложкой, названием,
// прогрессом по курсам внутри.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Product = {
  product_id: string
  product_name: string
  product_description: string | null
  // Доступ
  granted_at: string
  expires_at: string | null
  is_expired: boolean
  // Курсы
  courses: Array<{ id: string; name: string; cover_url: string | null; progress: number; lesson_count: number; completed_count: number }>
  // Сводка по продукту
  module_count: number
  submodule_count: number
  lesson_count: number
  bonus_count: number
}

export default function StudentHome() {
  const supabase = createClient()
  const router = useRouter()
  const [products, setProducts] = useState<Product[] | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Найти customers связанные с user_id
      const { data: customers } = await supabase
        .from('customers')
        .select('id, project_id')
        .eq('user_id', user.id)

      if (!customers || customers.length === 0) {
        if (!cancelled) setProducts([])
        return
      }

      const customerIds = customers.map(c => c.id)

      // Все active customer_access
      const { data: accesses } = await supabase
        .from('customer_access')
        .select('id, customer_id, tariff_id, granted_at, expires_at')
        .in('customer_id', customerIds)

      if (!accesses || accesses.length === 0) {
        if (!cancelled) setProducts([])
        return
      }

      // tariff -> product
      const tariffIds = [...new Set(accesses.map(a => a.tariff_id))]
      const { data: tariffs } = await supabase.from('tariffs').select('id, product_id').in('id', tariffIds)
      const tariffMap = new Map((tariffs ?? []).map(t => [t.id, t.product_id as string]))

      const productIds = [...new Set(accesses.map(a => tariffMap.get(a.tariff_id)).filter(Boolean) as string[])]
      if (productIds.length === 0) {
        if (!cancelled) setProducts([])
        return
      }

      const { data: prodData } = await supabase.from('products').select('id, name, description').in('id', productIds)
      const prodMap = new Map((prodData ?? []).map(p => [p.id, p]))

      // Курсы продуктов
      const { data: courseData } = await supabase
        .from('course_summary_view')
        .select('*')
        .in('product_id', productIds)
        .eq('is_published', true)

      // Прогресс ученика по урокам
      const { data: progress } = await supabase
        .from('lesson_progress')
        .select('lesson_id, completed_at, customer_id')
        .in('customer_id', customerIds)

      const completedLessons = new Set((progress ?? []).filter(p => p.completed_at).map(p => p.lesson_id as string))

      // Все уроки (не-бонусные, не-экзамены) для подсчёта прогресса
      const courseIds = (courseData ?? []).map(c => c.course_id as string)
      const { data: allLessons } = courseIds.length > 0
        ? await supabase.from('course_lessons').select('id, course_id, module_id, is_bonus, is_exam').or(`course_id.in.(${courseIds.join(',')}),module_id.not.is.null`)
        : { data: [] }
      const { data: allModules } = courseIds.length > 0
        ? await supabase.from('course_modules').select('id, course_id').in('course_id', courseIds)
        : { data: [] }
      const moduleToCoure = new Map(((allModules as Array<{ id: string; course_id: string }>) ?? []).map(m => [m.id, m.course_id]))
      const lessonsByCourse: Record<string, string[]> = {}
      for (const l of (allLessons as Array<{ id: string; course_id: string | null; module_id: string | null; is_bonus: boolean; is_exam: boolean }>) ?? []) {
        if (l.is_bonus || l.is_exam) continue
        const cid = l.course_id ?? (l.module_id ? moduleToCoure.get(l.module_id) : null)
        if (!cid) continue
        if (!lessonsByCourse[cid]) lessonsByCourse[cid] = []
        lessonsByCourse[cid].push(l.id)
      }

      // Собираем продукты
      const result: Product[] = []
      const seenProducts = new Set<string>()
      for (const a of accesses) {
        const pid = tariffMap.get(a.tariff_id)
        if (!pid || seenProducts.has(pid)) continue
        seenProducts.add(pid)
        const p = prodMap.get(pid)
        if (!p) continue

        const productCourses = (courseData ?? []).filter((c: { product_id: string | null }) => c.product_id === pid)
        const isExpired = a.expires_at ? new Date(a.expires_at) < new Date() : false

        const totalModules = productCourses.reduce((sum, c: { module_count: number }) => sum + (c.module_count ?? 0), 0)
        const totalSubmodules = productCourses.reduce((sum, c: { submodule_count: number }) => sum + (c.submodule_count ?? 0), 0)
        const totalLessons = productCourses.reduce((sum, c: { lesson_count: number }) => sum + (c.lesson_count ?? 0), 0)
        const totalBonus = productCourses.reduce((sum, c: { bonus_lesson_count: number }) => sum + (c.bonus_lesson_count ?? 0), 0)

        result.push({
          product_id: pid,
          product_name: p.name,
          product_description: p.description,
          granted_at: a.granted_at,
          expires_at: a.expires_at,
          is_expired: isExpired,
          courses: productCourses.map((c: { course_id: string; name: string; cover_url: string | null; lesson_count: number }) => {
            const lessonIds = lessonsByCourse[c.course_id] ?? []
            const completed = lessonIds.filter(id => completedLessons.has(id)).length
            return {
              id: c.course_id,
              name: c.name,
              cover_url: c.cover_url,
              progress: lessonIds.length > 0 ? Math.round(completed / lessonIds.length * 100) : 0,
              lesson_count: lessonIds.length,
              completed_count: completed,
            }
          }),
          module_count: totalModules,
          submodule_count: totalSubmodules,
          lesson_count: totalLessons,
          bonus_count: totalBonus,
        })
      }

      if (!cancelled) setProducts(result)
    }
    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (products === null) return <div className="text-sm text-gray-500">Загружаем…</div>

  if (products.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#6A55F8]/10 to-[#8B7BFA]/10 flex items-center justify-center text-3xl mx-auto mb-6">📚</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Курсов пока нет</h1>
        <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
          Когда школа выдаст вам доступ к продукту — он появится здесь автоматически.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Мои продукты</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {products.map(p => {
          const totalProgress = p.courses.length === 0 ? 0 : Math.round(p.courses.reduce((s, c) => s + c.progress, 0) / p.courses.length)
          return (
            <div
              key={p.product_id}
              onClick={() => router.push(`/learn/product/${p.product_id}`)}
              className={`bg-white rounded-2xl border border-gray-100 p-6 hover:border-[#6A55F8]/30 hover:shadow-md hover:shadow-[#6A55F8]/5 transition-all cursor-pointer ${p.is_expired ? 'opacity-75' : ''}`}
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6A55F8] to-[#8B7BFA] flex items-center justify-center text-white text-xl mb-4">
                {p.product_name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">{p.product_name}</h2>
              {p.product_description && <p className="text-sm text-gray-500 line-clamp-2 mb-3">{p.product_description}</p>}

              {p.is_expired && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 text-xs text-amber-800">
                  ⏱ Доступ истёк {new Date(p.expires_at!).toLocaleDateString('ru')}. Прогресс сохранён, для продолжения — продлите доступ.
                </div>
              )}

              {/* Прогресс-бар */}
              {!p.is_expired && p.courses.length > 0 && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                    <span>Общий прогресс</span>
                    <span className="font-medium text-gray-700">{totalProgress}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#6A55F8] to-[#8B7BFA]" style={{ width: `${totalProgress}%` }} />
                  </div>
                </div>
              )}

              <div className="text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5 mb-2">
                <span>{p.courses.length} {p.courses.length === 1 ? 'курс' : 'курсов'}</span>
                <span>{p.module_count} мод.</span>
                {p.submodule_count > 0 && <span>{p.submodule_count} подмод.</span>}
                <span>{p.lesson_count} уроков</span>
                {p.bonus_count > 0 && <span>{p.bonus_count} бонусных</span>}
              </div>
              <div className="text-xs text-gray-400">
                {p.expires_at
                  ? `Доступ до ${new Date(p.expires_at).toLocaleDateString('ru')}`
                  : 'Бессрочный доступ'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
