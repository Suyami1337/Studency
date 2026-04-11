// Kinescope API integration
// Docs: https://docs.kinescope.io/api
//
// Required env var: KINESCOPE_API_TOKEN (Bearer token from Kinescope dashboard)
// Architecture: один мастер-аккаунт, каждому project — своя папка (parent)

const KINESCOPE_API = 'https://api.kinescope.io/v1'
const KINESCOPE_UPLOADER = 'https://uploader.kinescope.io/v2'

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
 * Upload a video file to Kinescope via the uploader service.
 *
 * IMPORTANT: uploader.kinescope.io is a SEPARATE host from api.kinescope.io.
 * Method: raw binary POST (NOT multipart). Metadata goes into X-* headers.
 *
 * Docs: https://docs.kinescope.ru/instrukcii-dlya-razrabotchikov/zagruzka-faylov-cherez-api/
 */
export async function uploadVideoToKinescope(
  file: Blob,
  fileName: string,
  title?: string,
  parentId?: string
): Promise<KinescopeVideo> {
  const token = getToken()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headers: any = {
    Authorization: `Bearer ${token}`,
    'Content-Type': file.type || 'video/mp4',
    // Non-ASCII-safe header values — base64 fallback for Cyrillic titles
    'X-File-Name': encodeHeader(fileName),
  }
  if (title) headers['X-Video-Title'] = encodeHeader(title)
  if (parentId) headers['X-Parent-ID'] = parentId

  // Convert Blob to ArrayBuffer for raw body upload
  const buffer = await file.arrayBuffer()

  const res = await fetch(`${KINESCOPE_UPLOADER}/video`, {
    method: 'POST',
    headers,
    body: buffer,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Kinescope upload ${res.status}: ${text}`)
  }

  const json = await res.json() as { data: KinescopeVideo }
  return json.data
}

/**
 * Encode HTTP header value that may contain non-ASCII characters.
 * Uses percent-encoding so Cyrillic titles don't break the request.
 */
function encodeHeader(value: string): string {
  // Basic ASCII — return as-is
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value
  return encodeURIComponent(value)
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
 * Get the default Kinescope project ID (first project in the master account).
 * Used as parent for video uploads until we implement proper per-Studency-project
 * folder isolation.
 */
export async function getDefaultKinescopeProjectId(): Promise<string | null> {
  try {
    const json = await kinescopeRequest<{ data: Array<{ id: string; name: string }> }>('/projects')
    return json.data?.[0]?.id ?? null
  } catch (err) {
    console.error('getDefaultKinescopeProjectId error:', err)
    return null
  }
}

/**
 * Create a folder inside a Kinescope project.
 * Used for per-Studency-project isolation.
 */
export async function createKinescopeFolder(
  name: string,
  kinescopeProjectId: string,
  parentFolderId?: string
): Promise<KinescopeFolder> {
  const json = await kinescopeRequest<{ data: KinescopeFolder }>(
    `/projects/${kinescopeProjectId}/folders`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parent_id: parentFolderId ?? null }),
    }
  )
  return json.data
}

/**
 * Delete a folder. Cascades on Kinescope side — all videos inside go too.
 */
export async function deleteKinescopeFolder(folderId: string): Promise<void> {
  await kinescopeRequest(`/folders/${folderId}`, { method: 'DELETE' })
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
