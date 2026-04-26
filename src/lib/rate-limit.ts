// Простой in-memory rate-limit для serverless.
//
// Каждая инстанция Vercel-функции держит свою Map → защита НЕ полная (если
// у Vercel несколько инстанций, лимит фактически N×count_instances). Но для
// отсева очевидного спама достаточно. Полная защита — Redis/Upstash, если
// потребуется.

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

/** Очистка старых записей при превышении размера Map. */
function gc() {
  if (buckets.size < 10000) return
  const now = Date.now()
  for (const [k, b] of buckets) {
    if (b.resetAt < now) buckets.delete(k)
  }
}

/**
 * Возвращает true если запрос разрешён, false если превышен лимит.
 * @param key уникальный ключ (например "events:<ip>:<projectId>")
 * @param limit сколько запросов в windowMs
 * @param windowMs окно в миллисекундах
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    gc()
    return true
  }
  if (b.count >= limit) return false
  b.count++
  return true
}

/** Извлекает IP клиента из Vercel/standard headers. */
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}
