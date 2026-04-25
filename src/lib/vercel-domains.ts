// Vercel API для управления кастомными доменами проекта.
// Все функции — server-only. Используют VERCEL_TOKEN + VERCEL_PROJECT_ID
// из env. Wildcard *.studency.ru должен быть добавлен к проекту вручную
// один раз в Vercel Dashboard — все subdomain'ы школ работают через него.

const API = 'https://api.vercel.com'

function token(): string {
  const t = process.env.VERCEL_TOKEN
  if (!t) throw new Error('VERCEL_TOKEN not set')
  return t
}
function projectId(): string {
  const id = process.env.VERCEL_PROJECT_ID
  if (!id) throw new Error('VERCEL_PROJECT_ID not set')
  return id
}
function teamQS(): string {
  const team = process.env.VERCEL_TEAM_ID
  return team ? `&teamId=${team}` : ''
}

export type VercelDomain = {
  name: string
  verified: boolean
  verification?: Array<{ type: string; domain: string; value: string; reason: string }>
}

/** Привязать домен к проекту. Возвращает статус и DNS-инструкции. */
export async function addVercelDomain(name: string): Promise<{
  ok: boolean
  status: 'verified' | 'pending' | 'failed'
  error?: string
  verification?: VercelDomain['verification']
}> {
  const url = `${API}/v10/projects/${projectId()}/domains?slug=_${teamQS()}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  const data = await res.json()
  if (!res.ok) {
    // Частые ошибки: domain_already_in_use, invalid_domain
    const code = data?.error?.code || 'unknown'
    const msg = data?.error?.message || 'Vercel API error'
    return { ok: false, status: 'failed', error: `${code}: ${msg}` }
  }
  // verified=true когда DNS уже настроен; иначе pending
  return {
    ok: true,
    status: data.verified ? 'verified' : 'pending',
    verification: data.verification,
  }
}

/** Отвязать домен. */
export async function removeVercelDomain(name: string): Promise<{ ok: boolean; error?: string }> {
  const url = `${API}/v9/projects/${projectId()}/domains/${encodeURIComponent(name)}?${teamQS().slice(1)}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token()}` },
  })
  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => ({}))
    return { ok: false, error: data?.error?.message || `HTTP ${res.status}` }
  }
  return { ok: true }
}

/** Запросить актуальный статус домена. */
export async function checkVercelDomain(name: string): Promise<{
  status: 'verified' | 'pending' | 'failed' | 'not_found'
  verification?: VercelDomain['verification']
  error?: string
}> {
  const url = `${API}/v9/projects/${projectId()}/domains/${encodeURIComponent(name)}?${teamQS().slice(1)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token()}` },
  })
  if (res.status === 404) return { status: 'not_found' }
  const data = await res.json()
  if (!res.ok) return { status: 'failed', error: data?.error?.message }
  return {
    status: data.verified ? 'verified' : 'pending',
    verification: data.verification,
  }
}
