import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Cookie-домен для авторизации. Если задан → cookie доступна на всех
// субдоменах (например '.studency.ru'). Если пусто — host-only cookie
// (default браузера).
const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || ''

export async function createServerSupabase() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              const opts = COOKIE_DOMAIN ? { ...options, domain: COOKIE_DOMAIN } : options
              cookieStore.set(name, value, opts)
            })
          } catch {
            // Server component — ignore
          }
        },
      },
    }
  )
}
