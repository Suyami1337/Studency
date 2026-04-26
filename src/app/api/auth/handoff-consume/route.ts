// GET /api/auth/handoff-consume?id=<uuid>
//
// Вызывается на subdomain (<sub>.studency.ru) после редиректа с main.
// Читает одноразовый handoff-токен, ставит cookie на этом subdomain'е
// через supabase.auth.setSession(), редиректит на target_path.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'studency.ru'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id') || ''
  if (!id) {
    return NextResponse.redirect(`https://${ROOT_DOMAIN}/login`)
  }

  // Lookup handoff record (service role)
  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: handoff } = await svc
    .from('auth_handoffs')
    .select('user_id, access_token, refresh_token, target_path, expires_at, used_at')
    .eq('id', id)
    .maybeSingle()

  if (!handoff || handoff.used_at || new Date(handoff.expires_at) < new Date()) {
    // Истекший / уже использованный → отправляем логиниться заново
    return NextResponse.redirect(`https://${ROOT_DOMAIN}/login`)
  }

  // Помечаем использованным (одноразовость)
  await svc.from('auth_handoffs').update({ used_at: new Date().toISOString() }).eq('id', id)

  // Готовим response с redirect — supabase setSession будет писать
  // cookies в этот response через cookieStore.
  const targetPath = handoff.target_path || '/'
  const response = NextResponse.redirect(new URL(targetPath, request.url), 302)

  // Создаём server client который пишет cookies прямо в response
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

  // Ставим session — это записывает access+refresh tokens в cookies
  const { error } = await supabase.auth.setSession({
    access_token: handoff.access_token,
    refresh_token: handoff.refresh_token,
  })
  if (error) {
    console.error('handoff-consume setSession failed:', error)
    return NextResponse.redirect(`https://${ROOT_DOMAIN}/login`)
  }

  return response
}
