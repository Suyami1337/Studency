import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncManagerAccount, type ManagerAccount } from '@/lib/manager-sync'

export const runtime = 'nodejs'
export const maxDuration = 60

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * GET /api/cron/manager-sync
 *
 * Тянет новые сообщения по всем активным manager-аккаунтам.
 * Запускается через cron-job.org раз в минуту.
 * Для каждого аккаунта:
 *   - получает сообщения с момента last_sync_at
 *   - пишет в manager_conversations / manager_messages
 *   - эмитит manager_conversation_started при первом входящем от нового клиента
 */
export async function GET(_request: NextRequest) {
  const supabase = getSupabase()
  const { data: accounts } = await supabase
    .from('manager_accounts')
    .select('id, project_id, mtproto_api_id, mtproto_api_hash_enc, mtproto_session_enc, last_sync_at, initial_import_done')
    .eq('status', 'active')
    .limit(20)

  const results: Array<{ id: string; ok: boolean; stats?: unknown; error?: string }> = []

  for (const acc of (accounts ?? []) as ManagerAccount[]) {
    try {
      const stats = await syncManagerAccount(supabase, acc)
      results.push({ id: acc.id, ok: true, stats })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await supabase.from('manager_accounts').update({ status: 'error', last_error: msg }).eq('id', acc.id)
      results.push({ id: acc.id, ok: false, error: msg })
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results })
}
