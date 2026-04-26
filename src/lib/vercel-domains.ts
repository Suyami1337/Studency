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

export type VercelDomainConfig = {
  misconfigured: boolean
  configuredBy: string | null
  nameservers: string[]
  recommendedIPv4: string[]
  recommendedCNAME: string | null
  /** Список A-записей которые домен сейчас отдаёт (как видит Vercel) */
  aValues: string[]
  /** CNAME-записи которые домен отдаёт */
  cnames: string[]
}

/** Получить реальный конфиг домена (DNS, рекомендации, misconfigured). */
export async function getVercelDomainConfig(name: string): Promise<VercelDomainConfig> {
  const url = `${API}/v6/domains/${encodeURIComponent(name)}/config?${teamQS().slice(1)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token()}` },
    cache: 'no-store',
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json().catch(() => ({}))
  // recommendedIPv4 — массив из {rank,value:[ips]}, берём rank=1
  const ipv4Rank1 = Array.isArray(data?.recommendedIPv4)
    ? (data.recommendedIPv4.find((r: { rank: number }) => r.rank === 1)?.value ?? [])
    : []
  const cnameRank1 = Array.isArray(data?.recommendedCNAME)
    ? (data.recommendedCNAME.find((r: { rank: number }) => r.rank === 1)?.value ?? null)
    : null
  return {
    misconfigured: Boolean(data?.misconfigured),
    configuredBy: data?.configuredBy ?? null,
    nameservers: Array.isArray(data?.nameservers) ? data.nameservers : [],
    recommendedIPv4: ipv4Rank1,
    recommendedCNAME: cnameRank1,
    aValues: Array.isArray(data?.aValues) ? data.aValues : [],
    cnames: Array.isArray(data?.cnames) ? data.cnames : [],
  }
}

/** Привязать домен к проекту. Возвращает статус и DNS-инструкции. */
export async function addVercelDomain(name: string): Promise<{
  ok: boolean
  status: 'verified' | 'pending' | 'failed'
  error?: string
  verification?: VercelDomain['verification']
  config?: VercelDomainConfig
}> {
  const url = `${API}/v10/projects/${projectId()}/domains?slug=_${teamQS()}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  const data = await res.json()
  if (!res.ok) {
    const code = data?.error?.code || 'unknown'
    const msg = data?.error?.message || 'Vercel API error'
    return { ok: false, status: 'failed', error: `${code}: ${msg}` }
  }

  // ВАЖНО: Vercel возвращает verified=true как только домен принят на платформу,
  // даже если DNS ещё не настроены. Реальный статус DNS — через /v6/domains/.../config.
  // Считаем status='verified' только когда misconfigured=false.
  let config: VercelDomainConfig | undefined
  try { config = await getVercelDomainConfig(name) } catch {}

  const isReallyVerified = Boolean(data.verified) && config && !config.misconfigured
  return {
    ok: true,
    status: isReallyVerified ? 'verified' : 'pending',
    verification: data.verification,
    config,
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

/** Запросить актуальный статус домена + конфиг DNS. */
export async function checkVercelDomain(name: string): Promise<{
  status: 'verified' | 'pending' | 'failed' | 'not_found'
  verification?: VercelDomain['verification']
  error?: string
  config?: VercelDomainConfig
}> {
  const url = `${API}/v9/projects/${projectId()}/domains/${encodeURIComponent(name)}?${teamQS().slice(1)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token()}` },
  })
  if (res.status === 404) return { status: 'not_found' }
  const data = await res.json()
  if (!res.ok) return { status: 'failed', error: data?.error?.message }

  let config: VercelDomainConfig | undefined
  try { config = await getVercelDomainConfig(name) } catch {}

  const isReallyVerified = Boolean(data.verified) && config && !config.misconfigured
  return {
    status: isReallyVerified ? 'verified' : 'pending',
    verification: data.verification,
    config,
  }
}
