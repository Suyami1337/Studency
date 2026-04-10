import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendFollowupContent } from '@/lib/scenario-sender'

export const runtime = 'nodejs'
export const maxDuration = 60

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/broadcasts/[id]/send
 * Запускает рассылку: находит всех клиентов по сегменту и шлёт им сообщение.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = getSupabase()

    const { data: broadcast } = await supabase.from('broadcasts').select('*').eq('id', id).single()
    if (!broadcast) return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })
    if (broadcast.status === 'sent') return NextResponse.json({ error: 'Already sent' }, { status: 400 })

    // Получаем бота
    if (!broadcast.telegram_bot_id) {
      return NextResponse.json({ error: 'No bot selected' }, { status: 400 })
    }
    const { data: bot } = await supabase.from('telegram_bots')
      .select('*').eq('id', broadcast.telegram_bot_id).single()
    if (!bot) return NextResponse.json({ error: 'Bot not found' }, { status: 404 })

    // Собираем список получателей по сегменту
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from('customers')
      .select('id, telegram_id, full_name')
      .eq('project_id', broadcast.project_id)
      .not('telegram_id', 'is', null)
      .eq('is_blocked', false)

    if (broadcast.segment_type === 'funnel_stage' && broadcast.segment_value) {
      query = query.eq('funnel_stage_id', broadcast.segment_value)
    } else if (broadcast.segment_type === 'source' && broadcast.segment_value) {
      query = query.eq('source_slug', broadcast.segment_value)
    } else if (broadcast.segment_type === 'tag' && broadcast.segment_value) {
      query = query.contains('tags', [broadcast.segment_value])
    }

    const { data: recipients } = await query

    if (!recipients || recipients.length === 0) {
      await supabase.from('broadcasts').update({
        status: 'sent', sent_at: new Date().toISOString(),
        total_recipients: 0, sent_count: 0,
      }).eq('id', id)
      return NextResponse.json({ ok: true, sent: 0, total: 0 })
    }

    // Обновляем статус на sending
    await supabase.from('broadcasts').update({
      status: 'sending', total_recipients: recipients.length,
    }).eq('id', id)

    let sent = 0
    let failed = 0

    for (const recipient of recipients as { id: string; telegram_id: string }[]) {
      const chatId = parseInt(recipient.telegram_id, 10)
      if (!chatId) continue

      try {
        await sendFollowupContent(bot.token, chatId, {
          text: broadcast.text,
          media_type: broadcast.media_type,
          media_url: broadcast.media_url,
        })

        await supabase.from('broadcast_deliveries').insert({
          broadcast_id: id,
          customer_id: recipient.id,
          status: 'sent',
          sent_at: new Date().toISOString(),
        })

        // Сохраняем как outgoing message в чате
        const { data: conv } = await supabase
          .from('chatbot_conversations')
          .select('id')
          .eq('telegram_bot_id', bot.id)
          .eq('telegram_chat_id', chatId)
          .maybeSingle()

        if (conv) {
          await supabase.from('chatbot_messages').insert({
            conversation_id: conv.id,
            direction: 'outgoing',
            content: broadcast.text || `[${broadcast.media_type}]`,
          })
        }

        sent++
      } catch (err) {
        console.error('broadcast send error:', err)
        await supabase.from('broadcast_deliveries').insert({
          broadcast_id: id,
          customer_id: recipient.id,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown',
        })
        failed++
      }

      // Rate limit: Telegram ограничивает ~30 msg/sec
      await new Promise(res => setTimeout(res, 40))
    }

    await supabase.from('broadcasts').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      sent_count: sent,
      failed_count: failed,
    }).eq('id', id)

    return NextResponse.json({ ok: true, sent, failed, total: recipients.length })
  } catch (err) {
    console.error('broadcast send route error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
