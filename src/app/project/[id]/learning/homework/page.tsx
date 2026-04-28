'use client'

// Phase 7.7 — Фид домашек для куратора/админа.
// Список всех submissions с фильтрами, детализацией и диалогом.

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type SubmissionRow = {
  id: string
  status: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any
  score: number | null
  errors_count: number | null
  attempt_number: number
  submitted_at: string | null
  reviewed_at: string | null
  // joined
  assignment_id: string
  assignment_title: string
  assignment_type: string
  lesson_id: string
  lesson_name: string
  course_id: string
  course_name: string
  product_id: string | null
  product_name: string | null
  customer_id: string
  customer_name: string
  customer_email: string | null
  customer_public_code: string | null
}

type Filter = 'all' | 'pending' | 'in_review' | 'needs_revision' | 'accepted' | 'rejected' | 'expired'

export default function HomeworkFeedPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const projectId = params.id
  const supabase = createClient()
  const [submissions, setSubmissions] = useState<SubmissionRow[] | null>(null)
  const [filter, setFilter] = useState<Filter>('in_review')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [productFilter, setProductFilter] = useState<string>('all')
  const [courseFilter, setCourseFilter] = useState<string>('all')

  const load = useCallback(async () => {
    // 1. Все курсы проекта
    const { data: courses } = await supabase.from('courses').select('id, name, project_id, product_id').eq('project_id', projectId)
    const courseIds = (courses ?? []).map(c => c.id)
    if (courseIds.length === 0) { setSubmissions([]); return }

    // 2. Все модули
    const { data: modules } = await supabase.from('course_modules').select('id, course_id').in('course_id', courseIds)
    const moduleToCourse = new Map(((modules as Array<{ id: string; course_id: string }>) ?? []).map(m => [m.id, m.course_id]))

    // 3. Все уроки
    const { data: lessons } = await supabase
      .from('course_lessons').select('id, name, course_id, module_id')
      .or(`course_id.in.(${courseIds.join(',')}),module_id.in.(${[...moduleToCourse.keys()].join(',') || '00000000-0000-0000-0000-000000000000'})`)
    const lessonMap = new Map<string, { name: string; course_id: string }>()
    for (const l of (lessons as Array<{ id: string; name: string; course_id: string | null; module_id: string | null }>) ?? []) {
      const cid = l.course_id ?? (l.module_id ? moduleToCourse.get(l.module_id) : null)
      if (cid) lessonMap.set(l.id, { name: l.name, course_id: cid })
    }
    const lessonIds = [...lessonMap.keys()]
    if (lessonIds.length === 0) { setSubmissions([]); return }

    // 4. Все assignments в этих уроках
    const { data: assignments } = await supabase
      .from('lesson_assignments').select('id, lesson_id, title, type')
      .in('lesson_id', lessonIds)
    const assignmentMap = new Map(((assignments as Array<{ id: string; lesson_id: string; title: string; type: string }>) ?? []).map(a => [a.id, a]))
    if (assignmentMap.size === 0) { setSubmissions([]); return }

    // 5. Все submissions по этим assignments
    const { data: subs } = await supabase
      .from('assignment_submissions').select('*')
      .in('assignment_id', [...assignmentMap.keys()])
      .order('submitted_at', { ascending: false })

    // 6. Customers
    const customerIds = [...new Set(((subs as Array<{ customer_id: string }>) ?? []).map(s => s.customer_id))]
    const { data: customers } = customerIds.length > 0
      ? await supabase.from('customers').select('id, full_name, email, public_code').in('id', customerIds)
      : { data: [] }
    const customerMap = new Map(((customers as Array<{ id: string; full_name: string; email: string | null; public_code: string | null }>) ?? []).map(c => [c.id, c]))

    // 7. Products
    const productIds = [...new Set((courses ?? []).map(c => c.product_id).filter(Boolean) as string[])]
    const { data: products } = productIds.length > 0
      ? await supabase.from('products').select('id, name').in('id', productIds)
      : { data: [] }
    const productMap = new Map(((products as Array<{ id: string; name: string }>) ?? []).map(p => [p.id, p.name]))

    const courseMap = new Map((courses ?? []).map(c => [c.id, c]))

    // Сборка
    const rows: SubmissionRow[] = ((subs as Array<{ id: string; status: string; content: object; score: number | null; errors_count: number | null; attempt_number: number; submitted_at: string | null; reviewed_at: string | null; assignment_id: string; customer_id: string }>) ?? []).map(s => {
      const a = assignmentMap.get(s.assignment_id)!
      const lInfo = lessonMap.get(a.lesson_id)
      const c = lInfo ? courseMap.get(lInfo.course_id) : null
      const cust = customerMap.get(s.customer_id)
      return {
        ...s,
        assignment_title: a.title,
        assignment_type: a.type,
        lesson_id: a.lesson_id,
        lesson_name: lInfo?.name ?? '—',
        course_id: lInfo?.course_id ?? '',
        course_name: c?.name ?? '—',
        product_id: c?.product_id ?? null,
        product_name: c?.product_id ? (productMap.get(c.product_id) ?? null) : null,
        customer_name: cust?.full_name ?? '—',
        customer_email: cust?.email ?? null,
        customer_public_code: cust?.public_code ?? null,
      }
    })
    setSubmissions(rows)
  }, [projectId, supabase])

  useEffect(() => { load() }, [load])

  if (submissions === null) return <div className="text-sm text-gray-500">Загружаем…</div>

  // Список продуктов и курсов из данных
  const productsInData = [...new Map(submissions.filter(s => s.product_id).map(s => [s.product_id!, s.product_name!])).entries()]
  const coursesInData = [...new Map(submissions.filter(s => productFilter === 'all' || s.product_id === productFilter).map(s => [s.course_id, s.course_name])).entries()]

  // Применение фильтров
  const filtered = submissions.filter(s => {
    if (filter !== 'all' && s.status !== filter) return false
    if (productFilter !== 'all' && s.product_id !== productFilter) return false
    if (courseFilter !== 'all' && s.course_id !== courseFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!s.customer_name.toLowerCase().includes(q) && !s.customer_email?.toLowerCase().includes(q) && !s.lesson_name.toLowerCase().includes(q)) return false
    }
    return true
  })

  const counts = {
    in_review: submissions.filter(s => s.status === 'in_review').length,
    needs_revision: submissions.filter(s => s.status === 'needs_revision').length,
    accepted: submissions.filter(s => s.status === 'accepted').length,
    rejected: submissions.filter(s => s.status === 'rejected').length,
    expired: submissions.filter(s => s.status === 'expired').length,
  }

  if (selectedId) {
    const s = submissions.find(x => x.id === selectedId)
    if (s) return <SubmissionDetail submission={s} onBack={() => { setSelectedId(null); load() }} />
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => router.push(`/project/${projectId}/learning`)} className="text-sm text-gray-500 hover:text-gray-800">← Курсы</button>
          <h1 className="text-xl font-bold text-gray-900 mt-1">Домашки на проверку</h1>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {([
            { k: 'all', label: `Все (${submissions.length})` },
            { k: 'in_review', label: `На проверке (${counts.in_review})` },
            { k: 'needs_revision', label: `На доработке (${counts.needs_revision})` },
            { k: 'accepted', label: `Принято (${counts.accepted})` },
            { k: 'rejected', label: `Отклонено (${counts.rejected})` },
            { k: 'expired', label: `Просрочено (${counts.expired})` },
          ] as const).map(o => (
            <button key={o.k} onClick={() => setFilter(o.k)}
              className={`text-xs px-3 py-1.5 rounded-lg ${filter === o.k ? 'bg-[#6A55F8] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input type="text" placeholder="Поиск ученика, урока…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
          <select value={productFilter} onChange={e => { setProductFilter(e.target.value); setCourseFilter('all') }}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm">
            <option value="all">Все продукты</option>
            {productsInData.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={courseFilter} onChange={e => setCourseFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm">
            <option value="all">Все курсы</option>
            {coursesInData.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
            Нет домашек по выбранным фильтрам
          </div>
        ) : (
          filtered.map(s => (
            <div key={s.id}
              onClick={() => setSelectedId(s.id)}
              className="bg-white rounded-xl border border-gray-100 px-4 py-3 hover:border-[#6A55F8]/30 cursor-pointer transition-colors">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{s.customer_name}</span>
                    {s.customer_public_code && <span className="text-xs text-gray-400">{s.customer_public_code}</span>}
                    <StatusBadge status={s.status} />
                    {s.attempt_number > 1 && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">попытка {s.attempt_number}</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 truncate">
                    <span className="text-gray-700">{s.assignment_title}</span> · {s.lesson_name} · {s.course_name} {s.product_name && `· ${s.product_name}`}
                  </div>
                </div>
                <div className="text-xs text-gray-400 flex-shrink-0">
                  {s.submitted_at && new Date(s.submitted_at).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
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
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${x.cls}`}>{x.label}</span>
}

// ───────────────────────────────────────────────────────────────────────
// Submission detail — диалог куратора с учеником
// ───────────────────────────────────────────────────────────────────────
function SubmissionDetail({ submission, onBack }: { submission: SubmissionRow; onBack: () => void }) {
  const supabase = createClient()
  const [messages, setMessages] = useState<Array<{ id: string; sender_type: string; sender_user_id: string | null; sender_customer_id: string | null; text: string; attachments: object[]; created_at: string; status_change?: string }>>([])
  const [chatText, setChatText] = useState('')
  const [status, setStatus] = useState(submission.status)
  const [user, setUser] = useState<{ id: string } | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user ? { id: user.id } : null))
    supabase.from('assignment_messages').select('*').eq('submission_id', submission.id).order('created_at').then(({ data }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setMessages(((data as any[]) ?? []))
    })
  }, [submission.id, supabase])

  async function setNewStatus(newStatus: string, withMessage?: boolean) {
    if (!user) return
    await supabase.from('assignment_submissions').update({
      status: newStatus, reviewed_at: new Date().toISOString(), reviewed_by: user.id,
    }).eq('id', submission.id)
    if (withMessage && chatText.trim()) {
      await supabase.from('assignment_messages').insert({
        submission_id: submission.id,
        sender_type: 'curator',
        sender_user_id: user.id,
        text: chatText.trim(),
        status_change: newStatus,
      })
      setChatText('')
    } else {
      // Сис.сообщение об изменении статуса
      await supabase.from('assignment_messages').insert({
        submission_id: submission.id,
        sender_type: 'curator',
        sender_user_id: user.id,
        text: '',
        status_change: newStatus,
      })
    }
    setStatus(newStatus)
    const { data } = await supabase.from('assignment_messages').select('*').eq('submission_id', submission.id).order('created_at')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setMessages(((data as any[]) ?? []))
  }

  async function sendMessage() {
    if (!user || !chatText.trim()) return
    await supabase.from('assignment_messages').insert({
      submission_id: submission.id,
      sender_type: 'curator',
      sender_user_id: user.id,
      text: chatText.trim(),
    })
    setChatText('')
    const { data } = await supabase.from('assignment_messages').select('*').eq('submission_id', submission.id).order('created_at')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setMessages(((data as any[]) ?? []))
  }

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-800">← К списку</button>

      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <h1 className="text-xl font-bold text-gray-900">{submission.customer_name}</h1>
          <StatusBadge status={status} />
          {submission.attempt_number > 1 && <span className="text-xs text-gray-500">попытка {submission.attempt_number}</span>}
        </div>
        <div className="text-sm text-gray-600">
          <div>{submission.assignment_title} · <span className="text-gray-500">{submission.lesson_name}</span></div>
          <div className="text-xs text-gray-500 mt-1">
            {submission.product_name && `${submission.product_name} · `}{submission.course_name}
            {submission.customer_email && ` · ${submission.customer_email}`}
            {submission.customer_public_code && ` · ${submission.customer_public_code}`}
          </div>
        </div>
      </div>

      {/* Содержимое сабмита */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="text-xs font-semibold text-gray-500 mb-3">Ответ ученика</div>
        {submission.content?.text && (
          <div className="bg-gray-50 rounded-lg p-3 text-sm whitespace-pre-wrap">{submission.content.text}</div>
        )}
        {submission.content?.files && (
          <div className="space-y-1">
            {submission.content.files.map((f: { name: string; url: string }, i: number) => (
              <a key={i} href={f.url} download target="_blank" rel="noopener noreferrer" className="text-sm text-[#6A55F8] hover:underline block">📎 {f.name}</a>
            ))}
          </div>
        )}
        {submission.content?.answers && (
          <div className="text-sm">
            <div className="text-gray-700">Тест: <span className="font-semibold">{submission.score ?? 0}</span> баллов{submission.errors_count != null && `, ошибок: ${submission.errors_count}`}</div>
          </div>
        )}
        {submission.content?.video_url && (
          <video src={submission.content.video_url} controls className="w-full max-w-2xl rounded-lg" />
        )}
        {!submission.content && <div className="text-sm text-gray-400">Пусто</div>}
      </div>

      {/* Действия куратора */}
      {status !== 'accepted' && status !== 'rejected' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="text-xs font-semibold text-gray-500 mb-3">Действия</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setNewStatus('accepted', !!chatText.trim())}
              className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium">
              ✓ Принять
            </button>
            <button onClick={() => setNewStatus('needs_revision', !!chatText.trim())}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium">
              На доработку
            </button>
            <button onClick={() => setNewStatus('rejected', !!chatText.trim())}
              className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium">
              Отклонить
            </button>
          </div>
        </div>
      )}

      {/* Диалог */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="text-xs font-semibold text-gray-500 mb-3">Диалог</div>
        <div className="space-y-2 max-h-96 overflow-auto mb-4">
          {messages.map(m => (
            <div key={m.id} className={`text-sm ${m.sender_type === 'curator' ? '' : 'pl-6'}`}>
              <div className={`inline-block px-3 py-2 rounded-lg ${m.sender_type === 'curator' ? 'bg-[#6A55F8]/10' : 'bg-gray-100'}`}>
                <div className="text-xs text-gray-500 mb-0.5">
                  {m.sender_type === 'curator' ? 'Вы' : submission.customer_name} · {new Date(m.created_at).toLocaleString('ru')}
                  {m.status_change && <span className="ml-2 text-gray-400">→ статус: {m.status_change}</span>}
                </div>
                {m.text && <div className="whitespace-pre-wrap">{m.text}</div>}
              </div>
            </div>
          ))}
          {messages.length === 0 && <div className="text-xs text-gray-400">Сообщений ещё нет</div>}
        </div>
        <div className="flex gap-2">
          <input type="text" value={chatText} onChange={e => setChatText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder="Написать ученику…"
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm" />
          <button onClick={sendMessage} disabled={!chatText.trim()}
            className="px-4 py-2 rounded-lg bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium disabled:opacity-40">
            Отправить
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Текст из этого поля приложится к действиям выше как комментарий куратора.</p>
      </div>
    </div>
  )
}
