'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { listProjectMedia, deleteMediaForce, uploadMedia } from '@/lib/media-library'

// Free tier limit
const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024 // 1 GB

type MediaWithUsages = {
  id: string
  project_id: string
  storage_path: string
  public_url: string
  file_name: string
  mime_type: string
  media_type: string
  size_bytes: number
  uploaded_by: string | null
  uploaded_at: string
  usages: { id: string; media_id: string; usage_type: string; usage_id: string }[]
}

type UsageContext = {
  scenarioName?: string
  botName?: string
  messageText?: string
  orderPosition?: number
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function typeLabel(t: string): string {
  switch (t) {
    case 'photo': return '🖼 Фото'
    case 'video': return '🎬 Видео'
    case 'animation': return '🎞 GIF'
    case 'video_note': return '⭕ Кружок'
    case 'audio': return '🎵 Аудио'
    case 'document': return '📎 Файл'
    default: return t
  }
}

export default function MediaPage() {
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()
  const [items, setItems] = useState<MediaWithUsages[]>([])
  const [usageContexts, setUsageContexts] = useState<Map<string, UsageContext>>(new Map())
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [uploading, setUploading] = useState(false)
  const [selectedItem, setSelectedItem] = useState<MediaWithUsages | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await listProjectMedia(supabase, projectId)
    setItems(data as MediaWithUsages[])

    // Загружаем контекст для usages (scenario message → scenario name, bot name, message text)
    const msgUsageIds = new Set<string>()
    for (const item of data as MediaWithUsages[]) {
      for (const u of item.usages ?? []) {
        if (u.usage_type === 'scenario_message') msgUsageIds.add(u.usage_id)
      }
    }

    const ctxMap = new Map<string, UsageContext>()
    if (msgUsageIds.size > 0) {
      const { data: msgs } = await supabase
        .from('scenario_messages')
        .select('id, text, order_position, scenario_id')
        .in('id', Array.from(msgUsageIds))

      const scenarioIds = new Set<string>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const m of (msgs ?? []) as any[]) scenarioIds.add(m.scenario_id)

      const { data: scenarios } = await supabase
        .from('chatbot_scenarios')
        .select('id, name, telegram_bot_id')
        .in('id', Array.from(scenarioIds))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scenariosMap = new Map((scenarios ?? []).map((s: any) => [s.id, s]))

      const botIds = new Set<string>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const s of (scenarios ?? []) as any[]) if (s.telegram_bot_id) botIds.add(s.telegram_bot_id)

      const { data: bots } = await supabase
        .from('telegram_bots').select('id, name').in('id', Array.from(botIds))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const botsMap = new Map((bots ?? []).map((b: any) => [b.id, b]))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const m of (msgs ?? []) as any[]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sc = scenariosMap.get(m.scenario_id) as any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bot = sc ? botsMap.get(sc.telegram_bot_id) as any : null
        ctxMap.set(m.id, {
          scenarioName: sc?.name,
          botName: bot?.name,
          messageText: m.text,
          orderPosition: m.order_position,
        })
      }
    }
    setUsageContexts(ctxMap)
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      await uploadMedia(supabase, projectId, file)
      await load()
    } catch (err) {
      console.error('upload error:', err)
      alert(err instanceof Error ? err.message : 'Ошибка загрузки')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(item: MediaWithUsages) {
    const usageCount = item.usages?.length ?? 0
    const confirmMsg = usageCount > 0
      ? `Этот файл используется в ${usageCount} месте(ах). После удаления он исчезнет из всех сообщений. Продолжить?`
      : 'Удалить файл навсегда?'
    if (!confirm(confirmMsg)) return

    setDeleting(item.id)
    try {
      await deleteMediaForce(supabase, item.id)
      setSelectedItem(null)
      await load()
    } catch (err) {
      console.error('delete error:', err)
      alert('Ошибка удаления')
    } finally {
      setDeleting(null)
    }
  }

  const filteredItems = filter === 'all' ? items : items.filter(i => i.media_type === filter)
  const totalBytes = items.reduce((sum, i) => sum + i.size_bytes, 0)
  const usedPercent = Math.min(100, (totalBytes / STORAGE_LIMIT_BYTES) * 100)

  const types = [
    { id: 'all', label: 'Все', count: items.length },
    { id: 'photo', label: '🖼 Фото', count: items.filter(i => i.media_type === 'photo').length },
    { id: 'video', label: '🎬 Видео', count: items.filter(i => i.media_type === 'video').length },
    { id: 'animation', label: '🎞 GIF', count: items.filter(i => i.media_type === 'animation').length },
    { id: 'audio', label: '🎵 Аудио', count: items.filter(i => i.media_type === 'audio').length },
    { id: 'document', label: '📎 Файлы', count: items.filter(i => i.media_type === 'document').length },
  ]

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Хранилище</h1>
        <p className="text-sm text-gray-500">Все файлы проекта — фото, видео, аудио, документы</p>
      </div>

      {/* Storage usage */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">Использовано места</span>
          <span className="text-sm text-gray-500">
            {formatSize(totalBytes)} / {formatSize(STORAGE_LIMIT_BYTES)}
          </span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${usedPercent > 80 ? 'bg-red-500' : usedPercent > 60 ? 'bg-amber-500' : 'bg-[#6A55F8]'}`}
            style={{ width: `${usedPercent}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">{items.length} файлов</p>
      </div>

      {/* Filters + Upload */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {types.map(t => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === t.id ? 'bg-[#6A55F8] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-[#6A55F8]/40'
              }`}
            >
              {t.label} <span className="opacity-70">({t.count})</span>
            </button>
          ))}
        </div>
        <label className="px-4 py-2 bg-[#6A55F8] text-white text-sm font-medium rounded-lg hover:bg-[#5845e0] cursor-pointer flex items-center gap-2">
          <input
            type="file"
            className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
            onChange={ev => { const f = ev.target.files?.[0]; if (f) handleUpload(f) }}
            disabled={uploading}
          />
          {uploading ? 'Загрузка…' : '+ Загрузить файл'}
        </label>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Загрузка…</div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-2">📭</div>
          <p className="text-sm text-gray-500">Нет загруженных файлов</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filteredItems.map(item => (
            <button
              key={item.id}
              onClick={() => setSelectedItem(item)}
              className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:border-[#6A55F8]/40 transition-colors group text-left"
            >
              <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
                {item.media_type === 'photo' || item.media_type === 'animation' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.public_url} alt={item.file_name} className="w-full h-full object-cover" />
                ) : item.media_type === 'video' || item.media_type === 'video_note' ? (
                  <div className="text-4xl">🎬</div>
                ) : item.media_type === 'audio' ? (
                  <div className="text-4xl">🎵</div>
                ) : (
                  <div className="text-4xl">📎</div>
                )}
              </div>
              <div className="p-2.5">
                <p className="text-xs font-medium text-gray-700 truncate">{item.file_name}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-gray-400">{formatSize(item.size_bytes)}</span>
                  {item.usages?.length > 0 ? (
                    <span className="text-[10px] text-[#6A55F8] font-medium">⚡ {item.usages.length}</span>
                  ) : (
                    <span className="text-[10px] text-gray-300">не использ.</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setSelectedItem(null)}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold text-gray-900 truncate">{selectedItem.file_name}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{typeLabel(selectedItem.media_type)} · {formatSize(selectedItem.size_bytes)}</p>
              </div>
              <button onClick={() => setSelectedItem(null)} className="text-gray-400 hover:text-gray-600 text-xl ml-4">✕</button>
            </div>

            <div className="p-5 space-y-4">
              {/* Preview */}
              <div className="bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center">
                {selectedItem.media_type === 'photo' || selectedItem.media_type === 'animation' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedItem.public_url} alt={selectedItem.file_name} className="max-h-80 object-contain" />
                ) : selectedItem.media_type === 'video' || selectedItem.media_type === 'video_note' ? (
                  <video src={selectedItem.public_url} controls className="max-h-80" />
                ) : selectedItem.media_type === 'audio' ? (
                  <audio src={selectedItem.public_url} controls className="w-full m-4" />
                ) : (
                  <div className="py-12 text-center">
                    <div className="text-5xl mb-2">📎</div>
                    <a href={selectedItem.public_url} target="_blank" rel="noopener noreferrer" className="text-sm text-[#6A55F8] hover:underline">Открыть файл</a>
                  </div>
                )}
              </div>

              {/* Usages */}
              <div>
                <h4 className="text-xs font-semibold text-gray-700 mb-2">Где используется</h4>
                {selectedItem.usages?.length > 0 ? (
                  <div className="space-y-2">
                    {selectedItem.usages.map(u => {
                      const ctx = usageContexts.get(u.usage_id)
                      return (
                        <div key={u.id} className="bg-[#F8F7FF] border border-[#6A55F8]/15 rounded-lg p-3">
                          {u.usage_type === 'scenario_message' && (
                            <div className="text-xs">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-gray-400">🤖</span>
                                <span className="text-gray-600">{ctx?.botName ?? 'Бот'}</span>
                                <span className="text-gray-300">›</span>
                                <span className="text-gray-600">{ctx?.scenarioName ?? 'Сценарий'}</span>
                                <span className="text-gray-300">›</span>
                                <span className="text-[#6A55F8] font-medium">Сообщение #{(ctx?.orderPosition ?? 0) + 1}</span>
                              </div>
                              {ctx?.messageText && (
                                <p className="text-gray-500 truncate">{ctx.messageText}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Файл нигде не используется — можно безопасно удалить</p>
                )}
              </div>

              {/* Meta */}
              <div className="text-xs text-gray-500 space-y-0.5">
                <div>Загружен: {new Date(selectedItem.uploaded_at).toLocaleString('ru')}</div>
                <div>Тип: {selectedItem.mime_type}</div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                <a
                  href={selectedItem.public_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 px-3 py-2 bg-white border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 text-center"
                >
                  Открыть в новой вкладке
                </a>
                <button
                  onClick={() => handleDelete(selectedItem)}
                  disabled={deleting === selectedItem.id}
                  className="px-4 py-2 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50"
                >
                  {deleting === selectedItem.id ? 'Удаление…' : 'Удалить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
