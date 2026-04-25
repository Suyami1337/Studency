import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncBotSubscribers } from '@/lib/sync-bot-subscribers'
import { createServerSupabase } from '@/lib/supabase-server'
import { ensureProjectAccess } from '@/lib/api-auth'

export const runtime = 'nodejs'
export const maxDuration = 120

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * POST /api/broadcasts/sync-subscribers
 * Body: { telegram_bot_id }
 *
 * On-demand синхронизация подписчиков одного бота — для UI-кнопки
 * «🔄 Обновить подписчиков» в форме создания рассылки.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const botId = body.telegram_bot_id as string | undefined
    if (!botId) return NextResponse.json({ error: 'telegram_bot_id required' }, { status: 400 })

    const supabase = getSupabase()
    const { data: bot } = await supabase
      .from('telegram_bots').select('id, token, name, project_id').eq('id', botId).single()
    if (!bot) return NextResponse.json({ error: 'Bot not found' }, { status: 404 })
    const authClient = await createServerSupabase()
    const access = await ensureProjectAccess(authClient, bot.project_id)
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const result = await syncBotSubscribers(supabase, bot.id, bot.token)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[broadcasts/sync-subscribers] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
