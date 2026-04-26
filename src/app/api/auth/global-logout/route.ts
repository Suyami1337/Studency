// GET /api/auth/global-logout
//
// Чистит auth-cookies на текущем домене (subdomain или main) и редиректит
// на main /login. Вызывается из admin Sidebar чтобы пользователь полностью
// вылогинился — cookie subdomain'а отдельная от main, поэтому при logout
// надо чистить обе.
//
// Flow: <sub>.studency.ru/api/auth/global-logout → signOut на subdomain
// → redirect на studency.ru/api/auth/global-logout?step=2 → signOut на
// main → redirect на /login.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'studency.ru'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const step = url.searchParams.get('step') || '1'
  const host = request.headers.get('host') || ''
  const isMain = host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`

  // Готовим response (для шага 1 → редирект на main step=2; для main step=2 → редирект на /login)
  const targetUrl = isMain
    ? new URL('/login', `https://${ROOT_DOMAIN}`)
    : new URL(`/api/auth/global-logout?step=2`, `https://${ROOT_DOMAIN}`)
  const response = NextResponse.redirect(targetUrl, 302)

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    }
  )
  await supabase.auth.signOut().catch(() => {})

  // Дополнительно убиваем все sb-* cookies на текущем хосте — на случай
  // если signOut оставил chunks
  for (const c of cookieStore.getAll()) {
    if (c.name.startsWith('sb-')) {
      response.cookies.delete(c.name)
    }
  }

  void step  // для будущих шагов
  return response
}
