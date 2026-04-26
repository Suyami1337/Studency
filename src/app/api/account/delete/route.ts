// POST /api/account/delete — полное удаление аккаунта со всеми проектами.
//
// 1) Достаёт все проекты юзера (как owner) → отвязывает их домены в Vercel.
// 2) Удаляет проекты (cascade удалит customers, landings, bots и пр.).
// 3) Удаляет auth.users запись через service role admin API.
// 4) Чистит cookies на текущем хосте, возвращает redirect URL для login.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { removeVercelDomain } from '@/lib/vercel-domains'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'studency.ru'

export async function POST(_request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const userId = user.id

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Все проекты юзера-владельца — нужны для очистки Vercel доменов
  const { data: projects } = await svc
    .from('projects')
    .select('id, subdomain, custom_domain')
    .eq('owner_id', userId)

  for (const p of projects ?? []) {
    if (p.subdomain) {
      removeVercelDomain(`${p.subdomain}.${ROOT_DOMAIN}`).catch(() => {})
    }
    if (p.custom_domain) {
      removeVercelDomain(p.custom_domain).catch(() => {})
    }
  }

  // Удаляем все проекты юзера (cascade удалит связанные данные)
  await svc.from('projects').delete().eq('owner_id', userId)

  // Удаляем auth.users (cascade удалит project_members и прочее с FK на auth.users)
  const { error: deleteErr } = await svc.auth.admin.deleteUser(userId)
  if (deleteErr) {
    console.error('admin.deleteUser failed:', deleteErr)
    return NextResponse.json({ error: 'не удалось удалить аккаунт: ' + deleteErr.message }, { status: 500 })
  }

  // Чистим cookies на текущем хосте
  const cookieStore = await cookies()
  const response = NextResponse.json({ ok: true, redirect: `https://${ROOT_DOMAIN}/login` })
  for (const c of cookieStore.getAll()) {
    if (c.name.startsWith('sb-')) {
      response.cookies.delete(c.name)
    }
  }
  return response
}
