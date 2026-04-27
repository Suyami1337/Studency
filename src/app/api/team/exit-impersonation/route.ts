// POST /api/team/exit-impersonation
//
// Восстанавливает оригинальную сессию админа из stash-cookie.
// Используется кнопкой «Вернуться» в баннере impersonation.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

const STASH_COOKIE = 'studency-impersonator-stash'
const MARKER_COOKIE = 'studency-impersonating'

export async function POST() {
  const cookieStore = await cookies()
  const stashRaw = cookieStore.get(STASH_COOKIE)?.value
  if (!stashRaw) return NextResponse.json({ error: 'no impersonation in progress' }, { status: 400 })

  let stash: { access_token: string; refresh_token: string; user_email?: string }
  try {
    stash = JSON.parse(stashRaw)
  } catch {
    cookieStore.delete(STASH_COOKIE)
    cookieStore.delete(MARKER_COOKIE)
    return NextResponse.json({ error: 'corrupt stash' }, { status: 400 })
  }

  if (!stash.access_token || !stash.refresh_token) {
    cookieStore.delete(STASH_COOKIE)
    cookieStore.delete(MARKER_COOKIE)
    return NextResponse.json({ error: 'invalid stash' }, { status: 400 })
  }

  // Восстанавливаем оригинальную сессию через @supabase/ssr setSession.
  const ssrClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    },
  )
  const { error } = await ssrClient.auth.setSession({
    access_token: stash.access_token,
    refresh_token: stash.refresh_token,
  })
  if (error) {
    // Если refresh_token истёк за время impersonation — вынуждены логаут.
    return NextResponse.json({
      error: 'original session expired — please login again',
      expired: true,
    }, { status: 410 })
  }

  cookieStore.delete(STASH_COOKIE)
  cookieStore.delete(MARKER_COOKIE)

  return NextResponse.json({ ok: true, restored_email: stash.user_email })
}
