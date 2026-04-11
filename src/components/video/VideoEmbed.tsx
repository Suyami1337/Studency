'use client'

/**
 * VideoEmbed — встраиваемый Kinescope плеер с трекингом просмотров.
 *
 * Что делает:
 * - Рендерит Kinescope iframe
 * - Слушает postMessage события от плеера (play/pause/timeupdate/ended)
 * - Получает visitor_token через /api/visitor/token
 * - Отправляет события в /api/videos/track (start/progress/complete)
 * - Дебаунсит прогресс-обновления (не чаще раза в 10 секунд)
 * - На unload отправляет финальный статус через sendBeacon
 *
 * Использование:
 *   <VideoEmbed videoId="UUID-in-studency" />
 */

import { useEffect, useRef, useState } from 'react'

type Props = {
  /** Studency video UUID (из таблицы videos) */
  videoId: string
  /** Дополнительные query params для Kinescope embed URL */
  playerOptions?: {
    color?: string
    autoplay?: boolean
    muted?: boolean
  }
  className?: string
}

type VideoMeta = {
  kinescope_id: string | null
  embed_url: string | null
  title: string
}

/**
 * Kinescope postMessage protocol:
 * Плеер шлёт события как { type: 'kinescope:<event>', data: ... }
 * Поддерживаемые события: play, pause, timeupdate, ended, ready
 *
 * Docs: https://docs.kinescope.ru/instrukcii-dlya-razrabotchikov/api-pleera/
 */

export default function VideoEmbed({ videoId, playerOptions, className }: Props) {
  const [meta, setMeta] = useState<VideoMeta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Session ID для данного просмотра (не меняется пока открыта страница)
  const sessionIdRef = useRef<string>('')
  if (!sessionIdRef.current) {
    sessionIdRef.current = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  }

  const visitorTokenRef = useRef<string | null>(null)
  const lastReportedAtRef = useRef<number>(0)
  const maxPositionRef = useRef<number>(0)
  const watchTimeRef = useRef<number>(0)
  const durationRef = useRef<number>(0)
  const startedRef = useRef<boolean>(false)
  const completedRef = useRef<boolean>(false)

  // 1. Загружаем метаданные видео + visitor token
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        // Параллельно: видео + visitor token
        const [metaRes, tokenRes] = await Promise.all([
          fetch(`/api/videos/${videoId}`),
          fetch('/api/visitor/token'),
        ])

        if (!metaRes.ok) {
          setError('Видео не найдено')
          return
        }

        const metaData = await metaRes.json()
        const tokenData = await tokenRes.json()

        if (cancelled) return

        setMeta({
          kinescope_id: metaData.video?.kinescope_id ?? null,
          embed_url: metaData.video?.embed_url ?? null,
          title: metaData.video?.title ?? 'Видео',
        })
        visitorTokenRef.current = tokenData.token ?? null
      } catch (err) {
        console.error('VideoEmbed init error:', err)
        setError('Ошибка загрузки')
      }
    }

    init()
    return () => { cancelled = true }
  }, [videoId])

  // 2. Функция трекинга
  const track = (event?: 'start' | 'progress' | 'complete') => {
    const body = {
      video_id: videoId,
      session_id: sessionIdRef.current,
      visitor_token: visitorTokenRef.current,
      watch_time_seconds: Math.round(watchTimeRef.current),
      max_position_seconds: Math.round(maxPositionRef.current),
      completed: completedRef.current,
      event,
    }

    // Для события unload используем sendBeacon (гарантированная доставка)
    if (event === 'complete' && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(body)], { type: 'application/json' })
      navigator.sendBeacon('/api/videos/track', blob)
      return
    }

    fetch('/api/videos/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // keepalive — чтобы запрос дошёл даже если пользователь закрыл вкладку
      keepalive: true,
    }).catch(() => { /* ignore — это не критично */ })
  }

  // 3. Слушаем postMessage от Kinescope iframe
  useEffect(() => {
    if (!meta?.kinescope_id) return

    const handleMessage = (e: MessageEvent) => {
      // Kinescope шлёт с origin https://kinescope.io
      if (!e.origin.includes('kinescope.io')) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = e.data

      // Разные версии плеера шлют разные форматы:
      // { event: 'play' } или { type: 'kinescope:play' } или 'play'
      const eventType = (data?.event ?? data?.type ?? '').toString().replace(/^kinescope[:.]/, '')

      switch (eventType) {
        case 'ready':
        case 'play': {
          if (!startedRef.current) {
            startedRef.current = true
            track('start')
          }
          break
        }
        case 'timeupdate': {
          const current = Number(data?.data?.currentTime ?? data?.currentTime ?? 0)
          const duration = Number(data?.data?.duration ?? data?.duration ?? durationRef.current)
          if (duration > 0) durationRef.current = duration
          if (current > maxPositionRef.current) maxPositionRef.current = current
          watchTimeRef.current = Math.max(watchTimeRef.current, current)

          // Проверка досмотра (>= 90%)
          if (duration > 0 && current / duration >= 0.9 && !completedRef.current) {
            completedRef.current = true
            track('complete')
          }

          // Дебаунс: прогресс не чаще чем раз в 10 секунд
          const now = Date.now()
          if (now - lastReportedAtRef.current > 10_000) {
            lastReportedAtRef.current = now
            track('progress')
          }
          break
        }
        case 'ended': {
          completedRef.current = true
          if (durationRef.current > 0) {
            watchTimeRef.current = durationRef.current
            maxPositionRef.current = durationRef.current
          }
          track('complete')
          break
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [meta?.kinescope_id, videoId])

  // 4. На unload — финальный репорт
  useEffect(() => {
    const handleUnload = () => {
      if (startedRef.current && !completedRef.current) {
        track('progress')
      }
    }

    window.addEventListener('beforeunload', handleUnload)
    window.addEventListener('pagehide', handleUnload)
    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      window.removeEventListener('pagehide', handleUnload)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 5. Рендер
  if (error) {
    return (
      <div className={`bg-gray-100 rounded-lg flex items-center justify-center aspect-video ${className ?? ''}`}>
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    )
  }

  if (!meta?.kinescope_id) {
    return (
      <div className={`bg-gray-900 rounded-lg flex items-center justify-center aspect-video ${className ?? ''}`}>
        <div className="text-gray-500 text-sm">Загрузка…</div>
      </div>
    )
  }

  // Собираем embed URL
  const base = meta.embed_url ?? `https://kinescope.io/embed/${meta.kinescope_id}`
  const params = new URLSearchParams()
  if (playerOptions?.color) params.set('color', playerOptions.color.replace('#', ''))
  if (playerOptions?.autoplay) params.set('autoplay', '1')
  if (playerOptions?.muted) params.set('muted', '1')
  const src = params.toString() ? `${base}?${params}` : base

  return (
    <div className={`aspect-video bg-black rounded-lg overflow-hidden ${className ?? ''}`}>
      <iframe
        ref={iframeRef}
        src={src}
        className="w-full h-full"
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media;"
        allowFullScreen
        title={meta.title}
      />
    </div>
  )
}
