'use client'

// Phase 7.2 — Список курсов в админке.
// Курс = верхний уровень. Внутри: модули → подмодули → уроки + экзамен.
// Архитектура: knowledge/decisions/learning-platform-architecture-2026-04-28.md

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { SkeletonList } from '@/components/ui/Skeleton'

type CourseSummary = {
  course_id: string
  project_id: string
  name: string
  cover_url: string | null
  is_published: boolean
  product_id: string | null
  certificate_enabled: boolean
  module_count: number
  submodule_count: number
  lesson_count: number
  bonus_lesson_count: number
  exam_count: number
}

type Product = { id: string; name: string }

export default function LearningPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const projectId = params.id
  const supabase = createClient()

  const [tab, setTab] = useState<'courses' | 'homework' | 'stats'>('courses')
  const [courses, setCourses] = useState<CourseSummary[] | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [draftName, setDraftName] = useState('')

  async function load() {
    const { data: courseData } = await supabase
      .from('course_summary_view')
      .select('*')
      .eq('project_id', projectId)
    setCourses((courseData as CourseSummary[] | null) ?? [])

    const { data: prodData } = await supabase
      .from('products')
      .select('id, name')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    setProducts((prodData as Product[] | null) ?? [])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function createCourse() {
    if (!draftName.trim()) return
    const { data, error } = await supabase
      .from('courses')
      .insert({ project_id: projectId, name: draftName.trim() })
      .select()
      .single()
    if (error) { alert('Ошибка: ' + error.message); return }
    setCreateOpen(false)
    setDraftName('')
    if (data) router.push(`/project/${projectId}/learning/${data.id}`)
  }

  async function togglePublish(c: CourseSummary) {
    await supabase.from('courses').update({ is_published: !c.is_published }).eq('id', c.course_id)
    load()
  }

  async function duplicateCourse(c: CourseSummary) {
    if (!confirm(`Создать копию курса «${c.name}»?`)) return
    // Полное дублирование: курс → модули → подмодули → уроки → блоки → задания → вопросы
    const { data: src } = await supabase.from('courses').select('*').eq('id', c.course_id).single()
    if (!src) return
    const { data: newCourse } = await supabase
      .from('courses')
      .insert({
        project_id: src.project_id,
        name: `${src.name} (копия)`,
        description: src.description,
        cover_url: src.cover_url,
        is_published: false,
        product_id: src.product_id,
        certificate_enabled: src.certificate_enabled,
        points_system_enabled: src.points_system_enabled,
        gamification_enabled: src.gamification_enabled,
      })
      .select().single()
    if (!newCourse) return

    // Модули → новый id mapping
    const { data: modules } = await supabase.from('course_modules').select('*').eq('course_id', c.course_id).order('order_position')
    const modMap: Record<string, string> = {}
    if (modules) {
      // Двухпроходный insert: сначала родительские модули, потом подмодули
      const parents = modules.filter(m => !m.parent_module_id)
      const children = modules.filter(m => m.parent_module_id)
      for (const m of parents) {
        const { data: nm } = await supabase.from('course_modules').insert({
          course_id: newCourse.id, name: m.name, description: m.description, cover_url: m.cover_url,
          is_bonus: m.is_bonus, is_hidden_until_open: m.is_hidden_until_open,
          open_rule_type: m.open_rule_type, open_at: m.open_at, open_after_days: m.open_after_days,
          order_position: m.order_position,
        }).select().single()
        if (nm) modMap[m.id] = nm.id
      }
      for (const m of children) {
        const newParent = m.parent_module_id ? modMap[m.parent_module_id] : null
        if (!newParent) continue
        const { data: nm } = await supabase.from('course_modules').insert({
          course_id: newCourse.id, parent_module_id: newParent,
          name: m.name, description: m.description, cover_url: m.cover_url,
          is_bonus: m.is_bonus, is_hidden_until_open: m.is_hidden_until_open,
          open_rule_type: m.open_rule_type, open_at: m.open_at, open_after_days: m.open_after_days,
          order_position: m.order_position,
        }).select().single()
        if (nm) modMap[m.id] = nm.id
      }
    }

    // Уроки → mapping
    const { data: lessons } = await supabase.from('course_lessons').select('*').or(`course_id.eq.${c.course_id},module_id.in.(${Object.keys(modMap).join(',') || '00000000-0000-0000-0000-000000000000'})`)
    const lessonMap: Record<string, string> = {}
    if (lessons) {
      for (const l of lessons) {
        const newCourseId = l.course_id ? newCourse.id : null
        const newModId = l.module_id ? modMap[l.module_id] : null
        if (!newCourseId && !newModId) continue
        const { data: nl } = await supabase.from('course_lessons').insert({
          course_id: newCourseId,
          module_id: newModId,
          name: l.name,
          description: l.description,
          cover_url: l.cover_url,
          is_bonus: l.is_bonus,
          is_exam: l.is_exam,
          attempts_limit: l.attempts_limit,
          video_threshold: l.video_threshold,
          completion_rules: l.completion_rules,
          hard_stop_on_failure: l.hard_stop_on_failure,
          order_position: l.order_position,
        }).select().single()
        if (nl) lessonMap[l.id] = nl.id
      }
    }

    // Блоки уроков
    if (Object.keys(lessonMap).length > 0) {
      const { data: blocks } = await supabase.from('lesson_blocks').select('*').in('lesson_id', Object.keys(lessonMap))
      if (blocks) {
        for (const b of blocks) {
          await supabase.from('lesson_blocks').insert({
            lesson_id: lessonMap[b.lesson_id],
            type: b.type,
            content: b.content,
            order_position: b.order_position,
          })
        }
      }
      // Задания + вопросы
      const { data: assigns } = await supabase.from('lesson_assignments').select('*').in('lesson_id', Object.keys(lessonMap))
      if (assigns) {
        const assignMap: Record<string, string> = {}
        for (const a of assigns) {
          const { data: na } = await supabase.from('lesson_assignments').insert({
            lesson_id: lessonMap[a.lesson_id],
            type: a.type, title: a.title, description: a.description,
            settings: a.settings, is_required: a.is_required, order_position: a.order_position,
          }).select().single()
          if (na) assignMap[a.id] = na.id
        }
        if (Object.keys(assignMap).length) {
          const { data: questions } = await supabase.from('quiz_questions').select('*').in('assignment_id', Object.keys(assignMap))
          if (questions) {
            for (const q of questions) {
              await supabase.from('quiz_questions').insert({
                assignment_id: assignMap[q.assignment_id],
                type: q.type, question_text: q.question_text,
                options: q.options, correct_text: q.correct_text, correct_text_alts: q.correct_text_alts,
                points: q.points, order_position: q.order_position,
              })
            }
          }
        }
      }
    }

    load()
  }

  async function deleteCourse(c: CourseSummary) {
    if (!confirm(`Удалить курс «${c.name}»? Все модули, уроки и прогресс учеников будут удалены.`)) return
    await supabase.from('courses').delete().eq('id', c.course_id)
    load()
  }

  if (!courses) return <SkeletonList />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Обучение</h1>
          <p className="text-sm text-gray-500 mt-0.5">Курсы, домашки, статистика</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          + Создать курс
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['courses', 'homework', 'stats'] as const).map(t => (
          <button
            key={t}
            onClick={() => {
              if (t === 'homework') router.push(`/project/${projectId}/learning/homework`)
              else if (t === 'stats') router.push(`/project/${projectId}/learning/stats`)
              else setTab(t)
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-[#6A55F8] text-[#6A55F8]'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t === 'courses' && 'Курсы'}
            {t === 'homework' && 'Домашки'}
            {t === 'stats' && 'Статистика'}
          </button>
        ))}
      </div>

      {/* Courses list */}
      {courses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
          <div className="text-3xl mb-3">📚</div>
          <h3 className="text-base font-semibold text-gray-900 mb-1">Пока нет курсов</h3>
          <p className="text-sm text-gray-500 mb-4">Создайте первый курс — модули, уроки и задания добавите внутри.</p>
          <button onClick={() => setCreateOpen(true)} className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium">
            + Создать курс
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {courses.map(c => {
            const product = products.find(p => p.id === c.product_id)
            return (
              <div
                key={c.course_id}
                onClick={() => router.push(`/project/${projectId}/learning/${c.course_id}`)}
                className="bg-white rounded-xl border border-gray-100 px-5 py-4 flex items-center justify-between hover:border-[#6A55F8]/30 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  {c.cover_url ? (
                    <img src={c.cover_url} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-[#6A55F8] to-[#8B7BFA] flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                      {c.name?.[0]?.toUpperCase() ?? 'C'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">{c.name}</h3>
                      {!c.is_published && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Черновик</span>}
                      {c.certificate_enabled && <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">🎓 Сертификат</span>}
                    </div>
                    <div className="text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>{c.module_count} мод.</span>
                      {c.submodule_count > 0 && <span>{c.submodule_count} подмод.</span>}
                      <span>{c.lesson_count} уроков</span>
                      {c.bonus_lesson_count > 0 && <span>{c.bonus_lesson_count} бонусных</span>}
                      {c.exam_count > 0 && <span>экзамен</span>}
                      {product && <span>· {product.name}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <button onClick={() => togglePublish(c)} className={`text-xs px-2 py-1 rounded ${c.is_published ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {c.is_published ? '✓ Опубликован' : 'Опубликовать'}
                  </button>
                  <button onClick={() => duplicateCourse(c)} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">Копия</button>
                  <button onClick={() => deleteCourse(c)} className="text-xs px-2 py-1 rounded text-red-500 hover:bg-red-50">✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Новый курс"
        subtitle="Модули, уроки и задания добавите внутри после создания"
        footer={<>
          <button onClick={() => setCreateOpen(false)} className="text-sm text-gray-500 hover:text-gray-800 px-3 py-2">Отмена</button>
          <button onClick={createCourse} disabled={!draftName.trim()} className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40">
            Создать курс
          </button>
        </>}
      >
        <div className="p-5">
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Название курса</label>
          <input
            type="text"
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createCourse()}
            autoFocus
            placeholder="Например, Marketing Mastery"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]"
          />
        </div>
      </Modal>
    </div>
  )
}
