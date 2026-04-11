// Kinescope API integration
// Docs: https://docs.kinescope.io/api
//
// Required env var: KINESCOPE_API_TOKEN (Bearer token from Kinescope dashboard)
// Architecture: один мастер-аккаунт, каждому project — своя папка (parent)

const KINESCOPE_API = 'https://api.kinescope.io/v1'

export type KinescopeVideo = {
  id: string
  title: string
  description?: string
  status: string
  embed_link?: string
  play_link?: string
  poster?: { url?: string }
  duration?: number
  quality_map?: unknown[]
}

export type KinescopeFolder = {
  id: string
  name: string
  parent_id?: string | null
}

export type KinescopeStatistics = {
  views?: number
  unique_views?: number
  watch_time?: number
  avg_view_duration?: number
  completion_rate?: number
}

export type PlayerSettings = {
  accent_color?: string      // HEX без решётки: "6A55F8"
  logo_url?: string          // URL логотипа
  logo_media_id?: string     // ID файла в медиа-библиотеке (для отслеживания usage)
  watermark?: boolean
  autoplay?: boolean
  muted?: boolean
  show_title?: boolean
}

function getToken(): string {
  const token = process.env.KINESCOPE_API_TOKEN
  if (!token) throw new Error('KINESCOPE_API_TOKEN env var is not set')
  return token
}

async function kinescopeRequest<T>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const token = getToken()
  const res = await fetch(`${KINESCOPE_API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(opts.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Kinescope API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

/**
 * Create a new video by uploading a file.
 * Kinescope supports multipart upload via POST /videos
 */
export async function uploadVideoToKinescope(
  file: Blob,
  fileName: string,
  title?: string,
  parentId?: string
): Promise<KinescopeVideo> {
  const token = getToken()
  const formData = new FormData()
  formData.append('file', file, fileName)
  if (title) formData.append('title', title)
  if (parentId) formData.append('parent_id', parentId)

  const res = await fetch(`${KINESCOPE_API}/videos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Kinescope upload ${res.status}: ${text}`)
  }
  const json = await res.json() as { data: KinescopeVideo }
  return json.data
}

export async function getKinescopeVideo(videoId: string): Promise<KinescopeVideo> {
  const json = await kinescopeRequest<{ data: KinescopeVideo }>(`/videos/${videoId}`)
  return json.data
}

export async function deleteKinescopeVideo(videoId: string): Promise<void> {
  await kinescopeRequest(`/videos/${videoId}`, { method: 'DELETE' })
}

export async function updateKinescopeVideo(
  videoId: string,
  updates: { title?: string; description?: string }
): Promise<KinescopeVideo> {
  const json = await kinescopeRequest<{ data: KinescopeVideo }>(`/videos/${videoId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  return json.data
}

/**
 * Get analytics/statistics for a video.
 * Note: actual Kinescope endpoint may vary; check their docs for exact path.
 */
export async function getKinescopeStatistics(videoId: string): Promise<KinescopeStatistics | null> {
  try {
    const json = await kinescopeRequest<{ data: KinescopeStatistics }>(
      `/videos/${videoId}/statistics`
    )
    return json.data
  } catch (err) {
    console.error('kinescope stats error:', err)
    return null
  }
}

/**
 * Build embed URL for a video with player customization query params.
 * Настройки плеера передаются как query string к iframe src.
 * Client-safe — не требует токена.
 */
export function buildEmbedUrl(videoId: string, settings?: PlayerSettings | null): string {
  const base = `https://kinescope.io/embed/${videoId}`
  if (!settings) return base

  const params = new URLSearchParams()
  if (settings.accent_color) params.set('color', settings.accent_color.replace('#', ''))
  if (settings.autoplay) params.set('autoplay', '1')
  if (settings.muted) params.set('muted', '1')
  if (settings.show_title === false) params.set('title', '0')
  // logo и watermark применяются через Kinescope dashboard / API на уровне видео

  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

/** Backward-compat alias. */
export function getKinescopeEmbedUrl(videoId: string): string {
  return buildEmbedUrl(videoId)
}

/**
 * Create a parent folder in Kinescope. Used when a new Studency project is created.
 * Returns the parent/folder ID to save into projects.kinescope_folder_id.
 */
export async function createKinescopeFolder(
  name: string,
  parentId?: string
): Promise<KinescopeFolder> {
  const json = await kinescopeRequest<{ data: KinescopeFolder }>('/parents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parent_id: parentId ?? null }),
  })
  return json.data
}

/**
 * Delete a parent folder (cascades on Kinescope side — all videos inside go too).
 */
export async function deleteKinescopeFolder(folderId: string): Promise<void> {
  await kinescopeRequest(`/parents/${folderId}`, { method: 'DELETE' })
}

/**
 * Apply player settings to a specific video via the Kinescope API.
 * Some settings like logo/watermark must be set server-side; color and
 * autoplay can also be set via embed URL query params.
 */
export async function applyPlayerSettingsToVideo(
  videoId: string,
  settings: PlayerSettings
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: any = {}
  if (settings.accent_color) payload.color = settings.accent_color.replace('#', '')
  if (typeof settings.watermark === 'boolean') payload.watermark = settings.watermark
  if (settings.logo_url) payload.logo = { url: settings.logo_url }

  if (Object.keys(payload).length === 0) return

  try {
    await kinescopeRequest(`/videos/${videoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    // Не блокируем флоу если Kinescope не принял какое-то поле
    console.error('applyPlayerSettingsToVideo error:', err)
  }
}
