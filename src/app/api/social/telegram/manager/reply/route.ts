import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decryptSecret } from '@/lib/crypto-vault'
import { sendManagerMessage } from '@/lib/telegram-mtproto'

export const runtime = 'nodejs'
export const maxDuration = 60

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * POST /api/social/telegram/manager/reply
 * Body: { conversationId, text }
 *
 * Отправляет сообщение от имени менеджера клиенту.
 * Через gramjs: получает peer → invoke messages.SendMessage.
 * Записывает в manager_messages с direction='outgoing'.
 */
export async function POST(request: NextRequest) {
  try {
    const { conversationId, text } = await request.json()
    if (!conversationId || !text) return NextResponse.json({ error: 'conversationId и text required' }, { status: 400 })

    const supabase = getSupabase()
    const { data: conv } = await supabase
      .from('manager_conversations')
      .select('id, manager_account_id, peer_telegram_id, peer_username')
      .eq('id', conversationId)
      .single()
    if (!conv) return NextResponse.json({ error: 'conversation not found' }, { status: 404 })

    const { data: acc } = await supabase
      .from('manager_accounts')
      .select('mtproto_api_id, mtproto_api_hash_enc, mtproto_session_enc')
      .eq('id', conv.manager_account_id)
      .single()
    if (!acc?.mtproto_api_hash_enc || !acc.mtproto_session_enc) {
      return NextResponse.json({ error: 'MTProto session отсутствует' }, { status: 400 })
    }

    const apiHash = decryptSecret(acc.mtproto_api_hash_enc)
    const session = decryptSecret(acc.mtproto_session_enc)

    let result
    try {
      result = await sendManagerMessage({
        apiId: Number(acc.mtproto_api_id),
        apiHash,
        sessionString: session,
        peerTelegramId: Number(conv.peer_telegram_id),
        peerUsername: conv.peer_username,
        text: String(text),
      })
    } catch (err) {
      return NextResponse.json({ error: 'Telegram: ' + (err instanceof Error ? err.message : String(err)) }, { status: 500 })
    }

    // Пишем в manager_messages (direction=outgoing)
    const now = new Date().toISOString()
    await supabase.from('manager_messages').insert({
      conversation_id: conv.id,
      telegram_message_id: result?.messageId ?? 0,
      direction: 'outgoing',
      text,
      sent_at: now,
    })

    // Обновляем conversation: last_outgoing_at + unread_count=0 (мы сбрасываем) + превью
    await supabase.from('manager_conversations').update({
      last_outgoing_at: now,
      last_message_at: now,
      last_message_preview: String(text).slice(0, 200),
      last_message_direction: 'outgoing',
      unread_count: 0,
      updated_at: now,
    }).eq('id', conv.id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal' }, { status: 500 })
  }
}
