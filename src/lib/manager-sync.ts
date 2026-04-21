import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptSecret } from './crypto-vault'
import { fetchManagerDialogs, type IncomingMessage } from './telegram-mtproto'
import { emitEvent } from './event-triggers'

export type ManagerAccount = {
  id: string
  project_id: string
  mtproto_api_id: number
  mtproto_api_hash_enc: string | null
  mtproto_session_enc: string | null
  last_sync_at: string | null
  initial_import_done: boolean
}

/**
 * Синхронизация диалогов одного менеджер-аккаунта.
 * - Тянет все сообщения начиная с last_sync_at (или N дней назад если первый импорт)
 * - Создаёт/обновляет manager_conversations
 * - Вставляет manager_messages (dedup по telegram_message_id)
 * - На новое ВХОДЯЩЕЕ сообщение клиента (direction='incoming') увеличивает unread_count
 * - Связывает conversation с customer по telegram_id (если такой customer есть в проекте)
 * - Если это первое incoming от нового клиента → emitEvent manager_conversation_started
 */
export async function syncManagerAccount(supabase: SupabaseClient, acc: ManagerAccount, options: { initialDays?: number } = {}): Promise<{
  fetched: number; saved: number; newConversations: number; newIncoming: number
}> {
  if (!acc.mtproto_session_enc || !acc.mtproto_api_hash_enc) {
    throw new Error('manager account не подключён (нет session)')
  }

  const apiHash = decryptSecret(acc.mtproto_api_hash_enc)
  const session = decryptSecret(acc.mtproto_session_enc)

  const sinceIso = acc.initial_import_done
    ? (acc.last_sync_at ?? new Date(Date.now() - 24 * 3600_000).toISOString())
    : new Date(Date.now() - (options.initialDays ?? 30) * 24 * 3600_000).toISOString()

  // Ограничения уменьшены чтобы надёжно укладываться в 60 сек Vercel:
  //   initial: 40 диалогов × 30 сообщений
  //   incremental: 100 диалогов × 30 сообщений (обычно актуальных мало, skip-оптимизация работает)
  const msgs: IncomingMessage[] = await fetchManagerDialogs({
    apiId: acc.mtproto_api_id,
    apiHash,
    sessionString: session,
    sinceIso,
    maxDialogs: acc.initial_import_done ? 100 : 40,
    messagesPerDialog: acc.initial_import_done ? 30 : 30,
  })

  let saved = 0
  let newConversations = 0
  let newIncoming = 0

  // Группируем сообщения по peer
  const byPeer = new Map<number, IncomingMessage[]>()
  for (const m of msgs) {
    if (!byPeer.has(m.peerTelegramId)) byPeer.set(m.peerTelegramId, [])
    byPeer.get(m.peerTelegramId)!.push(m)
  }

  for (const [peerId, peerMsgs] of byPeer) {
    // Сортируем по времени
    peerMsgs.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime())
    const latest = peerMsgs[peerMsgs.length - 1]

    // Upsert conversation
    const { data: existingConv } = await supabase
      .from('manager_conversations')
      .select('id, customer_id, unread_count')
      .eq('manager_account_id', acc.id)
      .eq('peer_telegram_id', peerId)
      .maybeSingle()

    let convId: string
    let isNewConv = false
    let previousCustomerId: string | null = existingConv?.customer_id ?? null

    // Ищем customer по telegram_id в проекте
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('project_id', acc.project_id)
      .eq('telegram_id', String(peerId))
      .maybeSingle()

    if (existingConv) {
      convId = existingConv.id
    } else {
      isNewConv = true
      newConversations++
      const { data: newConv, error } = await supabase
        .from('manager_conversations')
        .insert({
          manager_account_id: acc.id,
          peer_telegram_id: peerId,
          peer_username: latest.peerUsername,
          peer_first_name: latest.peerFirstName,
          customer_id: customer?.id ?? null,
          status: 'open',
        })
        .select('id')
        .single()
      if (error || !newConv) continue
      convId = newConv.id
    }

    // Привязываем к customer если не была привязана
    if (customer && !previousCustomerId) {
      await supabase.from('manager_conversations').update({ customer_id: customer.id }).eq('id', convId)
      previousCustomerId = customer.id
    }

    // Вставляем сообщения батчем (ON CONFLICT DO NOTHING через upsert)
    let incomingCountForConv = 0
    let firstIncomingMessageInSession: IncomingMessage | null = null
    const rows = peerMsgs.map(m => ({
      conversation_id: convId,
      telegram_message_id: m.messageId,
      direction: m.isOutgoing ? 'outgoing' : 'incoming',
      text: m.text,
      media_type: m.mediaType,
      media_url: null,
      sent_at: m.sentAt,
    }))
    if (rows.length > 0) {
      // Сначала узнаём какие уже есть (чтобы не инкрементить unread повторно через триггер)
      const existingIds = new Set<number>()
      const msgIds = peerMsgs.map(m => m.messageId)
      if (msgIds.length > 0) {
        const { data: existing } = await supabase
          .from('manager_messages')
          .select('telegram_message_id')
          .eq('conversation_id', convId)
          .in('telegram_message_id', msgIds)
        for (const e of existing ?? []) existingIds.add(Number(e.telegram_message_id))
      }
      const newRows = rows.filter(r => !existingIds.has(Number(r.telegram_message_id)))
      if (newRows.length > 0) {
        const { error } = await supabase.from('manager_messages').insert(newRows)
        if (!error) {
          saved += newRows.length
          for (const m of peerMsgs) {
            if (existingIds.has(m.messageId)) continue
            if (!m.isOutgoing) {
              incomingCountForConv++
              if (!firstIncomingMessageInSession) firstIncomingMessageInSession = m
            }
          }
        }
      }
    }

    // Обновляем агрегат на conversation
    // unread_count считается автоматически через triggers (bump_manager_unread)
    // при каждой вставке в manager_messages с direction='incoming'.
    const incomingTimes = peerMsgs.filter(m => !m.isOutgoing).map(m => m.sentAt)
    const outgoingTimes = peerMsgs.filter(m => m.isOutgoing).map(m => m.sentAt)
    const lastIncomingAt = incomingTimes.length > 0 ? incomingTimes[incomingTimes.length - 1] : null
    const lastOutgoingAt = outgoingTimes.length > 0 ? outgoingTimes[outgoingTimes.length - 1] : null
    const lastMessageAt = latest.sentAt
    const preview = (latest.text ?? (latest.mediaType ? `[${latest.mediaType}]` : '')).slice(0, 200)
    newIncoming += incomingCountForConv

    await supabase.from('manager_conversations').update({
      peer_username: latest.peerUsername,
      peer_first_name: latest.peerFirstName,
      last_incoming_at: lastIncomingAt ?? undefined,
      last_outgoing_at: lastOutgoingAt ?? undefined,
      last_message_at: lastMessageAt,
      last_message_preview: preview,
      last_message_direction: latest.isOutgoing ? 'outgoing' : 'incoming',
      updated_at: new Date().toISOString(),
    }).eq('id', convId)

    // Emit событие "начал переписку с менеджером" — только для новых conversations
    // (при первом incoming после создания conversation)
    if (isNewConv && firstIncomingMessageInSession && previousCustomerId) {
      await emitEvent(supabase, {
        projectId: acc.project_id,
        customerId: previousCustomerId,
        eventType: 'manager_conversation_started',
        eventName: null,
        source: 'manager',
        sourceId: acc.id,
        metadata: {
          manager_account_id: acc.id,
          conversation_id: convId,
          peer_username: firstIncomingMessageInSession.peerUsername,
        },
      }).catch(err => console.error('emitEvent manager_conversation_started error:', err))

      // И в customer_actions для UI таймлайна
      await supabase.from('customer_actions').insert({
        customer_id: previousCustomerId,
        project_id: acc.project_id,
        action: 'manager_conversation_started',
        data: {
          manager_account_id: acc.id,
          conversation_id: convId,
        },
      }).then(() => null)
    }
  }

  // Обновляем last_sync_at + initial_import_done
  await supabase.from('manager_accounts').update({
    last_sync_at: new Date().toISOString(),
    initial_import_done: true,
    last_error: null,
    status: 'active',
  }).eq('id', acc.id)

  return { fetched: msgs.length, saved, newConversations, newIncoming }
}
