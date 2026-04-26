import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'studency.ru'

/** Является ли host корневым доменом платформы (главный сайт + лк). */
function isRootHost(host: string): boolean {
  if (!host) return false
  const h = host.toLowerCase().split(':')[0]  // без порта
  if (h === ROOT_DOMAIN) return true
  if (h === `www.${ROOT_DOMAIN}`) return true
  // Локалка / превью
  if (h === 'localhost' || h.endsWith('.vercel.app')) return true
  // Обращение по IP
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return true
  return false
}

/** Извлекает поддомен из <sub>.studency.ru, иначе null. */
function extractSubdomain(host: string): string | null {
  const h = host.toLowerCase().split(':')[0]
  const suffix = `.${ROOT_DOMAIN}`
  if (h.endsWith(suffix)) {
    const sub = h.slice(0, h.length - suffix.length)
    if (sub && !sub.includes('.')) return sub
  }
  return null
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const host = request.headers.get('host') || ''

  // ──────────────────────────────────────────────────────────────────────
  // Шаг 1. Routing по host: если host — субдомен или кастомный домен,
  // rewrite на публичный route /pub/[hostKind]/[hostValue]/[...path].
  // Главный домен пропускается дальше (auth + страницы лк).
  // ──────────────────────────────────────────────────────────────────────
  if (!isRootHost(host)) {
    // Эти пути работают одинаково на любом хосте — пропускаем как есть:
    // tracking, статика, public API, favicon/robots.
    const passThrough =
      pathname.startsWith('/_next') ||
      pathname.startsWith('/pub') ||
      pathname.startsWith('/api/') ||
      pathname.startsWith('/go/') ||  // короткие ссылки трекинга
      pathname === '/favicon.ico' ||
      pathname === '/robots.txt' ||
      pathname === '/sitemap.xml'
    if (passThrough) return NextResponse.next()

    const sub = extractSubdomain(host)
    const url = request.nextUrl.clone()
    if (sub) {
      url.pathname = `/pub/sub/${sub}${pathname === '/' ? '' : pathname}`
    } else {
      url.pathname = `/pub/cust/${encodeURIComponent(host.split(':')[0])}${pathname === '/' ? '' : pathname}`
    }
    return NextResponse.rewrite(url)
  }

  // ──────────────────────────────────────────────────────────────────────
  // Шаг 2. На корневом домене — старая логика auth.
  // ──────────────────────────────────────────────────────────────────────

  // Skip for static/api/public pages
  if (pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname.startsWith('/s/') || pathname.startsWith('/pub') || pathname === '/favicon.ico') {
    return NextResponse.next()
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
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

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
