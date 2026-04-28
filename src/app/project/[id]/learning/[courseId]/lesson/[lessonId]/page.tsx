'use client'

// Phase 7.3 + 7.4 + 7.8 + 7.11 — Редактор урока:
// блоки (видео/текст/аудио/файлы/задание), задания и тесты,
// условия завершения, тарифные ограничения.

import { useEffect, useState, useCallback, DragEvent } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { SkeletonList } from '@/components/ui/Skeleton'
import RichTextEditor from '@/components/RichTextEditor'

type Lesson = {
  id: string
  course_id: string | null
  module_id: string | null
  name: string
  description: string | null
  cover_url: string | null
  is_bonus: boolean
  is_exam: boolean
  attempts_limit: number
  video_threshold: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  completion_rules: any
  hard_stop_on_failure: boolean
}

type Block = {
  id: string
  lesson_id: string
  type: 'video' | 'text' | 'audio' | 'files' | 'assignment'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any
  order_position: number
}

type Assignment = {
  id: string
  lesson_id: string
  type: 'open_text' | 'test_single' | 'test_multi' | 'test_open_text' | 'file_upload' | 'video_response'
  title: string
  description: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings: any
  is_required: boolean
  order_position: number
}

type Question = {
  id: string
  assignment_id: string
  type: 'single' | 'multi' | 'text'
  question_text: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: Array<{ id: string; text: string; is_correct: boolean }>
  correct_text: string | null
  correct_text_alts: string[]
  points: number
  order_position: number
}

type Tariff = { id: string; name: string }
type Video = { id: string; title: string; kinescope_id: string | null; duration_seconds: number | null }

