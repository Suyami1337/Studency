import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'studency.ru'

const ADMIN_PATHS = new Set([
  'sites', 'crm', 'chatbots', 'funnels', 'analytics', 'users', 'settings',
  'media', 'videos', 'learning', 'journal', 'social', 'broadcasts',
  'conversations', 'orders', 'products',
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

// In-memory cache subdomain ↔ project_id для быстрого resolve в middleware.
// Edge инстанции независимы → per-instance cache, TTL 60 сек.
type CacheEntry = { id: string | null; expiresAt: number }
const subToIdCache = new Map<string, CacheEntry>()
const CACHE_TTL = 60_000

async function resolveProjectIdBySubdomain(sub: string): Promise<string | null> {
  const now = Date.now()
  const cached = subToIdCache.get(sub)
  if (cached && cached.expiresAt > now) return cached.id
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !apiKey) return null
    const url = `${supabaseUrl}/rest/v1/projects?subdomain=eq.${encodeURIComponent(sub)}&select=id&limit=1`
    const res = await fetch(url, {
      headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = await res.json()
    const id = (Array.isArray(data) && data[0]?.id) ? data[0].id as string : null
    subToIdCache.set(sub, { id, expiresAt: now + CACHE_TTL })
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
  // Главный домен (studency.ru / www.studency.ru / localhost / vercel.app)
  // ─────────────────────────────────────────────────────────────────────
  if (isRootHost(host)) {
    if (
      pathname.startsWith('/_next') ||
      pathname.startsWith('/api') ||
      pathname.startsWith('/s/') ||
      pathname.startsWith('/pub') ||
      pathname === '/favicon.ico'
    ) {
      return NextResponse.next()
    }

    // /project/<id>/<rest> на main → handoff на subdomain проекта.
    // Проверка subdomain делается в самом handoff endpoint.
    const projMatch = pathname.match(/^\/project\/([0-9a-f-]{36})(\/.*)?$/i)
    if (projMatch) {
      const projectId = projMatch[1]
      const rest = projMatch[2] || '/'
      const url = request.nextUrl.clone()
      url.pathname = '/api/auth/handoff-redirect'
      url.searchParams.set('projectId', projectId)
      url.searchParams.set('path', rest)
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
  // Subdomain или custom_domain
  // ─────────────────────────────────────────────────────────────────────

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/pub') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/go/') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  ) {
    return NextResponse.next()
  }

  const sub = extractSubdomain(host)

  // На subdomain'е /project/<id>/<rest> → 308 редирект на /<rest>
  // (чтобы старые Link href работали и URL bar был чистым)
  if (sub) {
    const projOnSub = pathname.match(/^\/project\/([0-9a-f-]{36})(\/.*)?$/i)
    if (projOnSub) {
      const url = request.nextUrl.clone()
      url.pathname = projOnSub[2] || '/'
      return NextResponse.redirect(url, 308)
    }
  }

  // Admin-routing на subdomain'е (только для авторизованных)
  if (sub) {
    const firstSeg = pathname.split('/').filter(Boolean)[0] || ''

    // Root path авторизованного юзера → admin dashboard проекта
    if (pathname === '/' && hasAuthCookie(request)) {
      const projectId = await resolveProjectIdBySubdomain(sub)
      if (projectId) {
        const url = request.nextUrl.clone()
        url.pathname = `/project/${projectId}`
        return NextResponse.rewrite(url)
      }
    }

    // Admin-разделы (sites, crm, etc) для авторизованных
    if (ADMIN_PATHS.has(firstSeg) && hasAuthCookie(request)) {
      const projectId = await resolveProjectIdBySubdomain(sub)
      if (projectId) {
        const url = request.nextUrl.clone()
        url.pathname = `/project/${projectId}${pathname}`
        return NextResponse.rewrite(url)
      }
    }
  }

  // Public landing routing (для всех остальных запросов)
  const url = request.nextUrl.clone()
  if (sub) {
    url.pathname = `/pub/sub/${sub}${pathname === '/' ? '' : pathname}`
  } else {
    url.pathname = `/pub/cust/${encodeURIComponent(host.split(':')[0])}${pathname === '/' ? '' : pathname}`
  }
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
