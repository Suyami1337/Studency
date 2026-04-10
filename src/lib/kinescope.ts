// Kinescope API integration
// Docs: https://docs.kinescope.io/api
//
// Required env var: KINESCOPE_API_TOKEN (Bearer token from Kinescope dashboard)
// Optional: KINESCOPE_PARENT_ID (default parent folder ID for uploads)

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

export type KinescopeStatistics = {
  views?: number
  unique_views?: number
  watch_time?: number  // в секундах
  avg_view_duration?: number
  completion_rate?: number
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
 * Build embed URL for a video (client-safe).
 */
export function getKinescopeEmbedUrl(videoId: string): string {
  return `https://kinescope.io/embed/${videoId}`
}
