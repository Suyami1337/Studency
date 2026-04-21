import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * POST /api/social/telegram/manager/start-fresh
 * Body: { accountId }
 *
 * Помечает аккаунт как активный без импорта старых переписок.
 * Кронограф дальше будет подтягивать только новые диалоги/сообщения
 * с этого момента.
 */
export async function POST(request: NextRequest) {
  try {
    const { accountId } = await request.json()
    if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 })

    const supabase = getSupabase()
    const { error } = await supabase
      .from('manager_accounts')
      .update({
        status: 'active',
        initial_import_done: true,
        last_sync_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', accountId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal' }, { status: 500 })
  }
}
