import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runBroadcast } from '@/lib/broadcast-send'

export const runtime = 'nodejs'
export const maxDuration = 300

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * GET /api/cron/broadcasts
 *
 * Запускает запланированные рассылки — status='scheduled' И scheduled_at <= now().
 * Каждая отправка атомарно claim'ит запись через UPDATE status='sending'
 * внутри runBroadcast, так что повторные вызовы безопасны.
 *
 * Настраивается в cron-job.org: каждую минуту.
 */
export async function GET(_request: NextRequest) {
  const supabase = getSupabase()
  const nowIso = new Date().toISOString()

  const { data: due, error } = await supabase
    .from('broadcasts')
    .select('id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso)
    .limit(10)

  if (error) {
    console.error('[cron:broadcasts] fetch failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!due || due.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  console.log(`[cron:broadcasts] due=${due.length}`)

  const results: Array<{ id: string; ok: boolean; sent?: number; failed?: number; error?: string }> = []
  for (const b of due) {
    const res = await runBroadcast(b.id)
    if (res.ok) {
      results.push({ id: b.id, ok: true, sent: res.sent, failed: res.failed })
    } else {
      results.push({ id: b.id, ok: false, error: res.error })
    }
  }

  return NextResponse.json({ ok: true, processed: due.length, results })
}
