'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { AiAssistantButton, AiAssistantOverlay } from '@/components/ui/AiAssistant'
import { SkeletonList } from '@/components/ui/Skeleton'

type Course = { id: string; project_id: string; name: string; description: string | null; is_published: boolean; product_id: string | null; created_at: string; module_count?: number }
type Module = { id: string; course_id: string; name: string; order_position: number }
type Lesson = { id: string; module_id: string; name: string; content: string | null; video_url: string | null; has_homework: boolean; homework_description: string | null; order_position: number }

// ═══════════════════════════════════════
// LESSON EDITOR (блочный редактор урока)
// ═══════════════════════════════════════
function LessonEditor({ lesson, onBack, onUpdate }: { lesson: Lesson; onBack: () => void; onUpdate: () => void }) {
  const supabase = createClient()
  const [name, setName] = useState(lesson.name)
  const [content, setContent] = useState(lesson.content || '')
  const [videoUrl, setVideoUrl] = useState(lesson.video_url || '')
  const [hasHomework, setHasHomework] = useState(lesson.has_homework)
  const [hwDesc, setHwDesc] = useState(lesson.homework_description || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await supabase.from('course_lessons').update({
      name, content: content || null, video_url: videoUrl || null,
      has_homework: hasHomework, homework_description: hwDesc || null,
    }).eq('id', lesson.id)
    setSaving(false)
    onUpdate()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-800">← Назад к модулю</button>
          <h2 className="text-lg font-bold text-gray-900">Редактирование урока</h2>
        </div>
        <button onClick={save} disabled={saving} className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {saving ? 'Сохраняю...' : 'Сохранить'}
        </button>
      </div>

      <div className="space-y-4">
        {/* Name */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Название урока</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
        </div>

        {/* Video */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <label className="block text-xs font-medium text-gray-700 mb-1.5">🎬 Видео</label>
          <input type="text" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="Ссылка на видео (YouTube, Vimeo...)"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
          {videoUrl && (
            <div className="mt-3 bg-gray-900 rounded-lg h-48 flex items-center justify-center text-white text-sm">
              ▶ Превью видео: {videoUrl.slice(0, 50)}...
            </div>
          )}
        </div>

        {/* Content */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <label className="block text-xs font-medium text-gray-700 mb-1.5">📄 Текстовый контент</label>
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Описание, материалы, ссылки..."
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] h-40 resize-none" />
        </div>

        {/* Homework */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-medium text-gray-700">📝 Домашнее задание</label>
            <button onClick={() => setHasHomework(!hasHomework)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${hasHomework ? 'bg-[#6A55F8]' : 'bg-gray-200'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${hasHomework ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          {hasHomework && (
            <textarea value={hwDesc} onChange={e => setHwDesc(e.target.value)} placeholder="Описание задания..."
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] h-24 resize-none" />
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// MODULE DETAIL (уроки внутри модуля)
// ═══════════════════════════════════════
function ModuleDetail({ mod, courseId, onBack }: { mod: Module; courseId: string; onBack: () => void }) {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  const lessonId = searchParams.get('lesson')
  const editingLesson = lessonId ? lessons.find(l => l.id === lessonId) ?? null : null

  function selectLesson(id: string) {
    const p = new URLSearchParams(searchParams.toString())
    p.set('lesson', id)
    router.push(`?${p.toString()}`, { scroll: false })
  }
  function clearLesson() {
    const p = new URLSearchParams(searchParams.toString())
    p.delete('lesson')
    router.push(`?${p.toString()}`, { scroll: false })
  }

  async function loadLessons() {
    const { data } = await supabase.from('course_lessons').select('*').eq('module_id', mod.id).order('order_position')
    setLessons(data ?? [])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadLessons() }, [mod.id])

  async function addLesson() {
    if (!newName.trim()) return
    const tempLesson: Lesson = {
      id: 'temp-' + Date.now(),
      module_id: mod.id,
      name: newName.trim(),
      content: null,
      video_url: null,
      has_homework: false,
      homework_description: null,
      order_position: lessons.length,
    }
    setLessons(prev => [...prev, tempLesson])
    setNewName('')
    setAdding(false)
    const { data } = await supabase.from('course_lessons').insert({ module_id: mod.id, name: tempLesson.name, order_position: tempLesson.order_position }).select().single()
    if (data) {
      setLessons(prev => prev.map(l => l.id === tempLesson.id ? data as Lesson : l))
    }
  }

  async function deleteLesson(id: string) {
    setLessons(prev => prev.filter(l => l.id !== id))
    await supabase.from('course_lessons').delete().eq('id', id)
  }

  async function duplicateLesson(lesson: Lesson) {
    await supabase.from('course_lessons').insert({
      module_id: mod.id, name: `${lesson.name} (копия)`, content: lesson.content,
      video_url: lesson.video_url, has_homework: lesson.has_homework,
      homework_description: lesson.homework_description, order_position: lessons.length,
    })
    loadLessons()
  }

  if (editingLesson) {
    return <LessonEditor lesson={editingLesson} onBack={() => { clearLesson(); loadLessons() }} onUpdate={loadLessons} />
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-800">← Назад к курсу</button>
          <h2 className="text-lg font-bold text-gray-900">{mod.name}</h2>
          <span className="text-xs text-gray-400">{lessons.length} уроков</span>
        </div>
      </div>

      {loading ? (
        <SkeletonList count={3} />
      ) : (
        <div className="space-y-2">
          {lessons.map((lesson, idx) => (
            <div key={lesson.id} className="bg-white rounded-xl border border-gray-100 px-5 py-4 flex items-center justify-between hover:border-[#6A55F8]/30 transition-colors cursor-pointer group"
              onClick={() => selectLesson(lesson.id)}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8]">{idx + 1}</div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{lesson.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {lesson.video_url && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">🎬 Видео</span>}
                    {lesson.content && <span className="text-[10px] bg-gray-50 text-gray-500 px-1.5 py-0.5 rounded">📄 Текст</span>}
                    {lesson.has_homework && <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">📝 ДЗ</span>}
                    {!lesson.video_url && !lesson.content && !lesson.has_homework && <span className="text-[10px] text-gray-300">Пустой урок</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
                <button onClick={e => { e.stopPropagation(); duplicateLesson(lesson) }} className="text-xs text-gray-400 hover:text-[#6A55F8]" title="Дублировать">📋</button>
                <button onClick={e => { e.stopPropagation(); deleteLesson(lesson.id) }} className="text-xs text-gray-300 hover:text-red-500">✕</button>
                <span className="text-xs text-[#6A55F8]">Открыть →</span>
              </div>
            </div>
          ))}

          {adding ? (
            <div className="bg-white rounded-xl border border-[#6A55F8]/30 p-4 flex gap-2">
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addLesson()}
                placeholder="Название урока" autoFocus className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#6A55F8]" />
              <button onClick={addLesson} className="bg-[#6A55F8] text-white px-4 py-2 rounded-lg text-sm font-medium">Добавить</button>
              <button onClick={() => setAdding(false)} className="text-sm text-gray-500">Отмена</button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)}
              className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-[#6A55F8] hover:text-[#6A55F8] transition-colors">
              + Добавить урок
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════
// COURSE DETAIL (модули + продукт + настройки)
// ═══════════════════════════════════════
function CourseDetail({ course, onBack, onDeleted }: { course: Course; onBack: () => void; onDeleted?: (id: string) => void }) {
  const supabase = createClient()
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const projectId = params.id as string
  const [tab, setTab] = useState<'program' | 'product' | 'analytics' | 'settings'>('program')
  const [aiOpen, setAiOpen] = useState(false)
  const [modules, setModules] = useState<Module[]>([])
  const [loading, setLoading] = useState(true)
  const [addingModule, setAddingModule] = useState(false)
  const [newModuleName, setNewModuleName] = useState('')

  const moduleId = searchParams.get('module')
  const selectedModule = moduleId ? modules.find(m => m.id === moduleId) ?? null : null

  function selectModule(id: string) {
    const p = new URLSearchParams(searchParams.toString())
    p.set('module', id)
    p.delete('lesson')
    router.push(`?${p.toString()}`, { scroll: false })
  }
  function clearModule() {
    const p = new URLSearchParams(searchParams.toString())
    p.delete('module')
    p.delete('lesson')
    router.push(`?${p.toString()}`, { scroll: false })
  }

  // Product link state
  const [products, setProducts] = useState<{id: string; name: string}[]>([])
  const [linkedProductId, setLinkedProductId] = useState<string>(course.product_id || '')
  const [tariffs, setTariffs] = useState<{id: string; name: string; price: number}[]>([])
  const [creatingProduct, setCreatingProduct] = useState(false)
  const [newProductName, setNewProductName] = useState('')

  // Settings
  const [courseName, setCourseName] = useState(course.name)
  const [courseDesc, setCourseDesc] = useState(course.description || '')
  const [published, setPublished] = useState(course.is_published ?? false)

  async function loadModules() {
    const { data } = await supabase.from('course_modules').select('*').eq('course_id', course.id).order('order_position')
    setModules(data ?? [])
    setLoading(false)
  }

  async function loadProducts() {
    const { data } = await supabase.from('products').select('id, name').eq('project_id', projectId)
    setProducts(data ?? [])
  }

  async function loadTariffs(productId: string) {
    const { data } = await supabase.from('tariffs').select('id, name, price').eq('product_id', productId)
    setTariffs(data ?? [])
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadModules(); loadProducts() }, [course.id])

  useEffect(() => { if (linkedProductId) loadTariffs(linkedProductId) }, [linkedProductId])

  async function addModule() {
    if (!newModuleName.trim()) return
    const tempModule: Module = {
      id: 'temp-' + Date.now(),
      course_id: course.id,
      name: newModuleName.trim(),
      order_position: modules.length,
    }
    setModules(prev => [...prev, tempModule])
    setNewModuleName('')
    setAddingModule(false)
    const { data } = await supabase.from('course_modules').insert({ course_id: course.id, name: tempModule.name, order_position: tempModule.order_position }).select().single()
    if (data) {
      setModules(prev => prev.map(m => m.id === tempModule.id ? data as Module : m))
    }
  }

  async function deleteModule(id: string) {
    setModules(prev => prev.filter(m => m.id !== id))
    await supabase.from('course_modules').delete().eq('id', id)
  }

  async function duplicateModule(mod: Module) {
    // Create module copy
    const { data: newMod } = await supabase.from('course_modules').insert({
      course_id: course.id, name: `${mod.name} (копия)`, order_position: modules.length,
    }).select().single()
    if (newMod) {
      // Copy lessons
      const { data: lessons } = await supabase.from('course_lessons').select('*').eq('module_id', mod.id)
      if (lessons && lessons.length > 0) {
        await supabase.from('course_lessons').insert(
          lessons.map((l: Record<string, unknown>, i: number) => ({
            module_id: newMod.id, name: l.name, content: l.content, video_url: l.video_url,
            has_homework: l.has_homework, homework_description: l.homework_description, order_position: i,
          }))
        )
      }
    }
    loadModules()
  }

  async function createProductForCourse() {
    if (!newProductName.trim()) return
    const { data } = await supabase.from('products').insert({ project_id: projectId, name: newProductName.trim() }).select().single()
    if (data) {
      setLinkedProductId(data.id)
      await supabase.from('courses').update({ product_id: data.id }).eq('id', course.id)
      loadProducts()
      // Create default tariffs in background
      supabase.from('tariffs').insert([
        { product_id: data.id, name: 'Базовый', price: 2990, features: ['Доступ к курсу', 'Видеозаписи'], order_position: 0 },
        { product_id: data.id, name: 'Стандарт', price: 29900, features: ['Доступ к курсу', 'Куратор', 'Обратная связь'], order_position: 1 },
      ]).then(() => loadTariffs(data.id))
    }
    setNewProductName('')
    setCreatingProduct(false)
  }

  async function saveCourseSettings() {
    await supabase.from('courses').update({ name: courseName, description: courseDesc || null, is_published: published }).eq('id', course.id)
  }

  const [confirmDeleteCourse, setConfirmDeleteCourse] = useState(false)

  async function deleteCourse() {
    if (onDeleted) onDeleted(course.id) // instant remove from list
    onBack() // instant navigate back
    supabase.from('courses').delete().eq('id', course.id) // background
  }

  async function duplicateCourse() {
    const { data: newCourse } = await supabase.from('courses').insert({
      project_id: projectId, name: `${course.name} (копия)`, description: course.description,
    }).select().single()
    if (newCourse) {
      // Copy modules with lessons
      for (const mod of modules) {
        const { data: newMod } = await supabase.from('course_modules').insert({
          course_id: newCourse.id, name: mod.name, order_position: mod.order_position,
        }).select().single()
        if (newMod) {
          const { data: lessons } = await supabase.from('course_lessons').select('*').eq('module_id', mod.id)
          if (lessons && lessons.length > 0) {
            await supabase.from('course_lessons').insert(
              lessons.map((l: Record<string, unknown>, i: number) => ({
                module_id: newMod.id, name: l.name, content: l.content, video_url: l.video_url,
                has_homework: l.has_homework, homework_description: l.homework_description, order_position: i,
              }))
            )
          }
        }
      }
      onBack()
    }
  }

  if (selectedModule) {
    return <ModuleDetail mod={selectedModule} courseId={course.id} onBack={() => { clearModule(); loadModules() }} />
  }

  const tabs = [
    { key: 'program' as const, label: 'Программа' },
    { key: 'product' as const, label: 'Продукт и тарифы' },
    { key: 'analytics' as const, label: 'Аналитика' },
    { key: 'settings' as const, label: 'Настройки' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-800">← Назад</button>
          <div className="w-9 h-9 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-lg">🎓</div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{course.name}</h1>
            <p className="text-xs text-gray-500">{modules.length} модулей</p>
          </div>
        </div>
        <AiAssistantButton isOpen={aiOpen} onClick={() => setAiOpen(!aiOpen)} />
      </div>

      <div className="flex gap-1 border-b border-gray-100">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === t.key ? 'border-[#6A55F8] text-[#6A55F8]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: Программа */}
      {tab === 'program' && (
        <div className="space-y-3">
          {loading ? <SkeletonList count={3} /> : (
            <>
              {modules.map((mod, idx) => (
                <div key={mod.id} className="bg-white rounded-xl border border-gray-100 px-5 py-4 flex items-center justify-between hover:border-[#6A55F8]/30 transition-colors cursor-pointer group"
                  onClick={() => selectModule(mod.id)}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#6A55F8] flex items-center justify-center text-sm font-bold text-white">{idx + 1}</div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{mod.name}</p>
                      <p className="text-xs text-gray-400">Кликните чтобы настроить уроки</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#6A55F8] opacity-0 group-hover:opacity-100">Открыть →</span>
                    <button onClick={e => { e.stopPropagation(); duplicateModule(mod) }} className="text-xs text-gray-400 hover:text-[#6A55F8] opacity-0 group-hover:opacity-100" title="Дублировать">📋</button>
                    <button onClick={e => { e.stopPropagation(); deleteModule(mod.id) }} className="text-xs text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100">✕</button>
                  </div>
                </div>
              ))}

              {addingModule ? (
                <div className="bg-white rounded-xl border border-[#6A55F8]/30 p-4 flex gap-2">
                  <input type="text" value={newModuleName} onChange={e => setNewModuleName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addModule()}
                    placeholder="Название модуля" autoFocus className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#6A55F8]" />
                  <button onClick={addModule} className="bg-[#6A55F8] text-white px-4 py-2 rounded-lg text-sm font-medium">Добавить</button>
                  <button onClick={() => setAddingModule(false)} className="text-sm text-gray-500">Отмена</button>
                </div>
              ) : (
                <button onClick={() => setAddingModule(true)}
                  className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-[#6A55F8] hover:text-[#6A55F8] transition-colors">
                  + Добавить модуль
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB: Продукт и тарифы */}
      {tab === 'product' && (
        <div className="max-w-2xl space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Привязка к продукту</h3>
            <p className="text-xs text-gray-500 mb-3">Выберите существующий продукт или создайте новый. После оплаты тарифа клиент получит доступ к этому курсу.</p>

            <select value={linkedProductId} onChange={async e => {
              const val = e.target.value
              setLinkedProductId(val)
              await supabase.from('courses').update({ product_id: val || null }).eq('id', course.id)
            }}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] mb-3">
              <option value="">Не привязан к продукту</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            {!linkedProductId && !creatingProduct && (
              <button onClick={() => setCreatingProduct(true)} className="text-xs text-[#6A55F8] font-medium hover:underline">
                + Создать новый продукт для этого курса
              </button>
            )}

            {creatingProduct && (
              <div className="bg-[#F8F7FF] rounded-lg p-4 space-y-3 border border-[#6A55F8]/10">
                <p className="text-xs font-medium text-[#6A55F8]">Новый продукт</p>
                <input type="text" value={newProductName} onChange={e => setNewProductName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createProductForCourse()}
                  placeholder="Название продукта" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
                <p className="text-[10px] text-gray-400">Будут созданы 2 тарифа по умолчанию (Базовый и Стандарт), которые можно изменить</p>
                <div className="flex gap-2">
                  <button onClick={createProductForCourse} className="bg-[#6A55F8] text-white px-4 py-2 rounded-lg text-sm font-medium">Создать</button>
                  <button onClick={() => setCreatingProduct(false)} className="text-sm text-gray-500">Отмена</button>
                </div>
              </div>
            )}
          </div>

          {linkedProductId && tariffs.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Тарифы</h3>
              <div className="space-y-2">
                {tariffs.map(t => (
                  <div key={t.id} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{t.name}</p>
                    </div>
                    <span className="text-sm font-bold text-[#6A55F8]">{t.price.toLocaleString('ru')} ₽</span>
                  </div>
                ))}
              </div>
              <a href={`/project/${projectId}/products?open=${linkedProductId}`}
                className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#6A55F8] font-medium border border-[#6A55F8]/30 rounded-lg px-3 py-2 hover:bg-[#F0EDFF] transition-colors">
                📦 Перейти в продукт для настройки тарифов →
              </a>
            </div>
          )}
        </div>
      )}

      {/* TAB: Аналитика */}
      {tab === 'analytics' && (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
          Аналитика появится когда студенты начнут проходить курс
        </div>
      )}

      {/* TAB: Настройки */}
      {tab === 'settings' && (
        <div className="max-w-2xl space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Название курса</label>
              <input type="text" value={courseName} onChange={e => setCourseName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Описание</label>
              <textarea value={courseDesc} onChange={e => setCourseDesc(e.target.value)} placeholder="О чём этот курс..."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] h-24 resize-none" />
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-gray-800">Опубликован</p>
                <p className="text-xs text-gray-500">Студенты смогут видеть курс</p>
              </div>
              <button onClick={() => setPublished(!published)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${published ? 'bg-[#6A55F8]' : 'bg-gray-200'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${published ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <button onClick={saveCourseSettings} className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium">Сохранить</button>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Дублировать курс</h3>
            <p className="text-xs text-gray-500 mb-3">Создаст копию курса со всеми модулями и уроками.</p>
            <button onClick={duplicateCourse} className="px-4 py-2 rounded-lg text-sm font-medium text-[#6A55F8] border border-[#6A55F8]/30 hover:bg-[#F0EDFF]">
              📋 Дублировать курс
            </button>
          </div>
          <div className="bg-white rounded-xl border border-red-100 p-5">
            <h3 className="text-sm font-semibold text-red-600 mb-2">Опасная зона</h3>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700">Удалить курс и все модули/уроки</p>
              {!confirmDeleteCourse ? (
                <button onClick={() => setConfirmDeleteCourse(true)} className="px-3 py-1.5 rounded-lg border border-red-300 text-sm text-red-600 hover:bg-red-50">Удалить</button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={deleteCourse} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">Да, удалить</button>
                  <button onClick={() => setConfirmDeleteCourse(false)} className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-50">Отмена</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <AiAssistantOverlay isOpen={aiOpen} onClose={() => setAiOpen(false)} title="AI-помощник курса"
        placeholder="Описать программу курса..."
        initialMessages={[{ from: 'ai' as const, text: 'Привет! Опиши курс — я создам модули, уроки и тарифы.' }]} />
    </div>
  )
}

// ═══════════════════════════════════════
// COURSE LIST
// ═══════════════════════════════════════
export default function LearningPage() {
  const supabase = createClient()
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const projectId = params.id as string
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  const openCourseId = searchParams.get('open')
  const selected = openCourseId ? courses.find(c => c.id === openCourseId) ?? null : null

  function selectCourse(id: string) {
    const p = new URLSearchParams(searchParams.toString())
    p.set('open', id)
    router.push(`?${p.toString()}`, { scroll: false })
  }
  function clearSelection() {
    const p = new URLSearchParams(searchParams.toString())
    p.delete('open')
    p.delete('module')
    p.delete('lesson')
    router.push(`?${p.toString()}`, { scroll: false })
  }

  async function load() {
    const { data } = await supabase.from('courses').select('*').eq('project_id', projectId).order('created_at')
    if (data) {
      const { data: allModules } = await supabase.from('course_modules').select('course_id').in('course_id', data.map(c => c.id))
      const moduleCounts: Record<string, number> = {}
      for (const m of (allModules ?? []) as { course_id: string }[]) {
        moduleCounts[m.course_id] = (moduleCounts[m.course_id] ?? 0) + 1
      }
      const withCounts = data.map(c => ({ ...c, module_count: moduleCounts[c.id] ?? 0 }))
      setCourses(withCounts)
    }
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [projectId])

  async function createCourse() {
    if (!newName.trim()) return
    const tempCourse: Course = {
      id: 'temp-' + Date.now(),
      project_id: projectId,
      name: newName.trim(),
      description: null,
      is_published: false,
      product_id: null,
      created_at: new Date().toISOString(),
      module_count: 0,
    }
    setCourses(prev => [...prev, tempCourse])
    setNewName('')
    setAdding(false)
    const { data } = await supabase.from('courses').insert({ project_id: projectId, name: tempCourse.name }).select().single()
    if (data) {
      setCourses(prev => prev.map(c => c.id === tempCourse.id ? { ...data, module_count: 0 } : c))
      selectCourse(data.id)
    }
  }

  if (selected) {
    return <CourseDetail course={selected} onBack={() => { clearSelection() }} onDeleted={(id) => setCourses(prev => prev.filter(c => c.id !== id))} />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Обучение</h1>
          <p className="text-sm text-gray-500">Курсы и учебные материалы</p>
        </div>
        <button onClick={() => setAdding(true)} className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium">+ Создать курс</button>
      </div>

      {adding && (
        <div className="bg-white rounded-xl border border-[#6A55F8]/30 p-4 shadow-sm flex gap-2">
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createCourse()}
            placeholder="Название курса" autoFocus className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#6A55F8]" />
          <button onClick={createCourse} className="bg-[#6A55F8] text-white px-4 py-2 rounded-lg text-sm font-medium">Создать</button>
          <button onClick={() => setAdding(false)} className="text-sm text-gray-500">Отмена</button>
        </div>
      )}

      {loading ? (
        <SkeletonList count={3} />
      ) : courses.length === 0 && !adding ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-4">📚</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Нет курсов</h3>
          <p className="text-sm text-gray-500">Создайте первый курс</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {courses.map(course => (
            <button key={course.id} onClick={() => selectCourse(course.id)}
              className="bg-white rounded-xl border border-gray-100 p-5 text-left hover:border-[#6A55F8]/30 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-gray-900">{course.name}</h3>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${course.is_published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {course.is_published ? 'Опубликован' : 'Черновик'}
                </span>
              </div>
              {course.description && <p className="text-sm text-gray-500 mb-2 line-clamp-2">{course.description}</p>}
              <p className="text-xs text-gray-400">{course.module_count} модулей</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