export default function LessonEditorPage() {
  const params = useParams<{ id: string; courseId: string; lessonId: string }>()
  const router = useRouter()
  const projectId = params.id
  const courseId = params.courseId
  const lessonId = params.lessonId
  const supabase = createClient()

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [tariffs, setTariffs] = useState<Tariff[]>([])
  const [tariffAccess, setTariffAccess] = useState<string[]>([])
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'content' | 'completion' | 'access' | 'settings'>('content')

  // UI
  const [drag, setDrag] = useState<{ id: string } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null)
  const [showAddBlock, setShowAddBlock] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [l, b, a, t, v] = await Promise.all([
      supabase.from('course_lessons').select('*').eq('id', lessonId).single(),
      supabase.from('lesson_blocks').select('*').eq('lesson_id', lessonId).order('order_position'),
      supabase.from('lesson_assignments').select('*').eq('lesson_id', lessonId).order('order_position'),
      supabase.from('tariffs').select('id, name').eq('is_active', true),
      supabase.from('videos').select('id, title, kinescope_id, duration_seconds').eq('project_id', projectId).order('created_at', { ascending: false }),
    ])
    setLesson(l.data as Lesson | null)
    setBlocks((b.data as Block[]) ?? [])
    setAssignments((a.data as Assignment[]) ?? [])
    setTariffs((t.data as Tariff[]) ?? [])
    setVideos((v.data as Video[]) ?? [])

    const { data: ta } = await supabase.from('tariff_content_access').select('tariff_id').eq('node_type', 'lesson').eq('node_id', lessonId)
    setTariffAccess((ta ?? []).map(r => r.tariff_id))
    setLoading(false)
  }, [lessonId, projectId, supabase])

  useEffect(() => { load() }, [load])

  if (loading) return <SkeletonList />
  if (!lesson) return <div className="text-sm text-gray-500">Урок не найден</div>

  // ── CRUD блоков ───────────────────────────────────────────────────────
  async function addBlock(type: Block['type']) {
    const order = blocks.length
    const defaultContent: Record<Block['type'], object> = {
      video: { video_id: null, title: '' },
      text: { html: '' },
      audio: { video_id: null, title: '' },
      files: { items: [] },
      assignment: { assignment_id: null },
    }
    await supabase.from('lesson_blocks').insert({
      lesson_id: lessonId,
      type,
      content: defaultContent[type],
      order_position: order,
    })
    setShowAddBlock(false)
    load()
  }

  async function updateBlock(id: string, content: object) {
    await supabase.from('lesson_blocks').update({ content }).eq('id', id)
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, content } : b))
  }

  async function deleteBlock(id: string) {
    if (!confirm('Удалить блок?')) return
    await supabase.from('lesson_blocks').delete().eq('id', id)
    load()
  }

  async function reorderBlocks(draggedId: string, beforeId: string) {
    const filtered = blocks.filter(b => b.id !== draggedId)
    const idx = beforeId ? filtered.findIndex(b => b.id === beforeId) : filtered.length
    const dragged = blocks.find(b => b.id === draggedId)
    if (!dragged) return
    filtered.splice(idx, 0, dragged)
    for (let i = 0; i < filtered.length; i++) {
      await supabase.from('lesson_blocks').update({ order_position: i }).eq('id', filtered[i].id)
    }
    load()
  }

  // ── CRUD заданий ──────────────────────────────────────────────────────
  async function addAssignment(type: Assignment['type']) {
    const order = assignments.length
    const { data } = await supabase.from('lesson_assignments').insert({
      lesson_id: lessonId,
      type,
      title: assignmentTypeLabel(type),
      settings: {
        points_total: 0,
        attempts_limit: 0,
        deadline_type: 'none',
        passing_score: 0,
      },
      order_position: order,
    }).select().single()
    if (data) {
      // Также создать блок-ссылку на это задание чтобы оно появилось в потоке урока
      await supabase.from('lesson_blocks').insert({
        lesson_id: lessonId,
        type: 'assignment',
        content: { assignment_id: data.id },
        order_position: blocks.length,
      })
      setEditingAssignment(data as Assignment)
      load()
    }
  }

  async function deleteAssignment(id: string) {
    if (!confirm('Удалить задание?')) return
    await supabase.from('lesson_assignments').delete().eq('id', id)
    // Также удалить связанные блоки
    await supabase.from('lesson_blocks').delete().eq('lesson_id', lessonId).eq('content->>assignment_id', id)
    load()
  }

  // ── DnD ───────────────────────────────────────────────────────────────
  function onDragStart(e: DragEvent, id: string) {
    setDrag({ id })
    e.dataTransfer.effectAllowed = 'move'
  }
  function onDragOver(e: DragEvent, id: string) {
    e.preventDefault()
    setDropTarget(id)
  }
  async function onDrop(e: DragEvent, beforeId: string) {
    e.preventDefault()
    if (!drag) return
    setDropTarget(null)
    if (drag.id !== beforeId) await reorderBlocks(drag.id, beforeId)
    setDrag(null)
  }

  // ── Tariff access ─────────────────────────────────────────────────────
  async function saveTariffAccess(tariffIds: string[]) {
    await supabase.from('tariff_content_access').delete().eq('node_type', 'lesson').eq('node_id', lessonId)
    if (tariffIds.length > 0) {
      await supabase.from('tariff_content_access').insert(
        tariffIds.map(tid => ({ tariff_id: tid, node_type: 'lesson', node_id: lessonId }))
      )
    }
    setTariffAccess(tariffIds)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push(`/project/${projectId}/learning/${courseId}`)} className="text-sm text-gray-500 hover:text-gray-800">← К курсу</button>
        <input
          type="text"
          value={lesson.name}
          onChange={async e => {
            const v = e.target.value
            setLesson(l => l ? { ...l, name: v } : l)
            await supabase.from('course_lessons').update({ name: v }).eq('id', lessonId)
          }}
          className="text-xl font-bold text-gray-900 bg-transparent border-0 focus:outline-none focus:bg-gray-50 rounded px-2 -mx-2 flex-1"
        />
        {lesson.is_bonus && <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-1 rounded">Бонусный</span>}
        {lesson.is_exam && <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-1 rounded">🎓 Экзамен</span>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['content', 'completion', 'access', 'settings'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-[#6A55F8] text-[#6A55F8]' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t === 'content' && 'Содержание'}
            {t === 'completion' && 'Условия завершения'}
            {t === 'access' && 'Доступ'}
            {t === 'settings' && 'Настройки'}
          </button>
        ))}
      </div>

      {tab === 'content' && (
        <div className="space-y-3">
          {blocks.map(b => {
            const assign = b.type === 'assignment' ? assignments.find(a => a.id === b.content?.assignment_id) : null
            return (
              <div
                key={b.id}
                draggable
                onDragStart={e => onDragStart(e, b.id)}
                onDragOver={e => onDragOver(e, b.id)}
                onDragLeave={() => setDropTarget(null)}
                onDrop={e => onDrop(e, b.id)}
                className={`bg-white rounded-xl border transition-all ${
                  dropTarget === b.id ? 'border-[#6A55F8]' : 'border-gray-100'
                }`}
              >
                <BlockEditor
                  block={b}
                  assignment={assign ?? null}
                  videos={videos}
                  projectId={projectId}
                  onUpdate={c => updateBlock(b.id, c)}
                  onDelete={() => deleteBlock(b.id)}
                  onEditAssignment={() => assign && setEditingAssignment(assign)}
                />
              </div>
            )
          })}

          {/* Add block */}
          <div className="pt-2">
            {!showAddBlock ? (
              <button
                onClick={() => setShowAddBlock(true)}
                className="w-full py-3 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500 hover:border-[#6A55F8] hover:text-[#6A55F8]"
              >
                + Добавить блок
              </button>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-gray-700">Какой блок добавить?</div>
                  <button onClick={() => setShowAddBlock(false)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <button onClick={() => addBlock('video')} className="px-3 py-3 rounded-lg border border-gray-200 hover:border-[#6A55F8] text-sm text-left">
                    <div className="text-xl mb-1">🎬</div>
                    <div className="font-medium">Видео</div>
                    <div className="text-xs text-gray-500">Kinescope</div>
                  </button>
                  <button onClick={() => addBlock('text')} className="px-3 py-3 rounded-lg border border-gray-200 hover:border-[#6A55F8] text-sm text-left">
                    <div className="text-xl mb-1">📄</div>
                    <div className="font-medium">Текст</div>
                    <div className="text-xs text-gray-500">Rich-text редактор</div>
                  </button>
                  <button onClick={() => addBlock('audio')} className="px-3 py-3 rounded-lg border border-gray-200 hover:border-[#6A55F8] text-sm text-left">
                    <div className="text-xl mb-1">🎙</div>
                    <div className="font-medium">Аудио</div>
                    <div className="text-xs text-gray-500">Kinescope</div>
                  </button>
                  <button onClick={() => addBlock('files')} className="px-3 py-3 rounded-lg border border-gray-200 hover:border-[#6A55F8] text-sm text-left">
                    <div className="text-xl mb-1">📎</div>
                    <div className="font-medium">Файлы</div>
                    <div className="text-xs text-gray-500">Для скачивания</div>
                  </button>
                  <div className="md:col-span-2 border-t border-gray-100 mt-2 pt-2">
                    <div className="text-xs font-medium text-gray-500 mb-2">Задания</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => addAssignment('open_text')} className="px-3 py-2 rounded-lg border border-gray-200 hover:border-[#6A55F8] text-sm text-left">
                        <div className="font-medium">Открытое ДЗ</div>
                        <div className="text-xs text-gray-500">Текст ответа от ученика</div>
                      </button>
                      <button onClick={() => addAssignment('test_single')} className="px-3 py-2 rounded-lg border border-gray-200 hover:border-[#6A55F8] text-sm text-left">
                        <div className="font-medium">Тест (один ответ)</div>
                        <div className="text-xs text-gray-500">Radio-вопросы</div>
                      </button>
                      <button onClick={() => addAssignment('test_multi')} className="px-3 py-2 rounded-lg border border-gray-200 hover:border-[#6A55F8] text-sm text-left">
                        <div className="font-medium">Тест (несколько)</div>
                        <div className="text-xs text-gray-500">Checkbox-вопросы</div>
                      </button>
                      <button onClick={() => addAssignment('test_open_text')} className="px-3 py-2 rounded-lg border border-gray-200 hover:border-[#6A55F8] text-sm text-left">
                        <div className="font-medium">Тест (произвольный)</div>
                        <div className="text-xs text-gray-500">Текстовый ответ</div>
                      </button>
                      <button onClick={() => addAssignment('file_upload')} className="px-3 py-2 rounded-lg border border-gray-200 hover:border-[#6A55F8] text-sm text-left">
                        <div className="font-medium">Загрузка файла</div>
                        <div className="text-xs text-gray-500">PDF, фото, скрин</div>
                      </button>
                      <button onClick={() => addAssignment('video_response')} className="px-3 py-2 rounded-lg border border-gray-200 hover:border-[#6A55F8] text-sm text-left">
                        <div className="font-medium">Видеоответ</div>
                        <div className="text-xs text-gray-500">Запись с камеры</div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Список заданий-сирот (создан, но блок-ссылка удалён) */}
          {assignments.filter(a => !blocks.some(b => b.type === 'assignment' && b.content?.assignment_id === a.id)).length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="text-xs font-semibold text-amber-800 mb-2">Задания без блоков (сироты)</div>
              {assignments.filter(a => !blocks.some(b => b.type === 'assignment' && b.content?.assignment_id === a.id)).map(a => (
                <div key={a.id} className="flex items-center justify-between text-sm">
                  <span>{a.title}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingAssignment(a)} className="text-xs px-2 py-1 rounded bg-white">Открыть</button>
                    <button onClick={() => deleteAssignment(a.id)} className="text-xs px-2 py-1 rounded text-red-500 hover:bg-red-100">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'completion' && (
        <CompletionRulesEditor lesson={lesson} onUpdate={load} />
      )}

      {tab === 'access' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 max-w-2xl">
          <h3 className="text-base font-semibold text-gray-900 mb-2">Доступ к уроку</h3>
          <p className="text-sm text-gray-500 mb-4">
            Если тарифы не выбраны — урок доступен всем тарифам продукта. Если выбраны — только им (остальные видят с замком и кнопкой «Доплатить»).
          </p>
          <div className="grid grid-cols-2 gap-2">
            {tariffs.map(t => (
              <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox"
                  checked={tariffAccess.includes(t.id)}
                  onChange={e => {
                    const newList = e.target.checked
                      ? [...tariffAccess, t.id]
                      : tariffAccess.filter(x => x !== t.id)
                    saveTariffAccess(newList)
                  }}
                  className="w-4 h-4 accent-[#6A55F8]" />
                <span className="text-sm">{t.name}</span>
              </label>
            ))}
          </div>
          {tariffs.length === 0 && (
            <p className="text-xs text-gray-400">У продуктов проекта нет тарифов. Создайте тарифы в разделе Продукты.</p>
          )}
        </div>
      )}

      {tab === 'settings' && (
        <LessonSettings lesson={lesson} onUpdate={load} />
      )}

      {/* Assignment editor modal */}
      {editingAssignment && (
        <AssignmentEditorModal
          assignment={editingAssignment}
          onClose={() => setEditingAssignment(null)}
          onUpdate={() => { setEditingAssignment(null); load() }}
        />
      )}
    </div>
  )
}

function assignmentTypeLabel(t: Assignment['type']): string {
  return ({
    open_text: 'Открытое ДЗ',
    test_single: 'Тест (один ответ)',
    test_multi: 'Тест (несколько ответов)',
    test_open_text: 'Тест (произвольный ответ)',
    file_upload: 'Загрузка файла',
    video_response: 'Видеоответ',
  } as const)[t] ?? 'Задание'
}

// ───────────────────────────────────────────────────────────────────────
// BlockEditor — редактор отдельного блока
// ───────────────────────────────────────────────────────────────────────
function BlockEditor({
  block, assignment, videos, projectId, onUpdate, onDelete, onEditAssignment,
}: {
  block: Block;
  assignment: Assignment | null;
  videos: Video[];
  projectId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdate: (content: any) => void;
  onDelete: () => void;
  onEditAssignment: () => void;
}) {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
          <span className="cursor-grab">⋮⋮</span>
          {block.type === 'video' && <>🎬 Видео</>}
          {block.type === 'text' && <>📄 Текст</>}
          {block.type === 'audio' && <>🎙 Аудио</>}
          {block.type === 'files' && <>📎 Файлы</>}
          {block.type === 'assignment' && assignment && <>✅ {assignmentTypeLabel(assignment.type)}</>}
        </div>
        <button onClick={onDelete} className="text-xs text-gray-400 hover:text-red-500">✕</button>
      </div>

      {block.type === 'video' && <VideoBlock content={block.content} videos={videos} projectId={projectId} onChange={onUpdate} />}
      {block.type === 'text' && <TextBlock content={block.content} onChange={onUpdate} />}
      {block.type === 'audio' && <VideoBlock content={block.content} videos={videos} projectId={projectId} onChange={onUpdate} audio />}
      {block.type === 'files' && <FilesBlock content={block.content} projectId={projectId} onChange={onUpdate} />}
      {block.type === 'assignment' && assignment && (
        <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">{assignment.title}</div>
            <div className="text-xs text-gray-500">{assignmentTypeLabel(assignment.type)}</div>
          </div>
          <button onClick={onEditAssignment} className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-[#6A55F8]">
            Настроить →
          </button>
        </div>
      )}
    </div>
  )
}

// ── VIDEO / AUDIO ─────────────────────────────────────────────────────
function VideoBlock({
  content, videos, projectId, onChange, audio,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
  videos: Video[];
  projectId: string;
  onChange: (c: object) => void;
  audio?: boolean;
}) {
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const v = videos.find(x => x.id === content?.video_id) ?? null

  async function uploadFile(f: File) {
    setUploading(true)
    const fd = new FormData()
    fd.append('file', f)
    fd.append('project_id', projectId)
    fd.append('title', f.name)
    try {
      const r = await fetch('/api/videos/upload', { method: 'POST', body: fd })
      const data = await r.json()
      if (data?.video_id) {
        onChange({ ...content, video_id: data.video_id, title: f.name })
      } else {
        alert('Ошибка загрузки: ' + (data?.error ?? 'unknown'))
      }
    } catch (e) {
      alert('Ошибка: ' + (e instanceof Error ? e.message : 'unknown'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      {v ? (
        <div className="bg-gray-900 rounded-lg aspect-video flex items-center justify-center text-white">
          <div className="text-center">
            <div className="text-3xl mb-2">{audio ? '🎙' : '▶'}</div>
            <div className="text-sm font-medium">{v.title}</div>
            {v.duration_seconds && <div className="text-xs text-gray-400">{Math.floor(v.duration_seconds / 60)}:{String(v.duration_seconds % 60).padStart(2, '0')}</div>}
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg p-6 border-2 border-dashed border-gray-200 text-center">
          <div className="text-2xl mb-2">{audio ? '🎙' : '🎬'}</div>
          <div className="text-sm text-gray-600 mb-3">Загрузить или выбрать существующее</div>
          <label className="inline-block">
            <input
              type="file"
              accept={audio ? 'audio/*' : 'video/*'}
              className="hidden"
              onChange={async e => {
                const f = e.target.files?.[0]
                if (f) await uploadFile(f)
              }}
            />
            <span className={`inline-block px-4 py-2 rounded-lg text-sm font-medium cursor-pointer ${
              uploading ? 'bg-gray-200 text-gray-400' : 'bg-[#6A55F8] text-white hover:bg-[#5040D6]'
            }`}>
              {uploading ? 'Загружаю…' : 'Загрузить файл'}
            </span>
          </label>
        </div>
      )}

      <div className="flex gap-2 items-center">
        <input
          type="text"
          placeholder="Найти ранее загруженное…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-sm"
        />
        {v && (
          <button onClick={() => onChange({ ...content, video_id: null })} className="text-xs text-red-500 hover:underline">
            Убрать
          </button>
        )}
      </div>
      {search && (
        <div className="border border-gray-100 rounded-lg max-h-48 overflow-auto">
          {videos.filter(x => x.title.toLowerCase().includes(search.toLowerCase())).map(x => (
            <button
              key={x.id}
              onClick={() => { onChange({ ...content, video_id: x.id, title: x.title }); setSearch('') }}
              className="w-full px-3 py-2 text-left hover:bg-gray-50 text-sm border-b border-gray-50 last:border-b-0"
            >
              {x.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── TEXT (rich-text TipTap) ───────────────────────────────────────────
function TextBlock({ content, onChange }: { content: { html: string }; onChange: (c: object) => void }) {
  return (
    <RichTextEditor
      value={content?.html ?? ''}
      onChange={html => onChange({ html })}
      placeholder="Начните писать урок…"
      rows={8}
    />
  )
}

// ── FILES ─────────────────────────────────────────────────────────────
function FilesBlock({
  content, projectId, onChange,
}: {
  content: { items: Array<{ name: string; url: string; size_bytes: number }> };
  projectId: string;
  onChange: (c: object) => void;
}) {
  const supabase = createClient()
  const [uploading, setUploading] = useState(false)
  const items = content?.items ?? []

  async function uploadFile(f: File) {
    setUploading(true)
    const path = `${projectId}/lessons/${Date.now()}_${f.name}`
    const { error } = await supabase.storage.from('chatbot-media').upload(path, f, { upsert: false })
    if (error) {
      alert('Ошибка загрузки: ' + error.message)
      setUploading(false)
      return
    }
    const { data: pub } = supabase.storage.from('chatbot-media').getPublicUrl(path)
    onChange({ items: [...items, { name: f.name, url: pub.publicUrl, size_bytes: f.size }] })
    setUploading(false)
  }

  return (
    <div className="space-y-2">
      {items.map((it, idx) => (
        <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl">📎</span>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{it.name}</div>
              <div className="text-xs text-gray-400">{(it.size_bytes / 1024).toFixed(0)} KB</div>
            </div>
          </div>
          <button
            onClick={() => onChange({ items: items.filter((_, i) => i !== idx) })}
            className="text-xs text-gray-400 hover:text-red-500 flex-shrink-0"
          >
            ✕
          </button>
        </div>
      ))}
      <label className="inline-block">
        <input
          type="file"
          className="hidden"
          onChange={async e => {
            const f = e.target.files?.[0]
            if (f) await uploadFile(f)
          }}
        />
        <span className={`inline-block px-3 py-1.5 rounded-lg text-sm border border-gray-200 cursor-pointer hover:border-[#6A55F8] ${uploading ? 'opacity-50' : ''}`}>
          {uploading ? 'Загружаю…' : '+ Добавить файл'}
        </span>
      </label>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────
// Assignment Editor Modal
// ───────────────────────────────────────────────────────────────────────
function AssignmentEditorModal({
  assignment, onClose, onUpdate,
}: {
  assignment: Assignment;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const supabase = createClient()
  const [title, setTitle] = useState(assignment.title)
  const [description, setDescription] = useState(assignment.description ?? '')
  const [settings, setSettings] = useState(assignment.settings ?? {})
  const [questions, setQuestions] = useState<Question[]>([])
  const [saving, setSaving] = useState(false)

  const isTest = assignment.type === 'test_single' || assignment.type === 'test_multi' || assignment.type === 'test_open_text'

  useEffect(() => {
    if (isTest) {
      supabase.from('quiz_questions').select('*').eq('assignment_id', assignment.id).order('order_position').then(({ data }) => {
        setQuestions((data as Question[]) ?? [])
      })
    }
  }, [assignment.id, isTest, supabase])

  async function save() {
    setSaving(true)
    await supabase.from('lesson_assignments').update({
      title, description: description || null, settings,
    }).eq('id', assignment.id)
    setSaving(false)
    onUpdate()
  }

  async function addQuestion() {
    const order = questions.length
    const type = assignment.type === 'test_single' ? 'single' : assignment.type === 'test_multi' ? 'multi' : 'text'
    const { data } = await supabase.from('quiz_questions').insert({
      assignment_id: assignment.id,
      type,
      question_text: '',
      options: type === 'text' ? [] : [{ id: 'a', text: '', is_correct: false }, { id: 'b', text: '', is_correct: false }],
      points: 1,
      order_position: order,
    }).select().single()
    if (data) setQuestions([...questions, data as Question])
  }

  async function updateQuestion(q: Question, patch: Partial<Question>) {
    await supabase.from('quiz_questions').update(patch).eq('id', q.id)
    setQuestions(prev => prev.map(x => x.id === q.id ? { ...x, ...patch } : x))
  }

  async function deleteQuestion(id: string) {
    if (!confirm('Удалить вопрос?')) return
    await supabase.from('quiz_questions').delete().eq('id', id)
    setQuestions(prev => prev.filter(x => x.id !== id))
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={assignment.title || assignmentTypeLabel(assignment.type)}
      subtitle={assignmentTypeLabel(assignment.type)}
      maxWidth="3xl"
      footer={<>
        <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800 px-3 py-2">Отмена</button>
        <button onClick={save} disabled={saving} className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40">
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </>}
    >
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Название задания</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Описание / инструкция</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] resize-none" />
        </div>

        {/* Settings */}
        <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
          {isTest && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Лимит попыток</label>
              <input type="number" min={0} value={settings.attempts_limit ?? 0}
                onChange={e => setSettings({ ...settings, attempts_limit: parseInt(e.target.value || '0') })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
              <p className="text-xs text-gray-400 mt-1">0 = без ограничений</p>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Дедлайн</label>
            <select value={settings.deadline_type ?? 'none'}
              onChange={e => setSettings({ ...settings, deadline_type: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
              <option value="none">Без дедлайна</option>
              <option value="days">N дней с открытия урока</option>
              <option value="date">До конкретной даты</option>
            </select>
          </div>
          {settings.deadline_type === 'days' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Через сколько дней</label>
              <input type="number" min={1} value={settings.deadline_days ?? 7}
                onChange={e => setSettings({ ...settings, deadline_days: parseInt(e.target.value || '7') })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>
          )}
          {settings.deadline_type === 'date' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">До даты</label>
              <input type="datetime-local"
                value={settings.deadline_at ? new Date(settings.deadline_at).toISOString().slice(0, 16) : ''}
                onChange={e => setSettings({ ...settings, deadline_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>
          )}
          {isTest && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Проходной балл</label>
              <input type="number" min={0} value={settings.passing_score ?? 0}
                onChange={e => setSettings({ ...settings, passing_score: parseInt(e.target.value || '0') })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
              <p className="text-xs text-gray-400 mt-1">0 = достаточно одного правильного ответа</p>
            </div>
          )}
        </div>

        {/* Test questions */}
        {isTest && (
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Вопросы теста</h3>
              <button onClick={addQuestion} className="text-xs px-3 py-1.5 rounded-lg bg-[#6A55F8] text-white hover:bg-[#5040D6]">
                + Вопрос
              </button>
            </div>
            <div className="space-y-3">
              {questions.map((q, idx) => (
                <QuestionEditor
                  key={q.id}
                  question={q}
                  index={idx}
                  onUpdate={patch => updateQuestion(q, patch)}
                  onDelete={() => deleteQuestion(q.id)}
                />
              ))}
              {questions.length === 0 && (
                <div className="text-xs text-gray-400 text-center py-3">Пока нет вопросов</div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── Question editor ───────────────────────────────────────────────────
function QuestionEditor({
  question, index, onUpdate, onDelete,
}: {
  question: Question;
  index: number;
  onUpdate: (patch: Partial<Question>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
      <div className="flex items-start gap-2">
        <span className="text-xs font-semibold text-gray-500 mt-2">#{index + 1}</span>
        <textarea
          value={question.question_text}
          onChange={e => onUpdate({ question_text: e.target.value })}
          placeholder="Текст вопроса…"
          rows={2}
          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] resize-none bg-white"
        />
        <button onClick={onDelete} className="text-xs text-gray-400 hover:text-red-500 mt-2">✕</button>
      </div>

      {question.type === 'text' ? (
        <div className="ml-7">
          <label className="block text-xs text-gray-500 mb-1">Правильный ответ (точное совпадение, без учёта регистра)</label>
          <input
            type="text"
            value={question.correct_text ?? ''}
            onChange={e => onUpdate({ correct_text: e.target.value })}
            className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm bg-white"
          />
          <input
            type="text"
            placeholder="Альтернативные правильные ответы через ; (опционально)"
            value={(question.correct_text_alts ?? []).join('; ')}
            onChange={e => onUpdate({ correct_text_alts: e.target.value.split(';').map(x => x.trim()).filter(Boolean) })}
            className="w-full mt-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs bg-white"
          />
        </div>
      ) : (
        <div className="ml-7 space-y-2">
          {question.options.map((opt, i) => (
            <div key={opt.id} className="flex items-center gap-2">
              <input
                type={question.type === 'single' ? 'radio' : 'checkbox'}
                checked={opt.is_correct}
                onChange={() => {
                  const next = question.type === 'single'
                    ? question.options.map(o => ({ ...o, is_correct: o.id === opt.id }))
                    : question.options.map(o => o.id === opt.id ? { ...o, is_correct: !o.is_correct } : o)
                  onUpdate({ options: next })
                }}
                className="w-4 h-4 accent-[#6A55F8]"
              />
              <input
                type="text"
                value={opt.text}
                onChange={e => {
                  const next = question.options.map(o => o.id === opt.id ? { ...o, text: e.target.value } : o)
                  onUpdate({ options: next })
                }}
                placeholder={`Вариант ${i + 1}`}
                className="flex-1 px-2 py-1 rounded border border-gray-200 text-sm bg-white"
              />
              <button
                onClick={() => onUpdate({ options: question.options.filter(o => o.id !== opt.id) })}
                className="text-xs text-gray-400 hover:text-red-500"
              >✕</button>
            </div>
          ))}
          <button
            onClick={() => onUpdate({
              options: [...question.options, { id: Math.random().toString(36).slice(2, 8), text: '', is_correct: false }]
            })}
            className="text-xs text-[#6A55F8] hover:underline ml-6"
          >
            + Добавить вариант
          </button>
        </div>
      )}

      <div className="ml-7 flex items-center gap-3 text-xs text-gray-500">
        <label>Баллы: <input type="number" min={0} value={question.points}
          onChange={e => onUpdate({ points: parseInt(e.target.value || '0') })}
          className="w-12 px-1 py-0.5 rounded border border-gray-200 ml-1" />
        </label>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────
// Completion rules tab
// ───────────────────────────────────────────────────────────────────────
function CompletionRulesEditor({ lesson, onUpdate }: { lesson: Lesson; onUpdate: () => void }) {
  const supabase = createClient()
  const rules = lesson.completion_rules ?? { button: true }
  const [draft, setDraft] = useState(rules)
  const [hardStop, setHardStop] = useState(lesson.hard_stop_on_failure)
  const [videoThreshold, setVideoThreshold] = useState(lesson.video_threshold)
  const [attemptsLimit, setAttemptsLimit] = useState(lesson.attempts_limit)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await supabase.from('course_lessons').update({
      completion_rules: draft,
      hard_stop_on_failure: hardStop,
      video_threshold: videoThreshold,
      attempts_limit: attemptsLimit,
    }).eq('id', lesson.id)
    setSaving(false)
    onUpdate()
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 max-w-2xl space-y-5">
      <div>
        <h3 className="text-base font-semibold text-gray-900">Когда урок считается пройденным</h3>
        <p className="text-sm text-gray-500 mt-0.5">Можно комбинировать условия. Если ни одно не активно — открывается кнопкой «Завершить».</p>
      </div>

      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={draft.button !== false}
          onChange={e => setDraft({ ...draft, button: e.target.checked })}
          className="w-4 h-4 accent-[#6A55F8] mt-1" />
        <div>
          <div className="text-sm font-medium">Кнопка «Завершить урок»</div>
          <div className="text-xs text-gray-500">Ученик нажимает кнопку — следующий урок открывается</div>
        </div>
      </label>

      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={draft.video_required ?? false}
          onChange={e => setDraft({ ...draft, video_required: e.target.checked })}
          className="w-4 h-4 accent-[#6A55F8] mt-1" />
        <div className="flex-1">
          <div className="text-sm font-medium">Досмотреть видео</div>
          <div className="text-xs text-gray-500">Кнопка «Завершить» доступна только после X% видео</div>
          {draft.video_required && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs">Порог:</span>
              <input type="number" min={1} max={100} value={videoThreshold}
                onChange={e => setVideoThreshold(parseInt(e.target.value || '90'))}
                className="w-16 px-2 py-1 rounded border border-gray-200 text-xs" />
              <span className="text-xs">%</span>
            </div>
          )}
        </div>
      </label>

      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={draft.homework_required ?? false}
          onChange={e => setDraft({ ...draft, homework_required: e.target.checked })}
          className="w-4 h-4 accent-[#6A55F8] mt-1" />
        <div className="flex-1">
          <div className="text-sm font-medium">Сдать ДЗ</div>
          <div className="text-xs text-gray-500">Урок откроется только после успешной сдачи всех заданий</div>
          {draft.homework_required && (
            <div className="mt-2 space-y-1">
              <label className="flex items-center gap-2">
                <input type="radio" name="hw" checked={draft.homework_review_type === 'auto'}
                  onChange={() => setDraft({ ...draft, homework_review_type: 'auto' })}
                  className="w-3.5 h-3.5 accent-[#6A55F8]" />
                <span className="text-xs">Автопроверка (для тестов)</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="hw" checked={draft.homework_review_type === 'curator'}
                  onChange={() => setDraft({ ...draft, homework_review_type: 'curator' })}
                  className="w-3.5 h-3.5 accent-[#6A55F8]" />
                <span className="text-xs">Проверка куратором (статус «принято» открывает дальше)</span>
              </label>
            </div>
          )}
        </div>
      </label>

      <div className="border-t border-gray-100 pt-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={hardStop}
            onChange={e => setHardStop(e.target.checked)}
            className="w-4 h-4 accent-[#6A55F8] mt-1" />
          <div>
            <div className="text-sm font-medium">Жёсткий стоп при провале попыток теста</div>
            <div className="text-xs text-gray-500">Без этой галочки — куратор может разрешить пересдачу или зачесть вручную</div>
          </div>
        </label>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Лимит попыток теста (на уроке)</label>
        <input type="number" min={0} value={attemptsLimit}
          onChange={e => setAttemptsLimit(parseInt(e.target.value || '0'))}
          className="w-32 px-3 py-2 rounded-lg border border-gray-200 text-sm" />
        <p className="text-xs text-gray-400 mt-1">0 = без ограничений (можно переопределить в каждом задании)</p>
      </div>

      <button onClick={save} disabled={saving}
        className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40">
        {saving ? 'Сохраняю…' : 'Сохранить'}
      </button>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────
// Lesson settings tab
// ───────────────────────────────────────────────────────────────────────
function LessonSettings({ lesson, onUpdate }: { lesson: Lesson; onUpdate: () => void }) {
  const supabase = createClient()
  const [name, setName] = useState(lesson.name)
  const [description, setDescription] = useState(lesson.description ?? '')
  const [coverUrl, setCoverUrl] = useState(lesson.cover_url ?? '')
  const [isBonus, setIsBonus] = useState(lesson.is_bonus)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await supabase.from('course_lessons').update({
      name, description: description || null, cover_url: coverUrl || null,
      is_bonus: isBonus,
    }).eq('id', lesson.id)
    setSaving(false)
    onUpdate()
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4 max-w-2xl">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Название урока</label>
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
      {!lesson.is_exam && (
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={isBonus} onChange={e => setIsBonus(e.target.checked)} className="w-4 h-4 accent-[#6A55F8]" />
          <span className="text-sm">Бонусный урок (не учитывается в прогрессе курса)</span>
        </label>
      )}
      <button onClick={save} disabled={saving}
        className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40">
        {saving ? 'Сохраняю…' : 'Сохранить'}
      </button>
    </div>
  )
}
