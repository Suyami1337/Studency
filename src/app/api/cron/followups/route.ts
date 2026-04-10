import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendScenarioMessage, sendFollowupContent, maybeDuplicateToEmail } from '@/lib/scenario-sender'

export const runtime = 'nodejs'
export const maxDuration = 30

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(_request: NextRequest) {
  const supabase = getSupabase()
  const now = new Date().toISOString()
  let sent = 0
  let failed = 0

  // ── 1. Followup queue ──────────────────────────────────────────
  const { data: followupItems } = await supabase
    .from('followup_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('send_at', now)
    .limit(50)

  if (followupItems && followupItems.length > 0) {
    const followupIds = followupItems.map((q: { followup_id: string }) => q.followup_id)
    const { data: followupDefs } = await supabase
      .from('message_followups')
      .select('*')
      .in('id', followupIds)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const followupMap = new Map((followupDefs ?? []).map((f: any) => [f.id, f]))

    for (const item of followupItems) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const followup = followupMap.get(item.followup_id) as any
      // Пропускаем если ни текста ни медиа
      if (!followup || (!followup.text && !followup.media_url)) {
        await supabase.from('followup_queue').update({ status: 'sent', sent_at: now }).eq('id', item.id)
        continue
      }
      try {
        const channel = followup.channel ?? 'telegram'
        if (channel === 'telegram' || channel === 'both') {
          await sendFollowupContent(item.bot_token, item.chat_id, followup)
        }
        if (channel === 'email' || channel === 'both' || followup.duplicate_to_email) {
          await maybeDuplicateToEmail(supabase, item.conversation_id, followup)
        }
        await supabase.from('chatbot_messages').insert({
          conversation_id: item.conversation_id,
          direction: 'outgoing',
          content: followup.text || `[${followup.media_type}]`,
        })
        await supabase.from('followup_queue').update({ status: 'sent', sent_at: now }).eq('id', item.id)
        sent++
      } catch (err) {
        console.error('followup send error:', err, 'queue_id:', item.id)
        failed++
      }
    }
  }

  // ── 2. Scenario message chain queue ───────────────────────────
  const { data: msgItems } = await supabase
    .from('scenario_message_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('send_at', now)
    .limit(50)

  if (msgItems && msgItems.length > 0) {
    for (const item of msgItems) {
      try {
        await sendScenarioMessage(
          supabase,
          item.bot_token,
          item.chat_id,
          item.next_message_id,
          item.conversation_id,
          item.user_id ?? undefined,
          item.scenario_id ?? undefined
        )
        await supabase.from('scenario_message_queue').update({ status: 'sent', sent_at: now }).eq('id', item.id)
        sent++
      } catch (err) {
        console.error('scenario_message_queue send error:', err, 'queue_id:', item.id)
        failed++
      }
    }
  }

  return NextResponse.json({ ok: true, sent, failed })
}
