'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Video = {
  id: string
  title: string
  kinescope_id: string | null
  kinescope_status: string
  embed_url: string | null
  thumbnail_url: string | null
  duration_seconds: number | null
  file_size_bytes: number | null
  created_at: string
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export default function VideosPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const supabase = createClient()
  const [tab, setTab] = useState<'videos' | 'settings'>('videos')
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    // Синхронизируем статусы processing-видео с Kinescope (не блокирует первичную отрисовку)
    fetch('/api/videos/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId }),
    }).then(() => {
      // После синка перечитаем список
      supabase.from('videos')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .then(({ data }) => setVideos((data ?? []) as Video[]))
    }).catch(() => { /* ignore */ })

    // Первичная загрузка — сразу показываем что есть в БД
    const { data } = await supabase.from('videos')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    setVideos((data ?? []) as Video[])
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // Автообновление списка каждые 5 секунд пока есть видео в обработке
  useEffect(() => { load() }, [load])

  useEffect(() => {
    const hasProcessing = videos.some(v => v.kinescope_status !== 'done' && v.kinescope_status !== 'ready')
    if (!hasProcessing) return
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [videos, load])

  async function handleFile(file: File) {
    setUploadError(null)
    setUploading(true)
    setUploadProgress('Загрузка в Kinescope…')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('project_id', projectId)
      form.append('title', file.name)

      const res = await fetch('/api/videos/upload', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) {
        setUploadError(json.error ?? 'Ошибка загрузки')
        if (json.hint) setUploadError(`${json.error}\n${json.hint}`)
        return
      }
      setUploadProgress('Готово!')
      await load()
    } catch (err) {
      console.error('upload error:', err)
      setUploadError(err instanceof Error ? err.message : 'Ошибка загрузки')
    } finally {
      setUploading(false)
      setTimeout(() => setUploadProgress(null), 2000)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Удалить это видео навсегда?')) return
    await fetch(`/api/videos/${id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Видеохостинг</h1>
          <p className="text-sm text-gray-500 mt-0.5">Загрузка и аналитика видео</p>
        </div>
        {tab === 'videos' && (
          <label className="px-4 py-2 bg-[#6A55F8] text-white text-sm font-medium rounded-lg hover:bg-[#5845e0] cursor-pointer flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              disabled={uploading}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
            {uploading ? '⏳ Загрузка…' : '+ Загрузить видео'}
          </label>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-100 mb-5">
        <div className="flex gap-1">
          {[
            { id: 'videos', label: '🎬 Видео' },
            { id: 'settings', label: '🎨 Настройки плеера' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as 'videos' | 'settings')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id ? 'text-[#6A55F8] border-[#6A55F8]' : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'settings' && <PlayerSettingsTab projectId={projectId} />}

      {tab === 'videos' && (
        <>
          {uploadProgress && (
            <div className="bg-[#F0EDFF] border border-[#6A55F8]/20 rounded-lg p-3 mb-4 text-sm text-[#6A55F8]">
              {uploadProgress}
            </div>
          )}
          {uploadError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700 whitespace-pre-line">
              {uploadError}
            </div>
          )}

          {/* Grid */}
          {loading ? (
            <div className="text-center py-12 text-sm text-gray-400">Загрузка…</div>
          ) : videos.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
              <div className="text-4xl mb-2">🎬</div>
              <p className="text-sm text-gray-500 mb-1">Нет загруженных видео</p>
              <p className="text-xs text-gray-400">Нажми &ldquo;Загрузить видео&rdquo; чтобы начать</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {videos.map(v => (
                <div
                  key={v.id}
                  onClick={() => router.push(`/project/${projectId}/videos/${v.id}`)}
                  className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:border-[#6A55F8]/40 hover:shadow-sm transition-all cursor-pointer group"
                >
                  <div className="aspect-video bg-gray-900 relative overflow-hidden flex items-center justify-center">
                    {v.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.thumbnail_url} alt={v.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-4xl opacity-50">🎬</div>
                    )}
                    {v.kinescope_status !== 'ready' && v.kinescope_status !== 'done' && (
                      <div className="absolute top-2 right-2 bg-amber-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                        {v.kinescope_status === 'processing' ? 'Обработка' : v.kinescope_status === 'pending' ? 'Ожидает' : v.kinescope_status}
                      </div>
                    )}
                    {v.duration_seconds && (
                      <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                        {formatDuration(v.duration_seconds)}
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium text-gray-900 truncate">{v.title}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-gray-400">{formatSize(v.file_size_bytes)}</span>
                      <button
                        onClick={(e) => handleDelete(v.id, e)}
                        className="text-[10px] text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// =============================================================================
// PLAYER SETTINGS TAB
// =============================================================================
type PlayerSettings = {
  accent_color?: string
  logo_url?: string
  logo_media_id?: string
  watermark?: boolean
  autoplay?: boolean
  muted?: boolean
  show_title?: boolean
}

function PlayerSettingsTab({ projectId }: { projectId: string }) {
  const [settings, setSettings] = useState<PlayerSettings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/videos/player-settings?project_id=${projectId}`)
      .then(r => r.json())
      .then(json => {
        setSettings(json.settings ?? {})
        setLoading(false)
      })
  }, [projectId])

  async function handleSave() {
    setSaving(true)
    setSavedMsg(null)
    const res = await fetch('/api/videos/player-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, settings }),
    })
    const json = await res.json()
    if (json.ok) {
      setSavedMsg(`✅ Сохранено. Применено к ${json.applied_to} видео.`)
    } else {
      setSavedMsg('❌ Ошибка: ' + (json.error ?? 'unknown'))
    }
    setSaving(false)
    setTimeout(() => setSavedMsg(null), 4000)
  }

  if (loading) return <div className="text-center py-8 text-sm text-gray-400">Загрузка…</div>

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-1">Кастомизация плеера</h2>
        <p className="text-xs text-gray-500">Настройки применятся ко всем видео проекта — и к новым, и к уже загруженным</p>
      </div>

      {/* Accent color */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">Акцентный цвет</label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={settings.accent_color ?? '#6A55F8'}
            onChange={e => setSettings({ ...settings, accent_color: e.target.value })}
            className="w-12 h-10 rounded border border-gray-200 cursor-pointer"
          />
          <input
            type="text"
            value={settings.accent_color ?? ''}
            onChange={e => setSettings({ ...settings, accent_color: e.target.value })}
            placeholder="#6A55F8"
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:border-[#6A55F8]"
          />
        </div>
        <p className="text-[10px] text-gray-400 mt-1">Цвет прогресс-бара и кнопки Play</p>
      </div>

      {/* Logo */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">Логотип на плеере</label>
        <input
          type="text"
          value={settings.logo_url ?? ''}
          onChange={e => setSettings({ ...settings, logo_url: e.target.value })}
          placeholder="https://..."
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]"
        />
        <p className="text-[10px] text-gray-400 mt-1">URL картинки (PNG/SVG) — появится в углу плеера</p>
      </div>

      {/* Flags */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.watermark ?? false}
            onChange={e => setSettings({ ...settings, watermark: e.target.checked })}
            className="rounded border-gray-300 text-[#6A55F8]"
          />
          <span className="text-sm text-gray-700">Водяной знак (защита от копирования)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.autoplay ?? false}
            onChange={e => setSettings({ ...settings, autoplay: e.target.checked })}
            className="rounded border-gray-300 text-[#6A55F8]"
          />
          <span className="text-sm text-gray-700">Автовоспроизведение</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.muted ?? false}
            onChange={e => setSettings({ ...settings, muted: e.target.checked })}
            className="rounded border-gray-300 text-[#6A55F8]"
          />
          <span className="text-sm text-gray-700">Без звука по умолчанию</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.show_title !== false}
            onChange={e => setSettings({ ...settings, show_title: e.target.checked })}
            className="rounded border-gray-300 text-[#6A55F8]"
          />
          <span className="text-sm text-gray-700">Показывать название видео</span>
        </label>
      </div>

      {savedMsg && (
        <div className={`rounded-lg p-3 text-sm ${savedMsg.startsWith('✅') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {savedMsg}
        </div>
      )}

      <div className="flex justify-end pt-3 border-t border-gray-100">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-[#6A55F8] text-white text-sm font-semibold rounded-lg hover:bg-[#5845e0] disabled:opacity-50"
        >
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}
