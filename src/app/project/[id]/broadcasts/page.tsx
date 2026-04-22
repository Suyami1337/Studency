'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import RichTextEditor from '@/components/RichTextEditor'

type Broadcast = {
  id: string
  name: string
  status: string
  text: string | null
  media_url: string | null
  media_type: string | null
  telegram_bot_id: string | null
  segment_type: string
  segment_value: string | null
  total_recipients: number
  sent_count: number
  failed_count: number
  sent_at: string | null
  created_at: string
}

type Bot = { id: string; name: string }
type FunnelStage = { id: string; name: string; funnel_name: string }

export default function BroadcastsPage() {
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()

  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [bots, setBots] = useState<Bot[]>([])
  const [stages, setStages] = useState<FunnelStage[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedBroadcast, setSelectedBroadcast] = useState<Broadcast | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [botId, setBotId] = useState('')
  const [channel, setChannel] = useState<'telegram' | 'email' | 'both'>('telegram')
  const [emailSubject, setEmailSubject] = useState('')
  const [text, setText] = useState('')
  const [segmentType, setSegmentType] = useState<'all' | 'funnel_stage' | 'source' | 'tag'>('all')
  const [segmentValue, setSegmentValue] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [brRes, botsRes, stagesRes] = await Promise.all([
      fetch(`/api/broadcasts?project_id=${projectId}`).then(r => r.json()),
      supabase.from('telegram_bots').select('id, name').eq('project_id', projectId),
      supabase.from('funnel_stages').select('id, name, funnels!inner(name, project_id)')
        .eq('funnels.project_id', projectId),
    ])
    setBroadcasts(brRes.broadcasts ?? [])
    setBots((botsRes.data ?? []) as Bot[])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setStages(((stagesRes.data ?? []) as any[]).map(s => ({
      id: s.id, name: s.name, funnel_name: s.funnels.name,
    })))
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function handleCreate() {
    if (!name.trim() || !text.trim()) {
      alert('Заполни название и текст')
      return
    }
    if ((channel === 'telegram' || channel === 'both') && !botId) {
      alert('Для Telegram-канала выбери бота')
      return
    }
    if ((channel === 'email' || channel === 'both') && !emailSubject.trim()) {
      alert('Для email-канала заполни тему письма')
      return
    }
    setSaving(true)
    await fetch('/api/broadcasts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        telegram_bot_id: botId || null,
        name, text,
        channel,
        email_subject: emailSubject || null,
        segment_type: segmentType,
        segment_value: segmentValue || null,
      }),
    })
    setShowCreate(false)
    setName('')
    setText('')
    setBotId('')
    setChannel('telegram')
    setEmailSubject('')
    setSegmentType('all')
    setSegmentValue('')
    setSaving(false)
    await load()
  }

  async function handleSend(id: string) {
    if (!confirm('Запустить рассылку? Это действие необратимо.')) return
    const res = await fetch(`/api/broadcasts/${id}/send`, { method: 'POST' })
    const json = await res.json()
    if (json.error) alert('Ошибка: ' + json.error)
    else alert(`Отправлено ${json.sent} из ${json.total}`)
    await load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Удалить рассылку?')) return
    await fetch(`/api/broadcasts?id=${id}`, { method: 'DELETE' })
    await load()
  }

  const statusLabel = (s: string) => {
    switch (s) {
      case 'draft': return { label: 'Черновик', color: 'bg-gray-100 text-gray-600' }
      case 'sending': return { label: 'Отправка…', color: 'bg-amber-100 text-amber-700' }
      case 'sent': return { label: 'Отправлено', color: 'bg-green-100 text-green-700' }
      case 'failed': return { label: 'Ошибка', color: 'bg-red-100 text-red-700' }
      default: return { label: s, color: 'bg-gray-100 text-gray-600' }
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Рассылки</h1>
          <p className="text-sm text-gray-500 mt-0.5">Массовая отправка сообщений по сегменту клиентов</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-[#6A55F8] text-white text-sm font-medium rounded-lg hover:bg-[#5845e0]">
          + Новая рассылка
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Загрузка…</div>
      ) : broadcasts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-2">📢</div>
          <p className="text-sm text-gray-500">Пока нет рассылок</p>
        </div>
      ) : (
        <div className="space-y-2">
          {broadcasts.map(b => {
            const sl = statusLabel(b.status)
            return (
              <div key={b.id}
                onClick={() => setSelectedBroadcast(b)}
                className="bg-white rounded-xl border border-gray-100 p-4 hover:border-[#6A55F8]/40 cursor-pointer transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">{b.name}</h3>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${sl.color}`}>{sl.label}</span>
                    </div>
                    {b.text && <p className="text-xs text-gray-500 truncate">{b.text}</p>}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                      <span>Сегмент: {b.segment_type === 'all' ? 'все клиенты' : b.segment_type}</span>
                      {b.sent_count > 0 && (
                        <span>Отправлено: {b.sent_count}/{b.total_recipients}</span>
                      )}
                      <span>{new Date(b.created_at).toLocaleString('ru')}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    {b.status === 'draft' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSend(b.id) }}
                        className="px-3 py-1 text-xs bg-[#6A55F8] text-white rounded hover:bg-[#5845e0]">
                        Отправить
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(b.id) }}
                      className="text-[10px] text-gray-400 hover:text-red-500">
                      Удалить
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Новая рассылка</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Название</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Например: Скидка 20% на курс"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
              </div>

              {/* Channel selector */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Канал</label>
                <div className="flex gap-2">
                  {([
                    { id: 'telegram' as const, label: '💬 Telegram' },
                    { id: 'email' as const, label: '✉️ Email' },
                    { id: 'both' as const, label: '📢 Оба' },
                  ]).map(ch => (
                    <button key={ch.id} type="button" onClick={() => setChannel(ch.id)}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        channel === ch.id
                          ? 'bg-[#6A55F8] text-white border-[#6A55F8]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-[#6A55F8]/40'
                      }`}>
                      {ch.label}
                    </button>
                  ))}
                </div>
              </div>

              {(channel === 'telegram' || channel === 'both') && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Бот</label>
                  <select value={botId} onChange={e => setBotId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
                    <option value="">— Выбери бота —</option>
                    {bots.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}

              {(channel === 'email' || channel === 'both') && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Тема письма</label>
                  <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
                    placeholder="Например: Старт нового курса уже скоро"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Текст сообщения</label>
                <RichTextEditor
                  value={text}
                  onChange={setText}
                  placeholder="Текст который отправится всем клиентам…"
                  rows={5}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Сегмент</label>
                <select value={segmentType}
                  onChange={e => { setSegmentType(e.target.value as 'all' | 'funnel_stage' | 'source' | 'tag'); setSegmentValue('') }}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
                  <option value="all">Все клиенты</option>
                  <option value="funnel_stage">По этапу воронки</option>
                  <option value="tag">По тегу</option>
                  <option value="source">По источнику трафика</option>
                </select>
              </div>
              {segmentType === 'funnel_stage' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Этап воронки</label>
                  <select value={segmentValue} onChange={e => setSegmentValue(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
                    <option value="">— Выбери этап —</option>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.funnel_name} / {s.name}</option>)}
                  </select>
                </div>
              )}
              {segmentType === 'tag' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Тег</label>
                  <input type="text" value={segmentValue} onChange={e => setSegmentValue(e.target.value)}
                    placeholder="vip, active и т.д."
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
                </div>
              )}
              {segmentType === 'source' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Slug источника</label>
                  <input type="text" value={segmentValue} onChange={e => setSegmentValue(e.target.value)}
                    placeholder="instagram, vk-ads и т.д."
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
                </div>
              )}
            </div>
            <div className="p-5 border-t border-gray-100 flex items-center justify-end gap-2">
              <button onClick={() => setShowCreate(false)}
                className="px-3 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100">
                Отмена
              </button>
              <button onClick={handleCreate} disabled={saving}
                className="px-4 py-2 text-sm font-semibold bg-[#6A55F8] text-white rounded-lg hover:bg-[#5845e0] disabled:opacity-50">
                {saving ? 'Сохраняю…' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selectedBroadcast && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedBroadcast(null)}>
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">{selectedBroadcast.name}</h3>
              <button onClick={() => setSelectedBroadcast(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <div>
                <p className="text-xs text-gray-500 mb-1">Текст</p>
                <p className="text-gray-900 whitespace-pre-line">{selectedBroadcast.text}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Получателей</p>
                  <p className="text-lg font-bold">{selectedBroadcast.total_recipients}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Отправлено</p>
                  <p className="text-lg font-bold text-green-600">{selectedBroadcast.sent_count}</p>
                </div>
              </div>
              {selectedBroadcast.failed_count > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Ошибок</p>
                  <p className="text-sm text-red-600">{selectedBroadcast.failed_count}</p>
                </div>
              )}
              {selectedBroadcast.sent_at && (
                <p className="text-xs text-gray-500">
                  Отправлено: {new Date(selectedBroadcast.sent_at).toLocaleString('ru')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
