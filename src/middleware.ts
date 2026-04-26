import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'studency.ru'

// Все admin-пути живут под /project/<id>/<section>. Сами сегменты-имена
// держим тут только для определения, что это НЕ публичный лендинг.
const RESERVED_FIRST_SEGMENTS = new Set([
  'account', 'projects', 'project', 'login', 'register', 'api', '_next',
  'pub', 'go', 's', 'btn', 'gate', 'unsubscribe',
  'favicon.ico', 'robots.txt', 'sitemap.xml',
])

function isRootHost(host: string): boolean {
  if (!host) return false
  const h = host.toLowerCase().split(':')[0]
  if (h === ROOT_DOMAIN) return true
  if (h === `www.${ROOT_DOMAIN}`) return true
  if (h === 'localhost' || h.endsWith('.vercel.app')) return true
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return true
  return false
}

function extractSubdomain(host: string): string | null {
  const h = host.toLowerCase().split(':')[0]
  const suffix = `.${ROOT_DOMAIN}`
  if (h.endsWith(suffix)) {
    const sub = h.slice(0, h.length - suffix.length)
    if (sub && !sub.includes('.')) return sub
  }
  return null
}

// In-memory cache subdomain → user_id (TTL 60s).
type CacheEntry = { id: string | null; expiresAt: number }
const subToUserCache = new Map<string, CacheEntry>()
const CACHE_TTL = 60_000

async function resolveOwnerBySubdomain(sub: string): Promise<string | null> {
  const now = Date.now()
  const cached = subToUserCache.get(sub)
  if (cached && cached.expiresAt > now) return cached.id
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !apiKey) return null
    const url = `${supabaseUrl}/rest/v1/account_domains?subdomain=eq.${encodeURIComponent(sub)}&select=user_id&limit=1`
    const res = await fetch(url, {
      headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = await res.json()
    const id = (Array.isArray(data) && data[0]?.user_id) ? data[0].user_id as string : null
    subToUserCache.set(sub, { id, expiresAt: now + CACHE_TTL })
    return id
  } catch {
    return null
  }
}

/** Грубая проверка наличия Supabase auth-cookie. */
function hasAuthCookie(request: NextRequest): boolean {
  for (const c of request.cookies.getAll()) {
    if (c.name.startsWith('sb-') && c.name.includes('auth-token') && !c.name.includes('code-verifier')) {
      return true
    }
  }
  return false
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const host = request.headers.get('host') || ''

  // ─────────────────────────────────────────────────────────────────────
  // Главный домен (studency.ru / www / localhost / vercel.app)
  // ─────────────────────────────────────────────────────────────────────
  if (isRootHost(host)) {
    if (
      pathname.startsWith('/_next') ||
      pathname.startsWith('/api') ||
      pathname.startsWith('/s/') ||
      pathname.startsWith('/pub') ||
      pathname.startsWith('/templates/') ||
      pathname === '/favicon.ico'
    ) {
      return NextResponse.next()
    }

    // /project/<id>/<rest> на main → handoff на subdomain аккаунта.
    const projMatch = pathname.match(/^\/project\/([0-9a-f-]{36})(\/.*)?$/i)
    if (projMatch) {
      const projectId = projMatch[1]
      const rest = projMatch[2] || '/'
      const url = request.nextUrl.clone()
      url.pathname = '/api/auth/handoff-redirect'
      url.searchParams.set('projectId', projectId)
      url.searchParams.set('path', `/project/${projectId}${rest === '/' ? '' : rest}`)
      return NextResponse.redirect(url, 307)
    }

    // Auth check для остальных страниц на main
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) return NextResponse.next()

    let supabaseResponse = NextResponse.next({ request })
    try {
      const supabase = createServerClient(supabaseUrl, supabaseKey, {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
          },
        },
      })
      const { data: { session } } = await supabase.auth.getSession()
      const isAuthPage = pathname === '/login' || pathname === '/register'
      if (!session && !isAuthPage) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
      }
      if (session && isAuthPage) {
        const url = request.nextUrl.clone()
        url.pathname = '/projects'
        return NextResponse.redirect(url)
      }
    } catch {
      return NextResponse.next()
    }
    return supabaseResponse
  }

  // ─────────────────────────────────────────────────────────────────────
  // Subdomain или custom_domain (host != root)
  // ─────────────────────────────────────────────────────────────────────

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/pub') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/go/') ||
    pathname.startsWith('/templates/') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  ) {
    return NextResponse.next()
  }

  const sub = extractSubdomain(host)
  const firstSeg = pathname.split('/').filter(Boolean)[0] || ''
  const isAuthed = hasAuthCookie(request)
  const isReservedAdmin = RESERVED_FIRST_SEGMENTS.has(firstSeg) // /account, /projects, /project, /login, /register, ...

  // Зарезервированные admin-разделы (/account, /projects, /project/...) и
  // root (/) при наличии auth — рендерим напрямую, без rewrite на лендинг.
  if (isReservedAdmin) {
    // Для /login и /register на subdomain'е — редирект на main (логин всегда на главном)
    if (firstSeg === 'login' || firstSeg === 'register') {
      const url = new URL(`https://${ROOT_DOMAIN}${pathname}${request.nextUrl.search}`)
      return NextResponse.redirect(url, 302)
    }

    if (!isAuthed) {
      const fullUrl = `${request.nextUrl.protocol}//${host}${pathname}${request.nextUrl.search}`
      const loginUrl = new URL(`https://${ROOT_DOMAIN}/login`)
      loginUrl.searchParams.set('next', fullUrl)
      return NextResponse.redirect(loginUrl, 302)
    }
    return NextResponse.next()
  }

  // Root subdomain'а для авторизованного → редиректим на /projects (выбор проекта)
  if (sub && pathname === '/' && isAuthed) {
    const url = request.nextUrl.clone()
    url.pathname = '/projects'
    return NextResponse.redirect(url, 302)
  }

  // Иначе считаем, что это публичный лендинг.
  // Резолв owner по subdomain, лендинг по (owner_id, slug).
  const url = request.nextUrl.clone()
  if (sub) {
    const ownerId = await resolveOwnerBySubdomain(sub)
    if (ownerId) {
      url.pathname = `/pub/owner/${ownerId}${pathname === '/' ? '' : pathname}`
    } else {
      // subdomain неизвестен → рендерим 404 страницу
      url.pathname = `/pub/owner/__not_found__${pathname === '/' ? '' : pathname}`
    }
  } else {
    url.pathname = `/pub/cust/${encodeURIComponent(host.split(':')[0])}${pathname === '/' ? '' : pathname}`
  }
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
