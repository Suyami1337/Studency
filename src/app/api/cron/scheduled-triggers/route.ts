import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendScenarioMessage } from '@/lib/scenario-sender'

export const runtime = 'nodejs'
export const maxDuration = 60

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/cron/scheduled-triggers
 * Vercel Cron entry point. Fires pending negative triggers whose scheduled_at has passed.
 */
export async function GET(_request: NextRequest) {
  const supabase = getSupabase()

  // Claim up to 100 pending rows that are due
  const { data: due } = await supabase
    .from('scheduled_triggers')
    .select('id, scenario_id, start_message_id, customer_id, project_id, telegram_bot_id')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .limit(100)

  const rows = due ?? []
  if (rows.length === 0) return NextResponse.json({ ok: true, fired: 0 })

  let fired = 0
  let failed = 0

  for (const row of rows) {
    try {
      // Load bot token + chat
      const [botRes, custRes] = await Promise.all([
        row.telegram_bot_id
          ? supabase.from('telegram_bots').select('id, token, is_active').eq('id', row.telegram_bot_id).single()
          : supabase.from('chatbot_scenarios').select('telegram_bot_id, telegram_bots(id, token, is_active)').eq('id', row.scenario_id).single(),
        supabase.from('customers').select('telegram_id').eq('id', row.customer_id).single(),
      ])

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bot: any = row.telegram_bot_id
        ? botRes.data
        : Array.isArray((botRes.data as any)?.telegram_bots)
          ? (botRes.data as any).telegram_bots[0]
          : (botRes.data as any)?.telegram_bots

      if (!bot?.token || bot.is_active === false || !custRes.data?.telegram_id) {
        await supabase.from('scheduled_triggers').update({
          status: 'cancelled', cancel_reason: 'bot inactive or no telegram_id',
        }).eq('id', row.id)
        continue
      }

      const chatId = typeof custRes.data.telegram_id === 'string'
        ? parseInt(custRes.data.telegram_id, 10)
        : Number(custRes.data.telegram_id)
      if (!Number.isFinite(chatId)) {
        await supabase.from('scheduled_triggers').update({
          status: 'cancelled', cancel_reason: 'invalid telegram_id',
        }).eq('id', row.id)
        continue
      }

      // Find conversation
      const { data: conv } = await supabase
        .from('chatbot_conversations')
        .select('id')
        .eq('telegram_bot_id', bot.id)
        .eq('telegram_chat_id', chatId)
        .maybeSingle()

      if (!conv) {
        await supabase.from('scheduled_triggers').update({
          status: 'cancelled', cancel_reason: 'no conversation',
        }).eq('id', row.id)
        continue
      }

      // Atomic claim: only fire if still pending (guards against double-fire)
      const { data: claimed } = await supabase
        .from('scheduled_triggers')
        .update({ status: 'fired', fired_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('status', 'pending')
        .select('id')

      if (!claimed || claimed.length === 0) continue

      await sendScenarioMessage(
        supabase, bot.token, chatId,
        row.start_message_id, conv.id, chatId, row.scenario_id
      )
      fired++
    } catch (err) {
      failed++
      console.error('scheduled trigger fire error:', row.id, err)
      await supabase.from('scheduled_triggers').update({
        status: 'cancelled',
        cancel_reason: 'fire error: ' + (err instanceof Error ? err.message : 'unknown'),
      }).eq('id', row.id)
    }
  }

  return NextResponse.json({ ok: true, considered: rows.length, fired, failed })
}
