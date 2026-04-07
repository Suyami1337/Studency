'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { AiAssistantButton, AiAssistantOverlay } from '@/components/ui/AiAssistant'

const supabase = createClient()

type Course = {
  id: string
  project_id: string
  name: string
  description: string | null
  is_published: boolean
  created_at: string
  module_count?: number
}

type Module = {
  id: string
  course_id: string
  name: string
  order_position: number
  lessons?: Lesson[]
  expanded?: boolean
}

type Lesson = {
  id: string
  module_id: string
  name: string
  content: string | null
  video_url: string | null
  has_homework: boolean
  homework_description: string | null
  order_position: number
}

type ModuleStats = {
  module_id: string
  module_name: string
  total: number
  completed: number
}

// ───────── List view ─────────

function CourseList({ projectId }: { projectId: string }) {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<Course | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [projectId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('courses')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at')
    if (data) {
      const withCounts = await Promise.all(
        data.map(async (c) => {
          const { count } = await supabase
            .from('course_modules')
            .select('*', { count: 'exact', head: true })
            .eq('course_id', c.id)
          return { ...c, module_count: count ?? 0 }
        })
      )
      setCourses(withCounts)
    }
    setLoading(false)
  }

  async function createCourse() {
    if (!newName.trim()) return
    setSaving(true)
    const { data } = await supabase
      .from('courses')
      .insert({ project_id: projectId, name: newName.trim(), is_published: false })
      .select()
      .single()
    if (data) setCourses(prev => [...prev, { ...data, module_count: 0 }])
    setNewName('')
    setAdding(false)
    setSaving(false)
  }

  if (selected) {
    return <CourseDetail course={selected} onBack={() => { setSelected(null); load() }} />
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Учебная платформа</h1>
          <p className="text-sm text-gray-500 mt-0.5">Курсы и учебные материалы</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Создать курс
        </button>
      </div>

      {adding && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4 shadow-sm">
          <p className="text-sm font-medium text-gray-700 mb-2">Название курса</p>
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createCourse()}
              placeholder="Например: Курс по маркетингу"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10"
            />
            <button
              onClick={createCourse}
              disabled={saving}
              className="bg-[#6A55F8] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {saving ? '...' : 'Создать'}
            </button>
            <button onClick={() => { setAdding(false); setNewName('') }} className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm">Отмена</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Загрузка курсов...</div>
      ) : courses.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">📚</div>
          <p className="text-gray-500 font-medium">Ещё нет курсов</p>
          <p className="text-gray-400 text-sm mt-1">Создайте первый курс, чтобы начать</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map(course => (
            <div
              key={course.id}
              onClick={() => setSelected(course)}
              className="bg-white rounded-xl border border-gray-100 p-5 cursor-pointer hover:shadow-md hover:border-[#6A55F8]/20 transition-all"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-gray-900 text-base leading-tight">{course.name}</h3>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${
                  course.is_published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {course.is_published ? 'Опубликован' : 'Черновик'}
                </span>
              </div>
              {course.description && (
                <p className="text-sm text-gray-500 mb-3 line-clamp-2">{course.description}</p>
              )}
              <p className="text-xs text-gray-400">{course.module_count} модул{course.module_count === 1 ? 'ь' : course.module_count && course.module_count < 5 ? 'я' : 'ей'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ───────── Course detail ─────────

function CourseDetail({ course, onBack }: { course: Course; onBack: () => void }) {
  const [tab, setTab] = useState<'program' | 'analytics' | 'settings'>('program')
  const [aiOpen, setAiOpen] = useState(false)

  const tabs = [
    { key: 'program' as const, label: 'Программа' },
    { key: 'analytics' as const, label: 'Аналитика' },
    { key: 'settings' as const, label: 'Настройки' },
  ]

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-700 transition-colors">
          ← Назад
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{course.name}</h1>
        </div>
        <AiAssistantButton isOpen={aiOpen} onClick={() => setAiOpen(!aiOpen)} />
      </div>

      <div className="flex gap-1 border-b border-gray-100 mb-6">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-[#6A55F8] text-[#6A55F8]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'program' && <ProgramTab courseId={course.id} />}
      {tab === 'analytics' && <AnalyticsTab courseId={course.id} />}
      {tab === 'settings' && <SettingsTab course={course} onDelete={onBack} onUpdate={() => {}} />}

      <AiAssistantOverlay
        isOpen={aiOpen}
        onClose={() => setAiOpen(false)}
        title="AI-помощник по курсу"
        placeholder="Спросить про курс..."
        initialMessages={[{ from: 'ai', text: `Помогу с курсом "${course.name}". Чем могу помочь?` }]}
      />
    </div>
  )
}

// ───────── Program tab ─────────

function ProgramTab({ courseId }: { courseId: string }) {
  const [modules, setModules] = useState<Module[]>([])
  const [loading, setLoading] = useState(true)
  const [addingModule, setAddingModule] = useState(false)
  const [newModuleName, setNewModuleName] = useState('')
  const [savingModule, setSavingModule] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadModules() }, [courseId])

  async function loadModules() {
    setLoading(true)
    const { data } = await supabase
      .from('course_modules')
      .select('*')
      .eq('course_id', courseId)
      .order('order_position')
    setModules((data ?? []).map(m => ({ ...m, lessons: [], expanded: false })))
    setLoading(false)
  }

  async function toggleModule(mod: Module) {
    if (!mod.expanded) {
      const { data } = await supabase
        .from('course_lessons')
        .select('*')
        .eq('module_id', mod.id)
        .order('order_position')
      setModules(prev => prev.map(m => m.id === mod.id ? { ...m, expanded: true, lessons: data ?? [] } : m))
    } else {
      setModules(prev => prev.map(m => m.id === mod.id ? { ...m, expanded: false } : m))
    }
  }

  async function addModule() {
    if (!newModuleName.trim()) return
    setSavingModule(true)
    const position = modules.length + 1
    const { data } = await supabase
      .from('course_modules')
      .insert({ course_id: courseId, name: newModuleName.trim(), order_position: position })
      .select()
      .single()
    if (data) setModules(prev => [...prev, { ...data, lessons: [], expanded: false }])
    setNewModuleName('')
    setAddingModule(false)
    setSavingModule(false)
  }

  async function deleteModule(moduleId: string) {
    await supabase.from('course_modules').delete().eq('id', moduleId)
    setModules(prev => prev.filter(m => m.id !== moduleId))
  }

  async function addLesson(moduleId: string, name: string) {
    const mod = modules.find(m => m.id === moduleId)
    const position = (mod?.lessons?.length ?? 0) + 1
    const { data } = await supabase
      .from('course_lessons')
      .insert({ module_id: moduleId, name, order_position: position, has_homework: false })
      .select()
      .single()
    if (data) {
      setModules(prev => prev.map(m =>
        m.id === moduleId ? { ...m, lessons: [...(m.lessons ?? []), data] } : m
      ))
    }
  }

  async function updateLesson(lessonId: string, moduleId: string, fields: Partial<Lesson>) {
    await supabase.from('course_lessons').update(fields).eq('id', lessonId)
    setModules(prev => prev.map(m =>
      m.id === moduleId
        ? { ...m, lessons: (m.lessons ?? []).map(l => l.id === lessonId ? { ...l, ...fields } : l) }
        : m
    ))
  }

  async function deleteLesson(lessonId: string, moduleId: string) {
    await supabase.from('course_lessons').delete().eq('id', lessonId)
    setModules(prev => prev.map(m =>
      m.id === moduleId ? { ...m, lessons: (m.lessons ?? []).filter(l => l.id !== lessonId) } : m
    ))
  }

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Загрузка программы...</div>

  return (
    <div>
      <div className="space-y-3 mb-4">
        {modules.length === 0 && !addingModule && (
          <div className="text-center py-10">
            <div className="text-4xl mb-2">📂</div>
            <p className="text-gray-500 text-sm">Нет модулей. Добавьте первый!</p>
          </div>
        )}
        {modules.map((mod, idx) => (
          <ModuleRow
            key={mod.id}
            mod={mod}
            idx={idx}
            onToggle={() => toggleModule(mod)}
            onDelete={() => deleteModule(mod.id)}
            onAddLesson={(name) => addLesson(mod.id, name)}
            onUpdateLesson={(lessonId, fields) => updateLesson(lessonId, mod.id, fields)}
            onDeleteLesson={(lessonId) => deleteLesson(lessonId, mod.id)}
          />
        ))}
      </div>

      {addingModule && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-3">
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              value={newModuleName}
              onChange={e => setNewModuleName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addModule()}
              placeholder="Название модуля"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#6A55F8]"
            />
            <button onClick={addModule} disabled={savingModule} className="bg-[#6A55F8] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
              {savingModule ? '...' : 'Добавить'}
            </button>
            <button onClick={() => { setAddingModule(false); setNewModuleName('') }} className="text-gray-500 text-sm px-2">Отмена</button>
          </div>
        </div>
      )}

      <button
        onClick={() => setAddingModule(true)}
        className="border border-dashed border-[#6A55F8] text-[#6A55F8] hover:bg-[#F0EDFF] px-4 py-2.5 rounded-xl text-sm font-medium transition-colors w-full"
      >
        + Добавить модуль
      </button>
    </div>
  )
}

function ModuleRow({
  mod, idx, onToggle, onDelete, onAddLesson, onUpdateLesson, onDeleteLesson,
}: {
  mod: Module
  idx: number
  onToggle: () => void
  onDelete: () => void
  onAddLesson: (name: string) => void
  onUpdateLesson: (lessonId: string, fields: Partial<Lesson>) => void
  onDeleteLesson: (lessonId: string) => void
}) {
  const [addingLesson, setAddingLesson] = useState(false)
  const [newLessonName, setNewLessonName] = useState('')

  function handleAddLesson() {
    if (!newLessonName.trim()) return
    onAddLesson(newLessonName.trim())
    setNewLessonName('')
    setAddingLesson(false)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={onToggle} className="text-gray-400 hover:text-gray-600 transition-colors text-sm w-5">
          {mod.expanded ? '▾' : '▸'}
        </button>
        <span className="text-xs font-medium text-gray-400 w-5">{idx + 1}</span>
        <span className="flex-1 font-medium text-gray-800 text-sm">{mod.name}</span>
        <button onClick={onDelete} className="text-gray-300 hover:text-red-400 transition-colors text-xs">✕</button>
      </div>

      {mod.expanded && (
        <div className="border-t border-gray-50 px-4 pb-3">
          {(mod.lessons ?? []).length === 0 && !addingLesson && (
            <p className="text-xs text-gray-400 py-2">Нет уроков</p>
          )}
          <div className="space-y-1 mt-2">
            {(mod.lessons ?? []).map((lesson, li) => (
              <LessonRow
                key={lesson.id}
                lesson={lesson}
                idx={li}
                onUpdate={(fields) => onUpdateLesson(lesson.id, fields)}
                onDelete={() => onDeleteLesson(lesson.id)}
              />
            ))}
          </div>

          {addingLesson && (
            <div className="flex gap-2 mt-2">
              <input
                autoFocus
                type="text"
                value={newLessonName}
                onChange={e => setNewLessonName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddLesson()}
                placeholder="Название урока"
                className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#6A55F8]"
              />
              <button onClick={handleAddLesson} className="bg-[#6A55F8] text-white px-3 py-1.5 rounded-lg text-xs font-medium">Добавить</button>
              <button onClick={() => { setAddingLesson(false); setNewLessonName('') }} className="text-gray-400 text-xs">Отмена</button>
            </div>
          )}

          <button
            onClick={() => setAddingLesson(true)}
            className="mt-2 text-xs text-[#6A55F8] hover:underline"
          >
            + Добавить урок
          </button>
        </div>
      )}
    </div>
  )
}

function LessonRow({ lesson, idx, onUpdate, onDelete }: {
  lesson: Lesson
  idx: number
  onUpdate: (fields: Partial<Lesson>) => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [name, setName] = useState(lesson.name)
  const [content, setContent] = useState(lesson.content ?? '')
  const [videoUrl, setVideoUrl] = useState(lesson.video_url ?? '')
  const [hasHomework, setHasHomework] = useState(lesson.has_homework)
  const [homeworkDesc, setHomeworkDesc] = useState(lesson.homework_description ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    onUpdate({
      name,
      content: content || null,
      video_url: videoUrl || null,
      has_homework: hasHomework,
      homework_description: hasHomework ? homeworkDesc || null : null,
    })
    setSaving(false)
    setExpanded(false)
  }

  return (
    <div className="rounded-lg border border-gray-50 hover:border-gray-200 transition-colors">
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <span className="text-xs text-gray-400 w-4">{idx + 1}</span>
        <span className="flex-1 text-sm text-gray-700">{lesson.name}</span>
        <div className="flex items-center gap-1">
          {lesson.video_url && <span title="Видео">🎬</span>}
          {lesson.has_homework && <span title="Домашнее задание">📝</span>}
        </div>
        <button onClick={e => { e.stopPropagation(); onDelete() }} className="text-gray-300 hover:text-red-400 text-xs ml-1">✕</button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-gray-50 pt-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Название урока</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#6A55F8]"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Контент</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={3}
              placeholder="Описание урока, текстовый контент..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#6A55F8] resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">🎬 Ссылка на видео</label>
            <input
              type="text"
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#6A55F8]"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasHomework}
                onChange={e => setHasHomework(e.target.checked)}
                className="w-4 h-4 accent-[#6A55F8]"
              />
              <span className="text-xs font-medium text-gray-600">📝 Есть домашнее задание</span>
            </label>
            {hasHomework && (
              <textarea
                value={homeworkDesc}
                onChange={e => setHomeworkDesc(e.target.value)}
                rows={2}
                placeholder="Описание домашнего задания..."
                className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#6A55F8] resize-none"
              />
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="bg-[#6A55F8] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </button>
            <button onClick={() => setExpanded(false)} className="text-gray-500 text-sm px-3 py-2">Отмена</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ───────── Analytics tab ─────────

function AnalyticsTab({ courseId }: { courseId: string }) {
  const [totalStudents, setTotalStudents] = useState<number>(0)
  const [moduleStats, setModuleStats] = useState<ModuleStats[]>([])
  const [loading, setLoading] = useState(true)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [courseId])

  async function load() {
    setLoading(true)

    const { data: modules } = await supabase
      .from('course_modules')
      .select('id, name')
      .eq('course_id', courseId)
      .order('order_position')

    if (!modules || modules.length === 0) {
      setLoading(false)
      return
    }

    const moduleIds = modules.map(m => m.id)

    const { data: lessons } = await supabase
      .from('course_lessons')
      .select('id, module_id')
      .in('module_id', moduleIds)

    const lessonIds = (lessons ?? []).map(l => l.id)

    let studentCount = 0
    const stats: ModuleStats[] = []

    if (lessonIds.length > 0) {
      const { data: progress } = await supabase
        .from('student_progress')
        .select('customer_id, lesson_id, completed')
        .in('lesson_id', lessonIds)

      const distinctCustomers = new Set((progress ?? []).map(p => p.customer_id))
      studentCount = distinctCustomers.size

      for (const mod of modules) {
        const modLessons = (lessons ?? []).filter(l => l.module_id === mod.id)
        const total = modLessons.length
        const modLessonIds = modLessons.map(l => l.id)
        const completed = (progress ?? []).filter(p => modLessonIds.includes(p.lesson_id) && p.completed).length
        stats.push({ module_id: mod.id, module_name: mod.name, total, completed })
      }
    } else {
      for (const mod of modules) {
        stats.push({ module_id: mod.id, module_name: mod.name, total: 0, completed: 0 })
      }
    }

    setTotalStudents(studentCount)
    setModuleStats(stats)
    setLoading(false)
  }

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Загрузка аналитики...</div>

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <p className="text-xs text-gray-500 mb-1">Всего студентов</p>
        <p className="text-3xl font-bold text-gray-900">{totalStudents}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <p className="text-sm font-semibold text-gray-700 mb-4">Прохождение по модулям</p>
        {moduleStats.length === 0 ? (
          <p className="text-sm text-gray-400">Нет модулей</p>
        ) : (
          <div className="space-y-4">
            {moduleStats.map(stat => {
              const pct = stat.total > 0 ? Math.round((stat.completed / stat.total) * 100) : 0
              return (
                <div key={stat.module_id}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-gray-700">{stat.module_name}</span>
                    <span className="text-xs text-gray-500">{stat.completed}/{stat.total} уроков • {pct}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-2 bg-[#6A55F8] rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ───────── Settings tab ─────────

function SettingsTab({ course, onDelete, onUpdate }: {
  course: Course
  onDelete: () => void
  onUpdate: (updated: Course) => void
}) {
  const [name, setName] = useState(course.name)
  const [description, setDescription] = useState(course.description ?? '')
  const [published, setPublished] = useState(course.is_published ?? false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function save() {
    setSaving(true)
    await supabase
      .from('courses')
      .update({ name, description: description || null, is_published: published })
      .eq('id', course.id)
    onUpdate({ ...course, name, description: description || null, is_published: published })
    setSaving(false)
  }

  async function deleteCourse() {
    setDeleting(true)
    await supabase.from('courses').delete().eq('id', course.id)
    onDelete()
  }

  return (
    <div className="max-w-xl space-y-5">
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <p className="text-sm font-semibold text-gray-700">Основная информация</p>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Название курса</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#6A55F8]"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Описание</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#6A55F8] resize-none"
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Опубликован</p>
            <p className="text-xs text-gray-400">Виден студентам</p>
          </div>
          <button
            onClick={() => setPublished(!published)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${published ? 'bg-[#6A55F8]' : 'bg-gray-200'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${published ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? 'Сохраняем...' : 'Сохранить'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-red-100 p-5">
        <p className="text-sm font-semibold text-red-600 mb-2">Опасная зона</p>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="border border-red-200 text-red-500 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Удалить курс
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-red-500">Вы уверены? Это действие нельзя отменить.</p>
            <div className="flex gap-2">
              <button
                onClick={deleteCourse}
                disabled={deleting}
                className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {deleting ? 'Удаляем...' : 'Да, удалить'}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-gray-500 text-sm px-3 py-2">Отмена</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ───────── Root page ─────────

export default function LearningPage() {
  const params = useParams()
  const projectId = params.id as string

  return <CourseList projectId={projectId} />
}
