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

  // Берём все pending записи у которых send_at уже прошло
  const { data: queue, error } = await supabase
    .from('followup_queue')
    .select('*, message_followups(*)')
    .eq('status', 'pending')
    .lte('send_at', now)
    .limit(50)

  if (error) {
    console.error('followup_queue fetch error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!queue || queue.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 })
  }

  let sent = 0
  let failed = 0

  for (const item of queue) {
    const followup = item.message_followups
    if (!followup || !followup.text) {
      // Помечаем как отправленное чтобы не зациклиться
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

      // Сохраняем исходящее сообщение
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
      console.error('followup send error:', err, item.id)
      failed++
      // Не обновляем статус — попробуем на следующем тике
    }
  }

  return NextResponse.json({ ok: true, sent, failed })
}
