// POST /api/auth/init-self-registration
//
// Вызывается из /register после успешного supabase.auth.signUp.
// Создаёт users_meta с can_create_projects=TRUE — это отличает свободно
// зарегистрировавшихся (могут создавать школы) от приглашённых.
//
// Без этого вызова user не сможет создать проект (RLS на projects.INSERT
// проверяет users_meta.can_create_projects).

import { NextResponse } from 'next/server'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'

export async function POST(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { full_name?: string }
  try { body = await request.json() } catch { body = {} }

  const fullName = body.full_name?.trim() || (user.user_metadata?.full_name as string | undefined) || null

  const svc = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Если уже есть запись — не трогаем флаг (защита от понижения прав)
  const { data: existing } = await svc
    .from('users_meta')
    .select('user_id, can_create_projects')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    // Только обновим имя если ещё не было
    if (fullName) {
      await svc.from('users_meta').update({ full_name: fullName, updated_at: new Date().toISOString() }).eq('user_id', user.id)
    }
    return NextResponse.json({ ok: true, already_existed: true, can_create_projects: existing.can_create_projects })
  }

  const { error } = await svc.from('users_meta').insert({
    user_id: user.id,
    full_name: fullName,
    can_create_projects: true,
  })

  if (error) {
    console.error('init users_meta error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, can_create_projects: true })
}
