import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decryptSecret } from '@/lib/crypto-vault'
import { markDialogAsRead } from '@/lib/telegram-mtproto'

export const runtime = 'nodejs'
export const maxDuration = 30

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * POST /api/social/telegram/manager/mark-read
 * Body: { conversationId }
 *
 * Помечает диалог прочитанным на стороне Telegram (ReadHistory),
 * а затем на нашей стороне ставит unread_count=0.
 * Это гарантирует синхронизацию: если менеджер прочитал в платформе —
 * в его Telegram тоже становится прочитанным.
 */
export async function POST(request: NextRequest) {
  try {
    const { conversationId } = await request.json()
    if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

    const supabase = getSupabase()
    const { data: conv } = await supabase
      .from('manager_conversations')
      .select('id, manager_account_id, peer_telegram_id, peer_username, unread_count')
      .eq('id', conversationId)
      .single()
    if (!conv) return NextResponse.json({ error: 'conversation not found' }, { status: 404 })

    // No-op: нечего отмечать прочитанным. Защита от ping-pong когда UI
    // случайно шлёт mark-read для уже прочитанного диалога (это могло бы
    // ReadHistory-ить Telegram вперёд, подавляя свежие входящие на мобильном).
    if ((conv.unread_count ?? 0) === 0) {
      return NextResponse.json({ ok: true, skipped: true })
    }

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

    // Находим id последнего telegram сообщения в этом диалоге — передаём как maxId
    const { data: lastMsg } = await supabase
      .from('manager_messages')
      .select('telegram_message_id')
      .eq('conversation_id', conv.id)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const maxId = Number(lastMsg?.telegram_message_id ?? 0)

    // Fire: read в самом Telegram
    let tgError: string | null = null
    try {
      await markDialogAsRead({
        apiId: Number(acc.mtproto_api_id),
        apiHash,
        sessionString: session,
        peerTelegramId: Number(conv.peer_telegram_id),
        peerUsername: conv.peer_username,
        maxId,
      })
    } catch (err) {
      tgError = err instanceof Error ? err.message : String(err)
      console.error('markDialogAsRead error:', tgError)
    }

    await supabase.from('manager_conversations').update({
      unread_count: 0,
      last_read_at: new Date().toISOString(),
    }).eq('id', conv.id)

    return NextResponse.json({ ok: true, tgSynced: !tgError, tgError })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal' }, { status: 500 })
  }
}
