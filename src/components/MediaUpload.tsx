'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

// =============================================
// MEDIA PICKER MODAL — выбор существующего файла из библиотеки
// =============================================
export function MediaPickerModal({ projectId, onPick, onClose }: {
  projectId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onPick: (item: any) => void
  onClose: () => void
}) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    import('@/lib/media-library').then(({ listProjectMedia }) => {
      listProjectMedia(supabase, projectId).then(data => {
        setItems(data)
        setLoading(false)
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const filtered = filter === 'all' ? items : items.filter(i => i.media_type === filter)

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Выбрать из медиа-библиотеки</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="p-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          {[
            { id: 'all', label: 'Все' },
            { id: 'photo', label: '🖼 Фото' },
            { id: 'video', label: '🎬 Видео' },
            { id: 'animation', label: '🎞 GIF' },
            { id: 'audio', label: '🎵 Аудио' },
            { id: 'document', label: '📎 Файлы' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              className={`px-3 py-1 rounded text-xs font-medium ${
                filter === t.id ? 'bg-[#6A55F8] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center text-sm text-gray-400 py-8">Загрузка…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-sm text-gray-500">В медиа-библиотеке пока нет файлов</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {filtered.map(item => (
                <button
                  key={item.id}
                  onClick={() => { onPick(item); onClose() }}
                  className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:border-[#6A55F8] transition-colors text-left"
                >
                  <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
                    {item.media_type === 'photo' || item.media_type === 'animation' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.public_url} alt={item.file_name} className="w-full h-full object-cover" />
                    ) : item.media_type === 'video' || item.media_type === 'video_note' ? (
                      <div className="text-3xl">🎬</div>
                    ) : item.media_type === 'audio' ? (
                      <div className="text-3xl">🎵</div>
                    ) : (
                      <div className="text-3xl">📎</div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-[10px] font-medium text-gray-700 truncate">{item.file_name}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// =============================================
// MEDIA UPLOAD — загрузка / выбор из библиотеки
// =============================================
export function MediaUpload({ projectId, mediaId, mediaType, mediaUrl, mediaFileName, onChange }: {
  projectId: string
  mediaId: string | null
  mediaType: string | null
  mediaUrl: string | null
  mediaFileName: string | null
  onChange: (mediaId: string | null, type: string | null, url: string | null, fileName: string | null) => void
}) {
  const supabase = createClient()
  const inputId = React.useId()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sendAsVideoNote, setSendAsVideoNote] = useState(mediaType === 'video_note')
  const [pickerOpen, setPickerOpen] = useState(false)

  async function handleFile(file: File) {
    setError(null)
    setUploading(true)
    try {
      const { uploadMedia } = await import('@/lib/media-library')
      const item = await uploadMedia(supabase, projectId, file)
      onChange(item.id, item.media_type, item.public_url, item.file_name)
      setSendAsVideoNote(false)
    } catch (err) {
      console.error('upload error:', err)
      setError(err instanceof Error ? err.message : 'Ошибка загрузки')
    } finally {
      setUploading(false)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handlePickFromLibrary(item: any) {
    onChange(item.id, item.media_type, item.public_url, item.file_name)
    setSendAsVideoNote(false)
  }

  function handleRemove() {
    onChange(null, null, null, null)
    setSendAsVideoNote(false)
  }

  function toggleVideoNote() {
    const next = !sendAsVideoNote
    setSendAsVideoNote(next)
    onChange(mediaId, next ? 'video_note' : 'video', mediaUrl, mediaFileName)
  }

  const typeLabel = (t: string | null) => {
    switch (t) {
      case 'photo': return '🖼 Фото'
      case 'video': return '🎬 Видео'
      case 'animation': return '🎞 GIF'
      case 'video_note': return '⭕ Кружок'
      case 'audio': return '🎵 Аудио'
      case 'document': return '📎 Файл'
      default: return 'Вложение'
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">Вложение</label>

      {!mediaUrl ? (
        <div className="border border-dashed border-gray-300 rounded-lg p-3 text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
            <input
              type="file"
              id={inputId}
              className="hidden"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
              onChange={ev => {
                const f = ev.target.files?.[0]
                if (f) handleFile(f)
              }}
              disabled={uploading}
            />
            <label
              htmlFor={inputId}
              className="inline-block cursor-pointer text-xs text-[#6A55F8] font-medium hover:underline"
            >
              {uploading ? 'Загрузка…' : '+ Загрузить новый'}
            </label>
            <span className="text-xs text-gray-300">|</span>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="text-xs text-[#6A55F8] font-medium hover:underline"
            >
              🗂 Выбрать из библиотеки
            </button>
          </div>
          <p className="text-[10px] text-gray-400">Фото, видео, GIF, аудио, документы</p>
        </div>
      ) : (
        <div className="bg-[#F8F7FF] border border-[#6A55F8]/15 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#6A55F8]">{typeLabel(mediaType)}</span>
            <span className="text-xs text-gray-500 truncate flex-1">{mediaFileName}</span>
            <button onClick={handleRemove} className="text-xs text-gray-400 hover:text-red-500">✕ Удалить</button>
          </div>
          {(mediaType === 'photo' || mediaType === 'animation') && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl} alt="preview" className="max-h-40 rounded border border-gray-200" />
          )}
          {(mediaType === 'video' || mediaType === 'video_note') && (
            <video src={mediaUrl} controls className="max-h-40 rounded border border-gray-200" />
          )}
          {mediaType === 'audio' && (
            <audio src={mediaUrl} controls className="w-full" />
          )}
          {(mediaType === 'video' || mediaType === 'video_note') && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={sendAsVideoNote} onChange={toggleVideoNote}
                className="rounded border-gray-300 text-[#6A55F8] focus:ring-[#6A55F8]" />
              <span className="text-xs text-gray-600">Отправить как кружок (video note)</span>
            </label>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}

      {pickerOpen && (
        <MediaPickerModal
          projectId={projectId}
          onPick={handlePickFromLibrary}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
