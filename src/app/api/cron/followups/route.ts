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
      // Атомарный claim: pending → sending одним UPDATE. Если 0 строк —
      // waitUntil из scenario-sender.ts уже захватил запись, пропускаем.
      const { data: claimed } = await supabase
        .from('followup_queue')
        .update({ status: 'sending' })
        .eq('id', item.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()
      if (!claimed) continue
      try {
        const channel = followup.channel ?? 'telegram'
        if (channel === 'telegram' || channel === 'both') {
          // Найдём customer для прокси-трекинга кликов по кнопкам.
          // customer_id уже заполнен в chatbot_conversations webhook'ом, используем его;
          // fallback — по telegram_id + project_id через join с telegram_bots
          // (колонки project_id в chatbot_conversations НЕТ).
          let customerIdForClicks: string | null = null
          try {
            const { data: conv } = await supabase
              .from('chatbot_conversations')
              .select('customer_id, telegram_chat_id, telegram_bots(project_id)')
              .eq('id', item.conversation_id)
              .maybeSingle()
            if (conv?.customer_id) {
              customerIdForClicks = conv.customer_id
            } else if (conv) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const projectId = (conv as any)?.telegram_bots?.project_id as string | undefined
              if (projectId) {
                const { data: customer } = await supabase
                  .from('customers')
                  .select('id')
                  .eq('telegram_id', String(conv.telegram_chat_id))
                  .eq('project_id', projectId)
                  .maybeSingle()
                if (customer) customerIdForClicks = customer.id
              }
            }
          } catch { /* ignore */ }
          const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.studency.ru').replace(/\/$/, '')
          const { loadFollowupButtons } = await import('@/lib/scenario-sender')
          const fuButtons = await loadFollowupButtons(supabase, followup.id, customerIdForClicks, appUrl)
          await sendFollowupContent(item.bot_token, item.chat_id, followup, fuButtons)
        }
        if (channel === 'email' || channel === 'both' || followup.duplicate_to_email) {
          await maybeDuplicateToEmail(supabase, item.conversation_id, followup)
        }
        await supabase.from('chatbot_messages').insert({
          conversation_id: item.conversation_id,
          direction: 'outgoing',
          content: followup.text || `[${followup.media_type}]`,
          scenario_message_id: followup.scenario_message_id ?? null,
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
