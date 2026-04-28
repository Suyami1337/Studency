'use client'

// Phase 7.2 — Редактор курса с деревом, drag-n-drop, настройками модуля.
// Иерархия: курс → (урок | модуль → (урок | подмодуль → урок)) + экзамен.

import { useEffect, useState, useCallback, DragEvent } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { SkeletonList } from '@/components/ui/Skeleton'

type Course = {
  id: string
  project_id: string
  name: string
  description: string | null
  cover_url: string | null
  is_published: boolean
  product_id: string | null
  certificate_enabled: boolean
  points_system_enabled: boolean
}

type Module = {
  id: string
  course_id: string
  parent_module_id: string | null
  name: string
  description: string | null
  cover_url: string | null
  is_bonus: boolean
  is_hidden_until_open: boolean
  open_rule_type: 'instant' | 'date' | 'days_after_access' | 'after_previous' | 'manual'
  open_at: string | null
  open_after_days: number | null
  previous_module_id: string | null
  order_position: number
}

type Lesson = {
  id: string
  course_id: string | null
  module_id: string | null
  name: string
  is_bonus: boolean
  is_exam: boolean
  cover_url: string | null
  order_position: number
}

type Tariff = { id: string; name: string }
type Product = { id: string; name: string }

// Тип элемента в дереве: либо модуль, либо урок
type TreeNodeType = 'module' | 'submodule' | 'lesson' | 'exam'
type DragData = { type: TreeNodeType; id: string; parent: string | null }

