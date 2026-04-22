import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncBotSubscribers } from '@/lib/sync-bot-subscribers'

export const runtime = 'nodejs'
export const maxDuration = 300

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * GET /api/cron/sync-bot-subscribers
 *
 * Проходит по всем активным ботам и через sendChatAction проверяет каких
 * клиентов реально достижимо. Помечает chat_blocked=true у тех кто
 * заблокировал/удалил бота, снимает метку у тех кто разблокировал.
 *
 * Настраивается в cron-job.org: раз в сутки (ночью).
 */
export async function GET(_request: NextRequest) {
  const supabase = getSupabase()
  const { data: bots } = await supabase
    .from('telegram_bots')
    .select('id, token, name')
    .eq('is_active', true)

  const results: Array<{ bot: string; total: number; checked: number; blocked: number; unblocked: number; errors: number }> = []
  for (const bot of (bots ?? [])) {
    try {
      const r = await syncBotSubscribers(supabase, bot.id, bot.token)
      results.push({ bot: bot.name, ...r })
      console.log(`[cron:sync-subscribers] bot=${bot.name} checked=${r.checked}/${r.total} blocked=${r.blocked} unblocked=${r.unblocked} errors=${r.errors}`)
    } catch (err) {
      console.error(`[cron:sync-subscribers] bot=${bot.name} fatal:`, err)
    }
  }

  return NextResponse.json({ ok: true, results })
}
