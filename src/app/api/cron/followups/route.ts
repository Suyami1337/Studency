import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendTelegramMessage } from '@/lib/telegram'

export const runtime = 'nodejs'
export const maxDuration = 30

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest) {
  // Защита: только Vercel Cron или наш секрет
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()
  const now = new Date().toISOString()

  // 1. Берём pending записи у которых send_at уже прошло
  const { data: queueItems, error: queueError } = await supabase
    .from('followup_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('send_at', now)
    .limit(50)

  if (queueError) {
    console.error('followup_queue fetch error:', queueError)
    return NextResponse.json({ error: queueError.message }, { status: 500 })
  }

  if (!queueItems || queueItems.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, pending: 0 })
  }

  // 2. Грузим данные followup-ов отдельным запросом (join в Supabase ненадёжен для нестандартных FK)
  const followupIds = queueItems.map((q: { followup_id: string }) => q.followup_id)
  const { data: followupDefs, error: followupError } = await supabase
    .from('message_followups')
    .select('*')
    .in('id', followupIds)

  if (followupError) {
    console.error('message_followups fetch error:', followupError)
    return NextResponse.json({ error: followupError.message }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const followupMap = new Map((followupDefs ?? []).map((f: any) => [f.id, f]))

  let sent = 0
  let failed = 0

  for (const item of queueItems) {
    const followup = followupMap.get(item.followup_id)

    if (!followup || !followup.text) {
      await supabase
        .from('followup_queue')
        .update({ status: 'sent', sent_at: now })
        .eq('id', item.id)
      continue
    }

    try {
      const channel = followup.channel ?? 'telegram'
      if (channel === 'telegram' || channel === 'both') {
        await sendTelegramMessage(item.bot_token, item.chat_id, followup.text)
      }
      // TODO: email channel

      await supabase.from('chatbot_messages').insert({
        conversation_id: item.conversation_id,
        direction: 'outgoing',
        content: followup.text,
      })

      await supabase
        .from('followup_queue')
        .update({ status: 'sent', sent_at: now })
        .eq('id', item.id)

      sent++
    } catch (err) {
      console.error('followup send error:', err, 'queue_id:', item.id)
      failed++
    }
  }

  return NextResponse.json({ ok: true, sent, failed, processed: queueItems.length })
}