export default function CourseEditorPage() {
  const params = useParams<{ id: string; courseId: string }>()
  const router = useRouter()
  const projectId = params.id
  const courseId = params.courseId
  const supabase = createClient()

  const [course, setCourse] = useState<Course | null>(null)
  const [modules, setModules] = useState<Module[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [tariffs, setTariffs] = useState<Tariff[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'content' | 'settings'>('content')

  // UI state
  const [moduleSettingsId, setModuleSettingsId] = useState<string | null>(null)
  const [addAt, setAddAt] = useState<{ courseId?: string; moduleId?: string } | null>(null)
  const [drag, setDrag] = useState<DragData | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [c, m, l, p, t] = await Promise.all([
      supabase.from('courses').select('*').eq('id', courseId).single(),
      supabase.from('course_modules').select('*').eq('course_id', courseId).order('order_position'),
      supabase.from('course_lessons').select('id, course_id, module_id, name, is_bonus, is_exam, cover_url, order_position').or(`course_id.eq.${courseId},module_id.not.is.null`).order('order_position'),
      supabase.from('products').select('id, name').eq('project_id', projectId),
      supabase.from('tariffs').select('id, name').eq('is_active', true),
    ])
    setCourse(c.data as Course | null)
    setModules((m.data as Module[]) ?? [])
    // Урок принадлежит этому курсу если course_id курса ИЛИ module_id указывает на модуль этого курса
    const moduleIds = new Set(((m.data as Module[]) ?? []).map(x => x.id))
    setLessons(((l.data as Lesson[]) ?? []).filter(ls => ls.course_id === courseId || (ls.module_id && moduleIds.has(ls.module_id))))
    setProducts((p.data as Product[]) ?? [])
    setTariffs((t.data as Tariff[]) ?? [])
    setLoading(false)
  }, [courseId, projectId, supabase])

  useEffect(() => { load() }, [load])

  if (loading) return <SkeletonList />
  if (!course) return <div className="text-sm text-gray-500">Курс не найден</div>

  // ── Иерархия для рендера ──────────────────────────────────────────────
  const rootModules = modules.filter(m => !m.parent_module_id).sort((a, b) => a.order_position - b.order_position)
  const submodulesOf = (parentId: string) => modules.filter(m => m.parent_module_id === parentId).sort((a, b) => a.order_position - b.order_position)
  const lessonsOfCourse = lessons.filter(l => l.course_id === courseId && !l.module_id && !l.is_exam).sort((a, b) => a.order_position - b.order_position)
  const lessonsOf = (moduleId: string) => lessons.filter(l => l.module_id === moduleId && !l.is_exam).sort((a, b) => a.order_position - b.order_position)
  const exam = lessons.find(l => l.is_exam && l.course_id === courseId)

  // ── CRUD ──────────────────────────────────────────────────────────────
  async function addModule(parentModuleId: string | null) {
    const siblings = parentModuleId ? submodulesOf(parentModuleId) : rootModules
    const order = siblings.length
    const name = parentModuleId ? `Подмодуль ${order + 1}` : `Модуль ${order + 1}`
    await supabase.from('course_modules').insert({
      course_id: courseId,
      parent_module_id: parentModuleId,
      name,
      order_position: order,
    })
    load()
  }

  async function addLesson(parent: { courseId?: string; moduleId?: string }) {
    let order = 0
    if (parent.moduleId) order = lessonsOf(parent.moduleId).length
    else order = lessonsOfCourse.length
    await supabase.from('course_lessons').insert({
      course_id: parent.courseId ?? null,
      module_id: parent.moduleId ?? null,
      name: `Урок ${order + 1}`,
      order_position: order,
    })
    load()
  }

  async function addExam() {
    if (exam) return alert('Экзамен уже существует. Можно создать только один на курс.')
    await supabase.from('course_lessons').insert({
      course_id: courseId,
      module_id: null,
      name: 'Экзамен',
      is_exam: true,
      order_position: 9999,
    })
    load()
  }

  async function deleteModule(m: Module) {
    if (!confirm(`Удалить модуль «${m.name}»? Все подмодули и уроки внутри будут удалены.`)) return
    await supabase.from('course_modules').delete().eq('id', m.id)
    load()
  }

  async function deleteLesson(l: Lesson) {
    if (!confirm(`Удалить урок «${l.name}»?`)) return
    await supabase.from('course_lessons').delete().eq('id', l.id)
    load()
  }

  async function duplicateLesson(l: Lesson) {
    const { data: src } = await supabase.from('course_lessons').select('*').eq('id', l.id).single()
    if (!src) return
    const { data: copy } = await supabase.from('course_lessons').insert({
      course_id: src.course_id, module_id: src.module_id,
      name: `${src.name} (копия)`,
      description: src.description, cover_url: src.cover_url,
      is_bonus: src.is_bonus, is_exam: false,
      attempts_limit: src.attempts_limit, video_threshold: src.video_threshold,
      completion_rules: src.completion_rules, hard_stop_on_failure: src.hard_stop_on_failure,
      order_position: 9999,
    }).select().single()
    if (!copy) return
    // Скопировать блоки
    const { data: blocks } = await supabase.from('lesson_blocks').select('*').eq('lesson_id', l.id)
    if (blocks) {
      for (const b of blocks) {
        await supabase.from('lesson_blocks').insert({
          lesson_id: copy.id, type: b.type, content: b.content, order_position: b.order_position,
        })
      }
    }
    // Скопировать задания + вопросы
    const { data: assigns } = await supabase.from('lesson_assignments').select('*').eq('lesson_id', l.id)
    if (assigns) {
      for (const a of assigns) {
        const { data: na } = await supabase.from('lesson_assignments').insert({
          lesson_id: copy.id, type: a.type, title: a.title, description: a.description,
          settings: a.settings, is_required: a.is_required, order_position: a.order_position,
        }).select().single()
        if (na) {
          const { data: qs } = await supabase.from('quiz_questions').select('*').eq('assignment_id', a.id)
          if (qs) {
            for (const q of qs) {
              await supabase.from('quiz_questions').insert({
                assignment_id: na.id, type: q.type, question_text: q.question_text,
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

  // ── Drag & drop ───────────────────────────────────────────────────────
  function onDragStart(e: DragEvent, data: DragData) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', JSON.stringify(data))
    setDrag(data)
  }
  function onDragOver(e: DragEvent, targetKey: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(targetKey)
  }
  function onDragLeave() { setDropTarget(null) }
  async function onDrop(e: DragEvent, target: { type: 'reorder' | 'into-course' | 'into-module' | 'into-submodule'; id?: string; afterId?: string }) {
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(null)
    if (!drag) return
    const dragData = drag
    setDrag(null)

    if (dragData.type === 'lesson') {
      // Урок переносим
      const targetModuleId = target.type === 'into-module' || target.type === 'into-submodule' ? target.id : null
      const targetCourseId = target.type === 'into-course' ? courseId : null
      if (targetModuleId === dragData.parent && targetCourseId === null && target.type !== 'reorder') return // не изменилось

      let newOrder = 0
      if (target.type === 'into-course') newOrder = lessonsOfCourse.length
      else if (target.type === 'into-module' && target.id) newOrder = lessonsOf(target.id).length
      else if (target.type === 'into-submodule' && target.id) newOrder = lessonsOf(target.id).length

      await supabase.from('course_lessons').update({
        course_id: targetCourseId,
        module_id: targetModuleId,
        order_position: newOrder,
      }).eq('id', dragData.id)
    } else if (dragData.type === 'module' || dragData.type === 'submodule') {
      // Модули можно переставлять только внутри их уровня
      if (target.type === 'reorder') {
        // Простая перестановка по afterId
        const allAtLevel = dragData.type === 'submodule' && dragData.parent
          ? submodulesOf(dragData.parent)
          : rootModules
        const filtered = allAtLevel.filter(x => x.id !== dragData.id)
        const idx = target.afterId ? filtered.findIndex(x => x.id === target.afterId) + 1 : 0
        filtered.splice(idx, 0, allAtLevel.find(x => x.id === dragData.id)!)
        for (let i = 0; i < filtered.length; i++) {
          await supabase.from('course_modules').update({ order_position: i }).eq('id', filtered[i].id)
        }
      }
    }
    load()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push(`/project/${projectId}/learning`)} className="text-sm text-gray-500 hover:text-gray-800">← Курсы</button>
        <h1 className="text-xl font-bold text-gray-900 truncate flex-1">{course.name}</h1>
        {!course.is_published && <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded">Черновик</span>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['content', 'settings'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-[#6A55F8] text-[#6A55F8]' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t === 'content' ? 'Содержание' : 'Настройки курса'}
          </button>
        ))}
      </div>

      {tab === 'content' && (
        <div className="space-y-3">
          {/* Уроки в корне курса */}
          {lessonsOfCourse.map(l => (
            <LessonRow key={l.id}
              lesson={l}
              indent={0}
              onClick={() => router.push(`/project/${projectId}/learning/${courseId}/lesson/${l.id}`)}
              onDelete={() => deleteLesson(l)}
              onDuplicate={() => duplicateLesson(l)}
              draggable
              onDragStart={e => onDragStart(e, { type: 'lesson', id: l.id, parent: null })}
              onDragOver={e => onDragOver(e, `lesson-${l.id}`)}
              onDragLeave={onDragLeave}
              onDrop={e => onDrop(e, { type: 'into-course' })}
              isDropTarget={dropTarget === `lesson-${l.id}`}
            />
          ))}

          {/* Модули + вложенные подмодули + уроки */}
          {rootModules.map(m => (
            <div key={m.id}>
              <ModuleRow
                module={m}
                indent={0}
                onSettings={() => setModuleSettingsId(m.id)}
                onDelete={() => deleteModule(m)}
                onAddInside={() => setAddAt({ moduleId: m.id })}
                onDragStart={e => onDragStart(e, { type: 'module', id: m.id, parent: null })}
                onDragOver={e => onDragOver(e, `module-${m.id}`)}
                onDragLeave={onDragLeave}
                onDropInto={e => onDrop(e, { type: 'into-module', id: m.id })}
                onDropReorder={e => onDrop(e, { type: 'reorder', afterId: m.id })}
                isDropTarget={dropTarget === `module-${m.id}`}
              />
              {/* Дети модуля */}
              <div className="ml-6 space-y-2 mt-2">
                {/* Подмодули */}
                {submodulesOf(m.id).map(sm => (
                  <div key={sm.id}>
                    <ModuleRow
                      module={sm}
                      indent={1}
                      onSettings={() => setModuleSettingsId(sm.id)}
                      onDelete={() => deleteModule(sm)}
                      onAddInside={() => setAddAt({ moduleId: sm.id })}
                      onDragStart={e => onDragStart(e, { type: 'submodule', id: sm.id, parent: m.id })}
                      onDragOver={e => onDragOver(e, `submodule-${sm.id}`)}
                      onDragLeave={onDragLeave}
                      onDropInto={e => onDrop(e, { type: 'into-submodule', id: sm.id })}
                      onDropReorder={e => onDrop(e, { type: 'reorder', afterId: sm.id })}
                      isDropTarget={dropTarget === `submodule-${sm.id}`}
                    />
                    <div className="ml-6 space-y-1 mt-1">
                      {lessonsOf(sm.id).map(l => (
                        <LessonRow key={l.id}
                          lesson={l}
                          indent={2}
                          onClick={() => router.push(`/project/${projectId}/learning/${courseId}/lesson/${l.id}`)}
                          onDelete={() => deleteLesson(l)}
                          onDuplicate={() => duplicateLesson(l)}
                          draggable
                          onDragStart={e => onDragStart(e, { type: 'lesson', id: l.id, parent: sm.id })}
                          onDragOver={e => onDragOver(e, `lesson-${l.id}`)}
                          onDragLeave={onDragLeave}
                          onDrop={e => onDrop(e, { type: 'into-submodule', id: sm.id })}
                          isDropTarget={dropTarget === `lesson-${l.id}`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {/* Уроки модуля */}
                {lessonsOf(m.id).map(l => (
                  <LessonRow key={l.id}
                    lesson={l}
                    indent={1}
                    onClick={() => router.push(`/project/${projectId}/learning/${courseId}/lesson/${l.id}`)}
                    onDelete={() => deleteLesson(l)}
                    onDuplicate={() => duplicateLesson(l)}
                    draggable
                    onDragStart={e => onDragStart(e, { type: 'lesson', id: l.id, parent: m.id })}
                    onDragOver={e => onDragOver(e, `lesson-${l.id}`)}
                    onDragLeave={onDragLeave}
                    onDrop={e => onDrop(e, { type: 'into-module', id: m.id })}
                    isDropTarget={dropTarget === `lesson-${l.id}`}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Экзамен */}
          {exam && (
            <div
              onClick={() => router.push(`/project/${projectId}/learning/${courseId}/lesson/${exam.id}`)}
              className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between cursor-pointer hover:border-amber-300"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-200 flex items-center justify-center text-amber-800">🎓</div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">{exam.name}</div>
                  <div className="text-xs text-amber-700">Финальный экзамен · сертификат</div>
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); deleteLesson(exam) }} className="text-xs text-gray-400 hover:text-red-500">✕</button>
            </div>
          )}

          {/* Add buttons */}
          <div className="flex flex-wrap gap-2 pt-3">
            <button onClick={() => addModule(null)} className="px-3 py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-600 hover:border-[#6A55F8] hover:text-[#6A55F8]">+ Модуль</button>
            <button onClick={() => addLesson({ courseId })} className="px-3 py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-600 hover:border-[#6A55F8] hover:text-[#6A55F8]">+ Урок в курс</button>
            {!exam && (
              <button onClick={addExam} className="px-3 py-2 rounded-lg border border-dashed border-amber-300 text-sm text-amber-700 hover:border-amber-500">🎓 Добавить экзамен</button>
            )}
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <CourseSettings
          course={course}
          products={products}
          onUpdate={load}
        />
      )}

      {/* Module settings modal */}
      {moduleSettingsId && (
        <ModuleSettingsModal
          moduleId={moduleSettingsId}
          tariffs={tariffs}
          modules={modules}
          onClose={() => setModuleSettingsId(null)}
          onUpdate={() => { setModuleSettingsId(null); load() }}
        />
      )}

      {/* Add inside (модуль/подмодуль/урок) */}
      {addAt && (
        <Modal
          isOpen={true}
          onClose={() => setAddAt(null)}
          title="Что добавить?"
          subtitle={addAt.moduleId ? 'Внутри этого модуля' : 'В этот курс'}
          maxWidth="md"
        >
          <div className="p-5 grid grid-cols-1 gap-2">
            {addAt.moduleId && (() => {
              // Если этот модуль уже подмодуль — внутри только уроки. Если нет — урок или подмодуль
              const parent = modules.find(m => m.id === addAt.moduleId)
              const isSubmodule = !!parent?.parent_module_id
              return (
                <>
                  <button
                    onClick={() => { addLesson({ moduleId: addAt.moduleId! }); setAddAt(null) }}
                    className="px-4 py-3 rounded-lg border border-gray-200 text-left hover:border-[#6A55F8] text-sm"
                  >
                    📝 Урок
                  </button>
                  {!isSubmodule && (
                    <button
                      onClick={() => { addModule(addAt.moduleId!); setAddAt(null) }}
                      className="px-4 py-3 rounded-lg border border-gray-200 text-left hover:border-[#6A55F8] text-sm"
                    >
                      📂 Подмодуль (вложенный модуль)
                    </button>
                  )}
                </>
              )
            })()}
          </div>
        </Modal>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────
// Module row
// ───────────────────────────────────────────────────────────────────────
function ModuleRow({
  module: m, indent, onSettings, onDelete, onAddInside,
  onDragStart, onDragOver, onDragLeave, onDropInto, onDropReorder, isDropTarget,
}: {
  module: Module; indent: number;
  onSettings: () => void; onDelete: () => void; onAddInside: () => void;
  onDragStart: (e: DragEvent) => void; onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void; onDropInto: (e: DragEvent) => void; onDropReorder: (e: DragEvent) => void;
  isDropTarget: boolean;
}) {
  const isSubmodule = indent === 1
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDropInto}
      className={`bg-white rounded-xl border px-4 py-3 flex items-center justify-between cursor-move group transition-all ${
        isDropTarget ? 'border-[#6A55F8] bg-[#6A55F8]/5' : 'border-gray-100 hover:border-gray-200'
      }`}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="text-gray-300 cursor-grab">⋮⋮</div>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isSubmodule ? 'bg-purple-100 text-purple-700' : 'bg-[#6A55F8]/10 text-[#6A55F8]'
        }`}>
          {isSubmodule ? '📁' : '📂'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 truncate">{m.name}</span>
            {m.is_bonus && <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">Бонусный</span>}
            {m.open_rule_type !== 'instant' && <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{openRuleLabel(m)}</span>}
            {m.is_hidden_until_open && <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">Скрыт</span>}
          </div>
          {m.description && <p className="text-xs text-gray-500 truncate mt-0.5">{m.description}</p>}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onAddInside} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">+ Добавить</button>
        <button onClick={onSettings} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">⚙</button>
        <button onClick={onDelete} className="text-xs px-2 py-1 rounded text-red-500 hover:bg-red-50">✕</button>
      </div>
    </div>
  )
}

function openRuleLabel(m: Module) {
  switch (m.open_rule_type) {
    case 'date': return m.open_at ? `📅 ${new Date(m.open_at).toLocaleDateString('ru')}` : '📅 По дате'
    case 'days_after_access': return `⏱ +${m.open_after_days} дн.`
    case 'after_previous': return '🔒 После пред.'
    case 'manual': return '✋ Вручную'
    default: return ''
  }
}

// ───────────────────────────────────────────────────────────────────────
// Lesson row
// ───────────────────────────────────────────────────────────────────────
function LessonRow({
  lesson, onClick, onDelete, onDuplicate,
  draggable, onDragStart, onDragOver, onDragLeave, onDrop, isDropTarget,
}: {
  lesson: Lesson; indent: number; onClick: () => void; onDelete: () => void; onDuplicate: () => void;
  draggable: boolean;
  onDragStart: (e: DragEvent) => void; onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void; onDrop: (e: DragEvent) => void; isDropTarget: boolean;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      className={`bg-white rounded-lg border px-4 py-2.5 flex items-center justify-between cursor-pointer group transition-all ${
        isDropTarget ? 'border-[#6A55F8] bg-[#6A55F8]/5' : 'border-gray-100 hover:border-gray-200'
      }`}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="text-gray-300 cursor-grab text-sm">⋮⋮</div>
        <div className="w-7 h-7 rounded-md bg-blue-50 flex items-center justify-center text-blue-600 text-xs flex-shrink-0">📝</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900 truncate">{lesson.name}</span>
            {lesson.is_bonus && <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">Бонусный</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        <button onClick={onDuplicate} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">Копия</button>
        <button onClick={onDelete} className="text-xs px-2 py-1 rounded text-red-500 hover:bg-red-50">✕</button>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────
// Module Settings Modal
// ───────────────────────────────────────────────────────────────────────
function ModuleSettingsModal({
  moduleId, tariffs, modules, onClose, onUpdate,
}: {
  moduleId: string; tariffs: Tariff[]; modules: Module[];
  onClose: () => void; onUpdate: () => void;
}) {
  const supabase = createClient()
  const m = modules.find(x => x.id === moduleId)
  const [name, setName] = useState(m?.name ?? '')
  const [description, setDescription] = useState(m?.description ?? '')
  const [coverUrl, setCoverUrl] = useState(m?.cover_url ?? '')
  const [isBonus, setIsBonus] = useState(m?.is_bonus ?? false)
  const [isHidden, setIsHidden] = useState(m?.is_hidden_until_open ?? false)
  const [openRuleType, setOpenRuleType] = useState(m?.open_rule_type ?? 'instant')
  const [openAt, setOpenAt] = useState(m?.open_at ? m.open_at.slice(0, 16) : '')
  const [openAfterDays, setOpenAfterDays] = useState(m?.open_after_days ?? 7)
  const [previousModuleId, setPreviousModuleId] = useState(m?.previous_module_id ?? '')
  const [tariffAccess, setTariffAccess] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // Загрузим текущий tariff_access для модуля
  useEffect(() => {
    if (!moduleId) return
    supabase.from('tariff_content_access').select('tariff_id').eq('node_type', 'module').eq('node_id', moduleId).then(({ data }) => {
      setTariffAccess((data ?? []).map(r => r.tariff_id))
    })
  }, [moduleId, supabase])

  if (!m) return null

  const isSubmodule = !!m.parent_module_id

  async function save() {
    setSaving(true)
    await supabase.from('course_modules').update({
      name, description: description || null, cover_url: coverUrl || null,
      is_bonus: isBonus, is_hidden_until_open: isHidden,
      open_rule_type: openRuleType,
      open_at: openRuleType === 'date' && openAt ? new Date(openAt).toISOString() : null,
      open_after_days: openRuleType === 'days_after_access' ? openAfterDays : null,
      previous_module_id: openRuleType === 'after_previous' && previousModuleId ? previousModuleId : null,
    }).eq('id', moduleId)

    // tariff_content_access — wipe & re-create
    await supabase.from('tariff_content_access').delete().eq('node_type', 'module').eq('node_id', moduleId)
    if (tariffAccess.length > 0) {
      await supabase.from('tariff_content_access').insert(
        tariffAccess.map(tid => ({ tariff_id: tid, node_type: 'module', node_id: moduleId }))
      )
    }
    setSaving(false)
    onUpdate()
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={isSubmodule ? 'Настройки подмодуля' : 'Настройки модуля'}
      maxWidth="2xl"
      footer={<>
        <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800 px-3 py-2">Отмена</button>
        <button onClick={save} disabled={saving} className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40">
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </>}
    >
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Название</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Описание</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] resize-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Обложка (URL)</label>
          <input type="text" value={coverUrl} onChange={e => setCoverUrl(e.target.value)} placeholder="https://…"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
        </div>

        {/* Бонусный */}
        {!isSubmodule && (
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={isBonus} onChange={e => setIsBonus(e.target.checked)} className="w-4 h-4 accent-[#6A55F8]" />
            <span className="text-sm">Бонусный модуль (не учитывается в прогрессе курса)</span>
          </label>
        )}

        {/* Видимость */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={isHidden} onChange={e => setIsHidden(e.target.checked)} className="w-4 h-4 accent-[#6A55F8]" />
          <span className="text-sm">Скрыт до момента открытия (вместо плашки «откроется тогда-то»)</span>
        </label>

        {/* Правило открытия */}
        <div className="border-t border-gray-100 pt-4">
          <label className="block text-xs font-medium text-gray-700 mb-2">Когда открывается</label>
          <div className="space-y-2">
            {[
              { v: 'instant', label: 'Сразу при получении доступа к курсу' },
              { v: 'date', label: 'На конкретную дату' },
              { v: 'days_after_access', label: 'Через N дней после получения доступа (drip)' },
              { v: 'after_previous', label: 'После прохождения другого модуля' },
              { v: 'manual', label: 'Вручную (админ открывает кнопкой)' },
            ].map(o => (
              <label key={o.v} className="flex items-center gap-3 cursor-pointer">
                <input type="radio" checked={openRuleType === o.v} onChange={() => setOpenRuleType(o.v as typeof openRuleType)} className="w-4 h-4 accent-[#6A55F8]" />
                <span className="text-sm">{o.label}</span>
              </label>
            ))}
          </div>

          {openRuleType === 'date' && (
            <div className="mt-3">
              <label className="block text-xs text-gray-500 mb-1">Дата и время открытия</label>
              <input type="datetime-local" value={openAt} onChange={e => setOpenAt(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>
          )}
          {openRuleType === 'days_after_access' && (
            <div className="mt-3">
              <label className="block text-xs text-gray-500 mb-1">Через сколько дней</label>
              <input type="number" min={1} value={openAfterDays} onChange={e => setOpenAfterDays(parseInt(e.target.value || '0'))}
                className="w-24 px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>
          )}
          {openRuleType === 'after_previous' && (
            <div className="mt-3">
              <label className="block text-xs text-gray-500 mb-1">После прохождения модуля</label>
              <select value={previousModuleId} onChange={e => setPreviousModuleId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
                <option value="">— выбери модуль —</option>
                {modules.filter(x => x.id !== moduleId).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Tariff access */}
        {tariffs.length > 0 && (
          <div className="border-t border-gray-100 pt-4">
            <label className="block text-xs font-medium text-gray-700 mb-2">Доступен тарифам</label>
            <p className="text-xs text-gray-500 mb-2">Если ничего не выбрано — модуль доступен всем тарифам продукта. Если выбраны — только им (остальные видят с замком).</p>
            <div className="grid grid-cols-2 gap-2">
              {tariffs.map(t => (
                <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox"
                    checked={tariffAccess.includes(t.id)}
                    onChange={e => {
                      if (e.target.checked) setTariffAccess([...tariffAccess, t.id])
                      else setTariffAccess(tariffAccess.filter(x => x !== t.id))
                    }}
                    className="w-4 h-4 accent-[#6A55F8]" />
                  <span className="text-sm">{t.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ───────────────────────────────────────────────────────────────────────
// Course settings tab
// ───────────────────────────────────────────────────────────────────────
function CourseSettings({
  course, products, onUpdate,
}: {
  course: Course; products: Product[]; onUpdate: () => void;
}) {
  const supabase = createClient()
  const [name, setName] = useState(course.name)
  const [description, setDescription] = useState(course.description ?? '')
  const [coverUrl, setCoverUrl] = useState(course.cover_url ?? '')
  const [productId, setProductId] = useState(course.product_id ?? '')
  const [certificateEnabled, setCertificateEnabled] = useState(course.certificate_enabled)
  const [pointsEnabled, setPointsEnabled] = useState(course.points_system_enabled)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await supabase.from('courses').update({
      name, description: description || null, cover_url: coverUrl || null,
      product_id: productId || null,
      certificate_enabled: certificateEnabled,
      points_system_enabled: pointsEnabled,
    }).eq('id', course.id)
    setSaving(false)
    onUpdate()
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5 max-w-2xl">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Название курса</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Описание</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] resize-none" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Обложка (URL)</label>
        <input type="text" value={coverUrl} onChange={e => setCoverUrl(e.target.value)} placeholder="https://…"
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Привязан к продукту</label>
        <select value={productId} onChange={e => setProductId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
          <option value="">— без продукта —</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" checked={certificateEnabled} onChange={e => setCertificateEnabled(e.target.checked)} className="w-4 h-4 accent-[#6A55F8]" />
        <span className="text-sm">🎓 Выдавать сертификат после сдачи экзамена</span>
      </label>
      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" checked={pointsEnabled} onChange={e => setPointsEnabled(e.target.checked)} className="w-4 h-4 accent-[#6A55F8]" />
        <span className="text-sm">⭐ Балльная система за задания</span>
      </label>
      <div className="pt-2">
        <button onClick={save} disabled={saving}
          className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40">
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}
