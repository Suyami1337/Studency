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
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('videos')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    setVideos((data ?? []) as Video[])
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => { load() }, [load])

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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Видеохостинг</h1>
          <p className="text-sm text-gray-500 mt-0.5">Загрузка и аналитика видео через Kinescope</p>
        </div>
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
      </div>

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

      {/* Info banner if no API token configured */}
      {videos.length === 0 && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-amber-800 font-medium">Первая загрузка</p>
          <p className="text-xs text-amber-700 mt-1">
            Убедись что в Vercel Settings → Environment Variables установлен <code className="bg-amber-100 px-1 rounded">KINESCOPE_API_TOKEN</code>.
            Токен можно получить в личном кабинете Kinescope.
          </p>
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
    </div>
  )
}
