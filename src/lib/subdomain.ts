// Утилиты для subdomain'ов проектов на studency.ru.
//
// Subdomain: 3-32 символа [a-z0-9] и дефис, не в начале/конце,
// без дефис-дефис подряд. Lowercase. Не из reserved-списка.

const RESERVED = new Set([
  // Технические/инфраструктурные
  'www', 'api', 'app', 'admin', 'mail', 'smtp', 'pop', 'imap', 'ftp', 'sftp',
  'ns', 'ns1', 'ns2', 'mx', 'mx1', 'mx2', 'cdn', 'static', 'assets', 'media',
  'cname', 'dns', 'webmail', 'autoconfig', 'autodiscover',
  // Маркетинг / system pages
  'help', 'support', 'docs', 'blog', 'news', 'about', 'contact', 'privacy', 'terms',
  'legal', 'pricing', 'auth', 'login', 'signup', 'register', 'logout',
  'dashboard', 'settings', 'account', 'billing', 'invoice',
  // Наши служебные пути
  's', '_subdomain', '_custom', '_p', '_pub', '_proj',
  // Зарезервировано на будущее
  'studency', 'studencyapp', 'platform',
])

const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/

/** Валидирует пользовательский ввод. Возвращает причину ошибки или null. */
export function validateSubdomain(s: string): string | null {
  if (!s) return 'Поддомен обязателен'
  const lower = s.toLowerCase().trim()
  if (lower.length < 3) return 'Минимум 3 символа'
  if (lower.length > 32) return 'Максимум 32 символа'
  if (!SUBDOMAIN_RE.test(lower)) return 'Только буквы a-z, цифры и дефис. Не в начале/конце.'
  if (lower.includes('--')) return 'Два дефиса подряд недопустимы'
  if (RESERVED.has(lower)) return 'Это имя зарезервировано'
  return null
}

/** Транслит и slugify русского названия проекта в кандидат subdomain. */
export function suggestSubdomainFromName(name: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  }
  let out = name
    .toLowerCase()
    .replace(/[а-яё]/g, c => map[c] ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-')
  if (out.length < 3) out = (out + 'school').slice(0, 12)
  if (out.length > 32) out = out.slice(0, 32)
  return out || 'school'
}

/** Корневой домен платформы. Меняется через NEXT_PUBLIC_ROOT_DOMAIN. */
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'studency.ru'

/** Полный URL публичного сайта проекта по subdomain или custom_domain. */
export function projectPublicUrl(p: { subdomain: string; custom_domain: string | null; custom_domain_status?: string | null }): string {
  if (p.custom_domain && p.custom_domain_status === 'verified') {
    return `https://${p.custom_domain}`
  }
  return `https://${p.subdomain}.${ROOT_DOMAIN}`
}

/** Public URL конкретного лендинга проекта. */
export function landingPublicUrl(
  project: { subdomain: string; custom_domain: string | null; custom_domain_status?: string | null },
  landingSlug: string,
): string {
  return `${projectPublicUrl(project)}/${landingSlug}`
}
