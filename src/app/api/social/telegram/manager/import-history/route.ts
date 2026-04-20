import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncManagerAccount } from '@/lib/manager-sync'

export const runtime = 'nodejs'
export const maxDuration = 120

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * POST /api/social/telegram/manager/import-history
 * Body: { accountId, days? }
 * Инициирует полную синхронизацию диалогов за N дней. Вызывается автоматом
 * после успешного подключения менеджер-аккаунта или вручную с UI.
 */
export async function POST(request: NextRequest) {
  try {
    const { accountId, days } = await request.json()
    if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 })

    const supabase = getSupabase()
    const { data: acc } = await supabase.from('manager_accounts').select('*').eq('id', accountId).single()
    if (!acc) return NextResponse.json({ error: 'manager account not found' }, { status: 404 })

    try {
      const result = await syncManagerAccount(supabase, acc, { initialDays: days ?? 30 })
      return NextResponse.json({ ok: true, ...result })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await supabase.from('manager_accounts').update({ status: 'error', last_error: msg }).eq('id', accountId)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal' }, { status: 500 })
  }
}
