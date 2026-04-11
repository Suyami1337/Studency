'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Video = {
  id: string
  title: string
  description: string | null
  kinescope_id: string | null
  kinescope_status: string
  embed_url: string | null
  thumbnail_url: string | null
  duration_seconds: number | null
  file_size_bytes: number | null
  created_at: string
}

type VideoView = {
  id: string
  video_id: string
  customer_id: string | null
  watch_time_seconds: number
  max_position_seconds: number
  completed: boolean
  started_at: string
  last_seen_at: string
  session_id: string
}

type CustomerInfo = { id: string; full_name: string | null; telegram_username: string | null }

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

type PlayerSettings = {
  accent_color?: string
  autoplay?: boolean
  muted?: boolean
  show_title?: boolean
}

function buildPlayerUrl(kinescopeId: string, settings: PlayerSettings | null): string {
  const base = `https://kinescope.io/embed/${kinescopeId}`
  if (!settings) return base
  const params = new URLSearchParams()
  if (settings.accent_color) params.set('color', settings.accent_color.replace('#', ''))
  if (settings.autoplay) params.set('autoplay', '1')
  if (settings.muted) params.set('muted', '1')
  if (settings.show_title === false) params.set('title', '0')
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

export default function VideoDetailPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const videoId = params.videoId as string
  const supabase = createClient()

  const [tab, setTab] = useState<'player' | 'analytics' | 'users' | 'settings'>('player')
  const [video, setVideo] = useState<Video | null>(null)
  const [loading, setLoading] = useState(true)
  const [views, setViews] = useState<VideoView[]>([])
  const [customers, setCustomers] = useState<Map<string, CustomerInfo>>(new Map())
  const [playerSettings, setPlayerSettings] = useState<PlayerSettings | null>(null)

  // Settings form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: v } = await supabase.from('videos').select('*').eq('id', videoId).single()
    if (v) {
      setVideo(v as Video)
      setTitle(v.title)
      setDescription(v.description ?? '')
    }

    // Загружаем player_settings проекта
    const { data: proj } = await supabase.from('projects')
      .select('player_settings').eq('id', projectId).single()
    if (proj?.player_settings) {
      setPlayerSettings(proj.player_settings as PlayerSettings)
    }

    const { data: vw } = await supabase.from('video_views')
      .select('*')
      .eq('video_id', videoId)
      .order('last_seen_at', { ascending: false })
    setViews((vw ?? []) as VideoView[])

    // Load customer info for views
    const customerIds = Array.from(new Set((vw ?? []).map(v => v.customer_id).filter(Boolean))) as string[]
    if (customerIds.length > 0) {
      const { data: custs } = await supabase.from('customers')
        .select('id, full_name, telegram_username')
        .in('id', customerIds)
      const m = new Map<string, CustomerInfo>()
      for (const c of (custs ?? []) as CustomerInfo[]) m.set(c.id, c)
      setCustomers(m)
    }

    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId])

  useEffect(() => { load() }, [load])

  async function handleSave() {
    if (!isDirty) return
    setSaving(true)
    await fetch(`/api/videos/${videoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description }),
    })
    setIsDirty(false)
    setSaving(false)
    await load()
  }

  async function handleDelete() {
    if (!confirm('Удалить видео навсегда?')) return
    await fetch(`/api/videos/${videoId}`, { method: 'DELETE' })
    router.push(`/project/${projectId}/videos`)
  }

  // Aggregate analytics
  const totalViews = views.length
  const uniqueCustomers = new Set(views.map(v => v.customer_id).filter(Boolean)).size
  const completedViews = views.filter(v => v.completed).length
  const totalWatchTime = views.reduce((sum, v) => sum + (v.watch_time_seconds ?? 0), 0)
  const avgWatchTime = views.length > 0 ? Math.round(totalWatchTime / views.length) : 0
  const completionRate = views.length > 0 ? Math.round((completedViews / views.length) * 100) : 0

  if (loading) return <div className="text-center py-12 text-sm text-gray-400">Загрузка…</div>
  if (!video) return <div className="text-center py-12 text-sm text-gray-400">Видео не найдено</div>

  return (
    <div className="max-w-6xl mx-auto">
      {/* Breadcrumb + Header */}
      <div className="mb-4">
        <button onClick={() => router.push(`/project/${projectId}/videos`)}
          className="text-xs text-gray-500 hover:text-[#6A55F8] mb-2">
          ← Все видео
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{video.title}</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Статус: <span className="font-medium">{video.kinescope_status}</span>
          {video.kinescope_id && <> · ID: <code className="bg-gray-100 px-1 rounded">{video.kinescope_id}</code></>}
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-100 mb-5">
        <div className="flex gap-1">
          {[
            { id: 'player', label: '▶ Плеер' },
            { id: 'analytics', label: '📊 Аналитика' },
            { id: 'users', label: '👥 Пользователи' },
            { id: 'settings', label: '⚙ Настройки' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as 'player' | 'analytics' | 'users' | 'settings')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id ? 'text-[#6A55F8] border-[#6A55F8]' : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Player */}
      {tab === 'player' && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="aspect-video bg-black rounded-lg overflow-hidden mb-4">
            {video.kinescope_id ? (
              <iframe
                src={buildPlayerUrl(video.kinescope_id, playerSettings)}
                className="w-full h-full"
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media;"
                allowFullScreen
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500">
                Плеер ещё не готов (видео обрабатывается)
              </div>
            )}
          </div>
          {video.description && (
            <p className="text-sm text-gray-600 whitespace-pre-line">{video.description}</p>
          )}
        </div>
      )}

      {/* Analytics */}
      {tab === 'analytics' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Всего просмотров" value={totalViews.toString()} />
            <StatCard label="Уникальных зрителей" value={uniqueCustomers.toString()} />
            <StatCard label="Досмотров до конца" value={`${completionRate}%`} />
            <StatCard label="Среднее время" value={formatDuration(avgWatchTime)} />
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Суммарное время просмотра</h3>
            <p className="text-3xl font-bold text-[#6A55F8]">{formatDuration(totalWatchTime)}</p>
            <p className="text-xs text-gray-500 mt-1">За всё время по всем зрителям</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Последние просмотры</h3>
            {views.length === 0 ? (
              <p className="text-sm text-gray-400">Пока нет просмотров</p>
            ) : (
              <div className="space-y-2">
                {views.slice(0, 10).map(v => {
                  const customer = v.customer_id ? customers.get(v.customer_id) : null
                  return (
                    <div key={v.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900">
                          {customer ? (customer.full_name || customer.telegram_username || 'Клиент') : 'Анонимный'}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(v.last_seen_at).toLocaleString('ru')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-700">{formatDuration(v.watch_time_seconds)}</p>
                        {v.completed && <span className="text-[10px] text-green-600">досмотрел</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Users */}
      {tab === 'users' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {views.filter(v => v.customer_id).length === 0 ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-2">👥</div>
              <p className="text-sm text-gray-500">Пока никто не смотрел</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Клиент</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Время просмотра</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Досмотрел до</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Статус</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Последний просмотр</th>
                </tr>
              </thead>
              <tbody>
                {views.filter(v => v.customer_id).map(v => {
                  const customer = customers.get(v.customer_id!)
                  return (
                    <tr key={v.id}
                      onClick={() => router.push(`/project/${projectId}/users?customer=${v.customer_id}`)}
                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                      <td className="px-5 py-3 text-sm text-gray-900">
                        {customer?.full_name || customer?.telegram_username || '—'}
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-700">{formatDuration(v.watch_time_seconds)}</td>
                      <td className="px-5 py-3 text-sm text-gray-700">{formatDuration(v.max_position_seconds)}</td>
                      <td className="px-5 py-3">
                        {v.completed ? (
                          <span className="text-xs text-green-600 font-medium">✓ Досмотрел</span>
                        ) : (
                          <span className="text-xs text-gray-400">В процессе</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {new Date(v.last_seen_at).toLocaleString('ru')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Settings */}
      {tab === 'settings' && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Название</label>
            <input
              type="text"
              value={title}
              onChange={e => { setTitle(e.target.value); setIsDirty(true) }}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Описание</label>
            <textarea
              value={description}
              onChange={e => { setDescription(e.target.value); setIsDirty(true) }}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] resize-none"
            />
          </div>

          {video.embed_url && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">URL для встраивания</label>
              <code className="block bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs text-gray-700 break-all">
                {video.embed_url}
              </code>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <button
              onClick={handleDelete}
              className="text-xs text-red-500 hover:text-red-700 hover:underline"
            >
              Удалить видео
            </button>
            {isDirty && (
              <div className="flex gap-2">
                <button
                  onClick={() => { setTitle(video.title); setDescription(video.description ?? ''); setIsDirty(false) }}
                  className="px-3 py-1.5 text-xs text-gray-500 rounded-lg hover:bg-gray-100"
                >
                  Отменить
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-1.5 text-xs font-semibold bg-[#6A55F8] text-white rounded-lg hover:bg-[#5845e0] disabled:opacity-50"
                >
                  {saving ? 'Сохраняю…' : 'Сохранить'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
