'use client'

// Phase 7.6 + 7.8 — Плеер урока для ученика. Рендер блоков + трекинг
// видео + кнопка "Завершить" + сдача ДЗ с диалогом куратора (Phase 7.7).

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Lesson = {
  id: string
  course_id: string | null
  module_id: string | null
  name: string
  description: string | null
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
  type: 'video' | 'text' | 'audio' | 'files' | 'assignment'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any
  order_position: number
}

type Assignment = {
  id: string
  type: string
  title: string
  description: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings: any
  is_required: boolean
}

type Submission = {
  id: string
  assignment_id: string
  status: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any
  score: number | null
  errors_count: number | null
  attempt_number: number
  submitted_at: string | null
  reviewed_at: string | null
}

type VideoMeta = { id: string; title: string; kinescope_id: string | null; duration_seconds: number | null; embed_url: string | null }

export default function StudentLessonPage() {
  const params = useParams<{ courseId: string; lessonId: string }>()
  const router = useRouter()
  const courseId = params.courseId
  const lessonId = params.lessonId
  const supabase = createClient()

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [videoMetas, setVideoMetas] = useState<Record<string, VideoMeta>>({})
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ video_max_percent: number; completed_at: string | null } | null>(null)
  const [navLessons, setNavLessons] = useState<Array<{ id: string; name: string; order: number }>>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }

    const [l, b, a] = await Promise.all([
      supabase.from('course_lessons').select('*').eq('id', lessonId).single(),
      supabase.from('lesson_blocks').select('*').eq('lesson_id', lessonId).order('order_position'),
      supabase.from('lesson_assignments').select('*').eq('lesson_id', lessonId).order('order_position'),
    ])
    setLesson(l.data as Lesson | null)
    setBlocks((b.data as Block[]) ?? [])
    setAssignments((a.data as Assignment[]) ?? [])

    // Customer
    const { data: customers } = await supabase.from('customers').select('id').eq('user_id', user.id).limit(1)
    const cid = customers?.[0]?.id ?? null
    setCustomerId(cid)

    // Submissions ученика по этим заданиям
    if (cid && (a.data as Assignment[])?.length) {
      const { data: subs } = await supabase
        .from('assignment_submissions').select('*')
        .eq('customer_id', cid)
        .in('assignment_id', (a.data as Assignment[]).map(x => x.id))
      setSubmissions((subs as Submission[]) ?? [])
    }

    // Прогресс ученика
    if (cid) {
      const { data: lp } = await supabase.from('lesson_progress').select('video_max_percent, completed_at').eq('customer_id', cid).eq('lesson_id', lessonId).maybeSingle()
      setProgress(lp ?? null)
      if (!lp) {
        await supabase.from('lesson_progress').insert({ customer_id: cid, lesson_id: lessonId, opened_at: new Date().toISOString(), status: 'in_progress' })
      }
    }

    // Видео-метаданные для блоков-видео
    const videoIds = ((b.data as Block[]) ?? []).filter(x => x.type === 'video' || x.type === 'audio').map(x => x.content?.video_id).filter(Boolean)
    if (videoIds.length > 0) {
      const { data: vData } = await supabase.from('videos').select('id, title, kinescope_id, duration_seconds, embed_url').in('id', videoIds)
      const m: Record<string, VideoMeta> = {}
      for (const v of vData ?? []) m[v.id] = v as VideoMeta
      setVideoMetas(m)
    }

    // Соседние уроки в курсе для навигации (← → следующий)
    const { data: courseLessons } = await supabase
      .from('course_lessons')
      .select('id, name, order_position, course_id, module_id, is_exam')
      .or(`course_id.eq.${courseId},module_id.not.is.null`)
      .order('order_position')
    const { data: courseModules } = await supabase.from('course_modules').select('id, course_id, order_position').eq('course_id', courseId).order('order_position')
    const moduleMap = new Map(((courseModules as Array<{ id: string; course_id: string; order_position: number }>) ?? []).map(m => [m.id, m.order_position]))
    const inThisCourse = ((courseLessons as Array<{ id: string; name: string; order_position: number; course_id: string | null; module_id: string | null; is_exam: boolean }>) ?? [])
      .filter(l => l.course_id === courseId || (l.module_id && moduleMap.has(l.module_id)))
      .sort((a, b) => {
        const ma = a.module_id ? moduleMap.get(a.module_id) ?? 9999 : -1
        const mb = b.module_id ? moduleMap.get(b.module_id) ?? 9999 : -1
        if (ma !== mb) return ma - mb
        return a.order_position - b.order_position
      })
    setNavLessons(inThisCourse.map((x, i) => ({ id: x.id, name: x.name, order: i })))

    setLoading(false)
  }, [lessonId, courseId, supabase, router])

  useEffect(() => { load() }, [load])

  // Сохранить video progress в БД (debounced)
  const saveVideoProgress = useCallback(async (percent: number) => {
    if (!customerId) return
    const newMax = Math.max(progress?.video_max_percent ?? 0, percent)
    setProgress(prev => ({ video_max_percent: newMax, completed_at: prev?.completed_at ?? null }))
    await supabase.from('lesson_progress').upsert({
      customer_id: customerId, lesson_id: lessonId, video_max_percent: newMax,
    }, { onConflict: 'customer_id,lesson_id' })
  }, [customerId, lessonId, progress?.video_max_percent, supabase])

  async function markCompleted() {
    if (!customerId) return
    await supabase.from('lesson_progress').upsert({
      customer_id: customerId, lesson_id: lessonId, completed_at: new Date().toISOString(), status: 'completed',
    }, { onConflict: 'customer_id,lesson_id' })
    setProgress(prev => ({ video_max_percent: prev?.video_max_percent ?? 0, completed_at: new Date().toISOString() }))
    // Перейти к следующему уроку
    const idx = navLessons.findIndex(x => x.id === lessonId)
    if (idx >= 0 && idx + 1 < navLessons.length) {
      router.push(`/learn/course/${courseId}/lesson/${navLessons[idx + 1].id}`)
    } else {
      router.push(`/learn/course/${courseId}`)
    }
  }

  if (loading) return <div className="text-sm text-gray-500">Загружаем…</div>
  if (!lesson) return <div className="text-sm text-gray-500">Урок не найден</div>

  // ── Условия завершения урока ──────────────────────────────────────────
  const rules = lesson.completion_rules ?? { button: true }
  const requiredAssignments = assignments.filter(a => a.is_required)
  const allRequiredAccepted = requiredAssignments.every(a => {
    const sub = submissions.find(s => s.assignment_id === a.id)
    return sub && (sub.status === 'accepted')
  })

  const videoOk = !rules.video_required || (progress?.video_max_percent ?? 0) >= (lesson.video_threshold ?? 90)
  const homeworkOk = !rules.homework_required || allRequiredAccepted
  const canComplete = videoOk && homeworkOk

  const idx = navLessons.findIndex(x => x.id === lessonId)
  const prevLesson = idx > 0 ? navLessons[idx - 1] : null
  const nextLesson = idx >= 0 && idx + 1 < navLessons.length ? navLessons[idx + 1] : null

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={() => router.push(`/learn/course/${courseId}`)} className="text-sm text-gray-500 hover:text-gray-800">← К курсу</button>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {idx + 1} / {navLessons.length}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h1 className="text-2xl font-bold text-gray-900">{lesson.name}</h1>
        {lesson.description && <p className="text-sm text-gray-500 mt-2">{lesson.description}</p>}
      </div>

      {/* Блоки */}
      <div className="space-y-4">
        {blocks.map(b => (
          <div key={b.id}>
            {b.type === 'video' && (
              <VideoPlayer
                videoMeta={videoMetas[b.content?.video_id]}
                onProgress={saveVideoProgress}
                customerId={customerId}
                lessonId={lessonId}
                blockId={b.id}
              />
            )}
            {b.type === 'audio' && (
              <VideoPlayer
                videoMeta={videoMetas[b.content?.video_id]}
                onProgress={saveVideoProgress}
                customerId={customerId}
                lessonId={lessonId}
                blockId={b.id}
                audio
              />
            )}
            {b.type === 'text' && (
              <div className="bg-white rounded-xl border border-gray-100 p-6 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: b.content?.html ?? '' }} />
            )}
            {b.type === 'files' && (
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="text-xs font-semibold text-gray-500 mb-3">📎 Материалы</div>
                <div className="space-y-2">
                  {(b.content?.items ?? []).map((it: { name: string; url: string; size_bytes: number }, i: number) => (
                    <a key={i} href={it.url} download target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xl flex-shrink-0">📄</span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{it.name}</div>
                          <div className="text-xs text-gray-400">{(it.size_bytes / 1024).toFixed(0)} KB</div>
                        </div>
                      </div>
                      <span className="text-xs text-[#6A55F8] flex-shrink-0">↓ Скачать</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
            {b.type === 'assignment' && (() => {
              const a = assignments.find(x => x.id === b.content?.assignment_id)
              if (!a) return null
              const sub = submissions.find(s => s.assignment_id === a.id)
              return <AssignmentBlock assignment={a} submission={sub ?? null} customerId={customerId} onUpdate={load} />
            })()}
          </div>
        ))}
      </div>

      {/* Кнопка "Завершить урок" */}
      {!progress?.completed_at && rules.button !== false && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          {!canComplete && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-sm text-amber-900">
              {!videoOk && <div>⚠️ Досмотрите видео до {lesson.video_threshold}% (сейчас {progress?.video_max_percent ?? 0}%)</div>}
              {!homeworkOk && <div>⚠️ Сдайте обязательные задания и дождитесь принятия куратором</div>}
            </div>
          )}
          <button
            onClick={markCompleted}
            disabled={!canComplete}
            className={`w-full py-3 rounded-xl text-sm font-semibold transition-all ${
              canComplete ? 'bg-[#6A55F8] hover:bg-[#5040D6] text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {nextLesson ? `Завершить урок · к следующему «${nextLesson.name}» →` : 'Завершить урок · вернуться к курсу'}
          </button>
        </div>
      )}

      {progress?.completed_at && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-sm text-green-900">
          ✓ Урок пройден {new Date(progress.completed_at).toLocaleDateString('ru')}
        </div>
      )}

      {/* Навигация */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <div>
          {prevLesson && (
            <button
              onClick={() => router.push(`/learn/course/${courseId}/lesson/${prevLesson.id}`)}
              className="text-sm text-gray-500 hover:text-gray-800"
            >
              ← {prevLesson.name}
            </button>
          )}
        </div>
        <div>
          {nextLesson && (
            <button
              onClick={() => router.push(`/learn/course/${courseId}/lesson/${nextLesson.id}`)}
              className="text-sm text-gray-500 hover:text-gray-800"
            >
              {nextLesson.name} →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────
// Video player с Kinescope трекингом + запись в lesson_video_views
// ───────────────────────────────────────────────────────────────────────
function VideoPlayer({
  videoMeta, onProgress, customerId, lessonId, blockId, audio,
}: {
  videoMeta?: VideoMeta;
  onProgress: (percent: number) => void;
  customerId: string | null;
  lessonId: string;
  blockId: string;
  audio?: boolean;
}) {
  const supabase = createClient()
  const lastSavedRef = useRef(0)
  const maxPercentRef = useRef(0)
  const watchedSecondsRef = useRef(0)
  const maxPositionRef = useRef(0)

  useEffect(() => {
    if (!videoMeta?.kinescope_id) return
    function handleMessage(e: MessageEvent) {
      if (!e.origin.includes('kinescope.io')) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = e.data
      const eventType = (data?.event ?? data?.type ?? '').toString().replace(/^kinescope[:.]/, '')
      if (eventType === 'timeupdate') {
        const current = Number(data?.data?.currentTime ?? data?.currentTime ?? 0)
        const duration = Number(data?.data?.duration ?? data?.duration ?? 0)
        if (duration > 0) {
          const percent = Math.round(current / duration * 100)
          if (percent > maxPercentRef.current) maxPercentRef.current = percent
          if (current > maxPositionRef.current) maxPositionRef.current = current
          watchedSecondsRef.current = Math.max(watchedSecondsRef.current, current)

          const now = Date.now()
          if (now - lastSavedRef.current > 5000) {
            lastSavedRef.current = now
            onProgress(maxPercentRef.current)
            // Также запишем в lesson_video_views
            if (customerId) {
              supabase.from('lesson_video_views').upsert({
                customer_id: customerId,
                lesson_id: lessonId,
                block_id: blockId,
                kinescope_id: videoMeta?.kinescope_id ?? null,
                duration_seconds: Math.round(duration),
                watched_seconds: Math.round(watchedSecondsRef.current),
                max_position_seconds: Math.round(maxPositionRef.current),
                watch_percent: maxPercentRef.current,
                last_watched_at: new Date().toISOString(),
              }, { onConflict: 'customer_id,block_id' })
            }
          }
        }
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [videoMeta?.kinescope_id, customerId, lessonId, blockId, onProgress, supabase])

  if (!videoMeta?.kinescope_id) {
    return (
      <div className="aspect-video bg-gray-100 rounded-xl flex items-center justify-center text-sm text-gray-500">
        Видео не загружено
      </div>
    )
  }

  const embedUrl = videoMeta.embed_url ?? `https://kinescope.io/embed/${videoMeta.kinescope_id}`

  return (
    <div className={`bg-black rounded-xl overflow-hidden ${audio ? 'aspect-[3/1]' : 'aspect-video'}`}>
      <iframe
        src={embedUrl}
        className="w-full h-full"
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media;"
        allowFullScreen
        title={videoMeta.title}
      />
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────
// Assignment block — сдача ДЗ + диалог куратор↔ученик
// ───────────────────────────────────────────────────────────────────────
function AssignmentBlock({
  assignment, submission, customerId, onUpdate,
}: {
  assignment: Assignment;
  submission: Submission | null;
  customerId: string | null;
  onUpdate: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border-2 border-[#6A55F8]/20 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xl">✅</span>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-gray-900">{assignment.title}</h3>
          <div className="text-xs text-gray-500">{assignmentTypeLabel(assignment.type)}</div>
        </div>
        {submission && <StatusBadge status={submission.status} />}
      </div>
      {assignment.description && <p className="text-sm text-gray-600">{assignment.description}</p>}

      <SubmissionUI assignment={assignment} submission={submission} customerId={customerId} onUpdate={onUpdate} />
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Не начато', cls: 'bg-gray-100 text-gray-600' },
    in_review: { label: 'На проверке', cls: 'bg-blue-50 text-blue-700' },
    needs_revision: { label: 'На доработке', cls: 'bg-amber-50 text-amber-700' },
    accepted: { label: '✓ Принято', cls: 'bg-green-50 text-green-700' },
    rejected: { label: 'Отклонено', cls: 'bg-red-50 text-red-700' },
    expired: { label: 'Просрочено', cls: 'bg-gray-100 text-gray-500' },
  }
  const x = map[status] ?? map.pending
  return <span className={`text-xs px-2 py-0.5 rounded-full ${x.cls}`}>{x.label}</span>
}

function assignmentTypeLabel(t: string): string {
  return ({
    open_text: 'Открытое ДЗ',
    test_single: 'Тест (один ответ)',
    test_multi: 'Тест (несколько ответов)',
    test_open_text: 'Тест (произвольный ответ)',
    file_upload: 'Загрузка файла',
    video_response: 'Видеоответ',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)[t] ?? 'Задание'
}

// ── Сдача ДЗ + диалог ─────────────────────────────────────────────────
function SubmissionUI({
  assignment, submission, customerId, onUpdate,
}: {
  assignment: Assignment;
  submission: Submission | null;
  customerId: string | null;
  onUpdate: () => void;
}) {
  const supabase = createClient()
  const [textAnswer, setTextAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [questions, setQuestions] = useState<any[]>([])
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string | string[]>>({})
  const [messages, setMessages] = useState<Array<{ id: string; sender_type: string; sender_user_id: string | null; sender_customer_id: string | null; text: string; attachments: Array<{ url: string; name: string }>; created_at: string }>>([])
  const [chatText, setChatText] = useState('')

  const isTest = assignment.type === 'test_single' || assignment.type === 'test_multi' || assignment.type === 'test_open_text'

  useEffect(() => {
    if (isTest) {
      supabase.from('quiz_questions').select('*').eq('assignment_id', assignment.id).order('order_position').then(({ data }) => {
        setQuestions(data ?? [])
      })
    }
    if (submission) {
      supabase.from('assignment_messages').select('*').eq('submission_id', submission.id).order('created_at').then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setMessages(((data as any[]) ?? []))
      })
    }
  }, [assignment.id, isTest, submission, supabase])

  async function submitOpenText() {
    if (!customerId || !textAnswer.trim()) return
    setSubmitting(true)
    if (submission) {
      // Это пере-сдача после revision
      await supabase.from('assignment_submissions').update({
        status: 'in_review', content: { text: textAnswer.trim() }, submitted_at: new Date().toISOString(),
      }).eq('id', submission.id)
    } else {
      await supabase.from('assignment_submissions').insert({
        assignment_id: assignment.id, customer_id: customerId,
        status: 'in_review', content: { text: textAnswer.trim() }, submitted_at: new Date().toISOString(),
      })
    }
    setTextAnswer('')
    setSubmitting(false)
    onUpdate()
  }

  async function submitQuiz() {
    if (!customerId) return
    setSubmitting(true)
    // Подсчёт результата
    let correctCount = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let totalScore = 0
    const errors: string[] = []
    for (const q of questions) {
      const ans = quizAnswers[q.id]
      let ok = false
      if (q.type === 'single') {
        const correct = q.options?.find((o: { is_correct: boolean }) => o.is_correct)
        ok = correct && ans === correct.id
      } else if (q.type === 'multi') {
        const correctIds = (q.options ?? []).filter((o: { is_correct: boolean }) => o.is_correct).map((o: { id: string }) => o.id)
        const ansArr = Array.isArray(ans) ? ans : []
        ok = correctIds.length === ansArr.length && correctIds.every((id: string) => ansArr.includes(id))
      } else if (q.type === 'text') {
        const norm = (s: string) => (s ?? '').trim().toLowerCase()
        const correctAnswers = [q.correct_text, ...(q.correct_text_alts ?? [])].filter(Boolean).map(norm)
        ok = !!ans && correctAnswers.includes(norm(typeof ans === 'string' ? ans : ''))
      }
      if (ok) { correctCount++; totalScore += (q.points ?? 1) } else { errors.push(q.id) }
    }
    const passingScore = assignment.settings?.passing_score ?? 0
    const passed = totalScore >= passingScore && (passingScore > 0 || correctCount > 0)
    const newStatus = passed ? 'accepted' : 'needs_revision'

    // attempt_number: если submission уже есть — увеличиваем
    const attempt = submission ? (submission.attempt_number + 1) : 1

    if (submission) {
      await supabase.from('assignment_submissions').update({
        status: newStatus, score: totalScore, errors_count: errors.length,
        attempt_number: attempt,
        content: { answers: Object.entries(quizAnswers).map(([qid, val]) => ({ question_id: qid, value: val })) },
        submitted_at: new Date().toISOString(),
      }).eq('id', submission.id)
    } else {
      await supabase.from('assignment_submissions').insert({
        assignment_id: assignment.id, customer_id: customerId,
        status: newStatus, score: totalScore, errors_count: errors.length,
        attempt_number: 1,
        content: { answers: Object.entries(quizAnswers).map(([qid, val]) => ({ question_id: qid, value: val })) },
        submitted_at: new Date().toISOString(),
      })
    }
    // Записать попытку для аудита
    await supabase.from('quiz_attempts').insert({
      assignment_id: assignment.id, customer_id: customerId,
      attempt_number: attempt, answers: Object.entries(quizAnswers).map(([qid, val]) => ({ question_id: qid, value: val })),
      score: totalScore, errors_count: errors.length, passed, completed_at: new Date().toISOString(),
    })
    setSubmitting(false)
    setQuizAnswers({})
    onUpdate()
  }

  async function uploadFile(f: File) {
    if (!customerId) return
    setSubmitting(true)
    const path = `submissions/${assignment.id}/${customerId}/${Date.now()}_${f.name}`
    const { error } = await supabase.storage.from('chatbot-media').upload(path, f, { upsert: false })
    if (error) {
      alert('Ошибка: ' + error.message)
      setSubmitting(false); return
    }
    const { data: pub } = supabase.storage.from('chatbot-media').getPublicUrl(path)
    const fileEntry = { name: f.name, url: pub.publicUrl, size_bytes: f.size }
    if (submission) {
      await supabase.from('assignment_submissions').update({
        status: 'in_review',
        content: { files: [...((submission.content as { files?: object[] })?.files ?? []), fileEntry] },
        submitted_at: new Date().toISOString(),
      }).eq('id', submission.id)
    } else {
      await supabase.from('assignment_submissions').insert({
        assignment_id: assignment.id, customer_id: customerId,
        status: 'in_review', content: { files: [fileEntry] },
        submitted_at: new Date().toISOString(),
      })
    }
    setSubmitting(false)
    onUpdate()
  }

  async function sendChatMessage() {
    if (!submission || !customerId || !chatText.trim()) return
    await supabase.from('assignment_messages').insert({
      submission_id: submission.id,
      sender_type: 'student',
      sender_customer_id: customerId,
      text: chatText.trim(),
    })
    setChatText('')
    const { data } = await supabase.from('assignment_messages').select('*').eq('submission_id', submission.id).order('created_at')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setMessages(((data as any[]) ?? []))
  }

  const isAccepted = submission?.status === 'accepted'
  const canResubmit = !submission || submission.status === 'needs_revision'

  return (
    <div className="space-y-3">
      {/* Существующий ответ */}
      {submission && submission.content && (
        <div className="bg-gray-50 rounded-lg p-3 text-sm">
          <div className="text-xs font-medium text-gray-500 mb-1">Ваш ответ (попытка {submission.attempt_number})</div>
          {submission.content.text && <p className="text-gray-800 whitespace-pre-wrap">{submission.content.text}</p>}
          {submission.content.files && (
            <div className="space-y-1">
              {submission.content.files.map((f: { name: string; url: string }, i: number) => (
                <a key={i} href={f.url} download className="text-xs text-[#6A55F8] hover:underline block">📎 {f.name}</a>
              ))}
            </div>
          )}
          {submission.content.answers && (
            <div className="text-xs text-gray-600">Тест: {submission.score ?? 0} баллов{submission.errors_count != null && `, ошибок: ${submission.errors_count}`}</div>
          )}
        </div>
      )}

      {/* Форма сдачи */}
      {canResubmit && !isAccepted && (
        <div className="space-y-2">
          {assignment.type === 'open_text' && (
            <>
              <textarea
                value={textAnswer}
                onChange={e => setTextAnswer(e.target.value)}
                placeholder="Ваш ответ…"
                rows={4}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] resize-none"
              />
              <button onClick={submitOpenText} disabled={submitting || !textAnswer.trim()}
                className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40">
                {submitting ? 'Отправляю…' : submission ? 'Отправить переработанный ответ' : 'Сдать ДЗ'}
              </button>
            </>
          )}

          {(assignment.type === 'file_upload' || assignment.type === 'video_response') && (
            <label className="inline-block cursor-pointer">
              <input type="file"
                accept={assignment.type === 'video_response' ? 'video/*' : undefined}
                className="hidden"
                onChange={async e => {
                  const f = e.target.files?.[0]
                  if (f) await uploadFile(f)
                }} />
              <span className={`inline-block px-4 py-2 rounded-lg text-sm font-medium ${
                submitting ? 'bg-gray-200 text-gray-400' : 'bg-[#6A55F8] text-white hover:bg-[#5040D6]'
              }`}>
                {submitting ? 'Загружаю…' : (submission ? 'Загрузить новый файл' : 'Прикрепить файл')}
              </span>
            </label>
          )}

          {isTest && (
            <div className="space-y-3">
              {questions.map((q, idx) => (
                <div key={q.id} className="bg-gray-50 rounded-lg p-3">
                  <div className="text-sm font-medium mb-2">#{idx + 1}. {q.question_text}</div>
                  {q.type === 'single' && (
                    <div className="space-y-1">
                      {q.options.map((o: { id: string; text: string }) => (
                        <label key={o.id} className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name={`q-${q.id}`} checked={quizAnswers[q.id] === o.id}
                            onChange={() => setQuizAnswers({ ...quizAnswers, [q.id]: o.id })}
                            className="w-4 h-4 accent-[#6A55F8]" />
                          <span className="text-sm">{o.text}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {q.type === 'multi' && (
                    <div className="space-y-1">
                      {q.options.map((o: { id: string; text: string }) => {
                        const arr = Array.isArray(quizAnswers[q.id]) ? quizAnswers[q.id] as string[] : []
                        const checked = arr.includes(o.id)
                        return (
                          <label key={o.id} className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={checked}
                              onChange={() => setQuizAnswers({ ...quizAnswers, [q.id]: checked ? arr.filter(x => x !== o.id) : [...arr, o.id] })}
                              className="w-4 h-4 accent-[#6A55F8]" />
                            <span className="text-sm">{o.text}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                  {q.type === 'text' && (
                    <input type="text"
                      value={(quizAnswers[q.id] as string) ?? ''}
                      onChange={e => setQuizAnswers({ ...quizAnswers, [q.id]: e.target.value })}
                      placeholder="Ваш ответ…"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                  )}
                </div>
              ))}
              <button onClick={submitQuiz} disabled={submitting || questions.length === 0}
                className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40">
                {submitting ? 'Проверяю…' : submission ? 'Пересдать тест' : 'Сдать тест'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Диалог куратор↔ученик */}
      {submission && (messages.length > 0 || submission.status !== 'pending') && (
        <div className="border-t border-gray-100 pt-3">
          <div className="text-xs font-medium text-gray-500 mb-2">Диалог с куратором</div>
          <div className="space-y-2 max-h-64 overflow-auto mb-2">
            {messages.map(m => (
              <div key={m.id} className={`text-sm ${m.sender_type === 'student' ? 'pl-6' : ''}`}>
                <div className={`inline-block px-3 py-2 rounded-lg ${m.sender_type === 'student' ? 'bg-[#6A55F8]/10' : 'bg-gray-100'}`}>
                  <div className="text-xs text-gray-500 mb-0.5">{m.sender_type === 'student' ? 'Вы' : 'Куратор'} · {new Date(m.created_at).toLocaleString('ru')}</div>
                  <div className="whitespace-pre-wrap">{m.text}</div>
                </div>
              </div>
            ))}
          </div>
          {submission.status !== 'accepted' && submission.status !== 'rejected' && (
            <div className="flex gap-2">
              <input type="text" value={chatText} onChange={e => setChatText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendChatMessage()}
                placeholder="Написать куратору…"
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm" />
              <button onClick={sendChatMessage} disabled={!chatText.trim()}
                className="px-4 py-2 rounded-lg bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium disabled:opacity-40">
                Отправить
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
