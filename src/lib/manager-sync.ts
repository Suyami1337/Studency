import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptSecret } from './crypto-vault'
import { fetchManagerDialogs, downloadPeerAvatar, type IncomingMessage } from './telegram-mtproto'
import { emitEvent } from './event-triggers'

const AVATAR_REFRESH_MS = 24 * 3600_000    // 1 день
const MAX_AVATARS_PER_SYNC = 10            // сколько аватарок тянем за один крон

type AvatarTask = {
  convId: string
  peerTelegramId: number
  peerUsername: string | null
}

/**
 * Скачивает аватарки пачкой через одну MTProto-сессию и загружает в Supabase Storage.
 * Ограничено MAX_AVATARS_PER_SYNC чтобы не перелететь таймаут крона — остальные
 * подтянутся на следующих запусках.
 */
async function batchSyncAvatars(
  supabase: SupabaseClient,
  acc: { mtproto_api_id: number; mtproto_api_hash_enc: string; mtproto_session_enc: string },
  tasks: AvatarTask[],
): Promise<void> {
  if (tasks.length === 0) return
  const limited = tasks.slice(0, MAX_AVATARS_PER_SYNC)

  const apiHash = decryptSecret(acc.mtproto_api_hash_enc)
  const session = decryptSecret(acc.mtproto_session_enc)
  const { TelegramClient, Api } = (await import('telegram')) as typeof import('telegram') & { Api: typeof import('telegram').Api }
  const { StringSession } = await import('telegram/sessions')
  const client = new TelegramClient(new StringSession(session), acc.mtproto_api_id, apiHash, { connectionRetries: 2 })
  await client.connect()

  try {
    // Один прогрев peer cache на всю пачку
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await client.invoke(new Api.messages.GetDialogs({
        offsetDate: 0,
        offsetId: 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        offsetPeer: new Api.InputPeerEmpty() as any,
        limit: 200,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hash: 0 as any,
      }))
    } catch { /* ignore */ }

    for (const task of limited) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let entity: any = null
        const cleanUsername = task.peerUsername?.replace(/^@/, '') || null
        if (cleanUsername) {
          try { entity = await client.getEntity(cleanUsername) } catch { /* fallback */ }
        }
        if (!entity) {
          try { entity = await client.getEntity(task.peerTelegramId) } catch { continue }
        }
        if (!entity) continue

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const buf: any = await client.downloadProfilePhoto(entity, { isBig: false })
        if (!buf || (Buffer.isBuffer(buf) && buf.length === 0)) {
          // Явно помечаем что фото нет — чтобы не дёргать снова каждый крон
          await supabase.from('manager_conversations').update({
            peer_photo_updated_at: new Date().toISOString(),
          }).eq('id', task.convId)
          continue
        }
        const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
        const storagePath = `manager/${task.peerTelegramId}_${Date.now()}.jpg`
        const { error: upErr } = await supabase.storage.from('avatars').upload(storagePath, buffer, {
          contentType: 'image/jpeg',
          upsert: true,
        })
        if (upErr) { console.error('avatar upload err:', upErr); continue }
        const { data: pub } = supabase.storage.from('avatars').getPublicUrl(storagePath)
        await supabase.from('manager_conversations').update({
          peer_photo_url: pub.publicUrl,
          peer_photo_updated_at: new Date().toISOString(),
        }).eq('id', task.convId)
      } catch (err) {
        console.error('avatar sync err for peer', task.peerTelegramId, err)
      }
    }
  } finally {
    await client.disconnect().catch(() => null)
  }
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _IncomingMessage: IncomingMessage | null = null // keep import for types if needed

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
  fetched: number; saved: number; newConversations: number; newIncoming: number; avatars?: number
}> {
  if (!acc.mtproto_session_enc || !acc.mtproto_api_hash_enc) {
    throw new Error('manager account не подключён (нет session)')
  }

  const apiHash = decryptSecret(acc.mtproto_api_hash_enc)
  const session = decryptSecret(acc.mtproto_session_enc)

  const sinceIso = acc.initial_import_done
    ? (acc.last_sync_at ?? new Date(Date.now() - 24 * 3600_000).toISOString())
    : new Date(Date.now() - (options.initialDays ?? 30) * 24 * 3600_000).toISOString()

  // Пагинация GetDialogs до 10 страниц × 100 = 1000 диалогов max (этого хватит)
  // messagesPerDialog маленький чтобы уложиться во временной бюджет
  const { messages: msgs, dialogs: dialogMetas } = await fetchManagerDialogs({
    apiId: acc.mtproto_api_id,
    apiHash,
    sessionString: session,
    sinceIso,
    pageSize: 100,
    maxPages: acc.initial_import_done ? 3 : 10,  // initial тянет все, incremental хватит 3 страниц
    messagesPerDialog: 30,
  })

  // Map peerId → unread_count из Telegram (источник истины)
  const telegramUnreadByPeer = new Map<number, number>()
  const dialogMetaByPeer = new Map<number, typeof dialogMetas[0]>()
  for (const d of dialogMetas) {
    telegramUnreadByPeer.set(d.peerTelegramId, d.unreadCount)
    dialogMetaByPeer.set(d.peerTelegramId, d)
  }

  let saved = 0
  let newConversations = 0
  let newIncoming = 0
  const avatarTasks: AvatarTask[] = []

  // Группируем сообщения по peer
  const byPeer = new Map<number, IncomingMessage[]>()
  for (const m of msgs) {
    if (!byPeer.has(m.peerTelegramId)) byPeer.set(m.peerTelegramId, [])
    byPeer.get(m.peerTelegramId)!.push(m)
  }

  // Batch-загружаем peer_telegram_id всех существующих conversations этого аккаунта —
  // чтобы за один запрос понять какие диалоги в TG уже есть у нас в БД.
  const { data: existingConvs } = await supabase
    .from('manager_conversations')
    .select('peer_telegram_id')
    .eq('manager_account_id', acc.id)
  const existingPeers = new Set((existingConvs ?? []).map(e => Number(e.peer_telegram_id)))

  // Для диалогов без новых сообщений (только из dialogMetas) решаем:
  // — Если conversation уже есть в БД → обрабатываем (нужно синхронизировать unread из TG,
  //   например если пользователь прочитал диалог в мобильном Telegram, unread там обнулился).
  // — Если conversation нет в БД → создаём только при unreadCount > 0 (иначе засорим
  //   список пустыми диалогами из GetDialogs; актуально для «чистого старта»).
  for (const [peerId, meta] of dialogMetaByPeer) {
    if (byPeer.has(peerId)) continue
    if (existingPeers.has(peerId) || meta.unreadCount > 0) {
      byPeer.set(peerId, [])
    }
  }

  for (const [peerId, peerMsgs] of byPeer) {
    // Сортируем по времени
    peerMsgs.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime())
    const latest = peerMsgs[peerMsgs.length - 1] as IncomingMessage | undefined
    const dialogMeta = dialogMetaByPeer.get(peerId)
    const peerUsername = latest?.peerUsername ?? dialogMeta?.peerUsername ?? null
    const peerFirstName = latest?.peerFirstName ?? dialogMeta?.peerFirstName ?? null
    const telegramUnread = telegramUnreadByPeer.get(peerId) ?? 0

    // Upsert conversation
    const { data: existingConv } = await supabase
      .from('manager_conversations')
      .select('id, customer_id, unread_count, peer_photo_updated_at')
      .eq('manager_account_id', acc.id)
      .eq('peer_telegram_id', peerId)
      .maybeSingle()

    let convId: string
    let isNewConv = false
    let previousCustomerId: string | null = existingConv?.customer_id ?? null

    // Ищем customer по telegram_id в проекте
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id, crm_visible')
      .eq('project_id', acc.project_id)
      .eq('telegram_id', String(peerId))
      .maybeSingle()

    let customerId = existingCustomer?.id ?? null

    // Если customer не найден — создаём СКРЫТУЮ карточку (lazy materialization).
    // Она появится в /users только когда юзер совершит actionable действие
    // (/start бота, клик на лендинг и т.п.) — тогда crm_visible переключится.
    if (!customerId) {
      const { data: newCustomer } = await supabase
        .from('customers')
        .insert({
          project_id: acc.project_id,
          telegram_id: String(peerId),
          telegram_username: peerUsername,
          full_name: peerFirstName,
          crm_visible: false,
        })
        .select('id')
        .single()
      customerId = newCustomer?.id ?? null
    }

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
          peer_username: peerUsername,
          peer_first_name: peerFirstName,
          customer_id: customerId,
          status: 'open',
          unread_count: telegramUnread,
        })
        .select('id')
        .single()
      if (error || !newConv) continue
      convId = newConv.id
    }

    // Привязываем к customer если ещё не была привязана
    if (customerId && !previousCustomerId) {
      await supabase.from('manager_conversations').update({ customer_id: customerId }).eq('id', convId)
      previousCustomerId = customerId
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

    // unread_count считаем сами из наших сообщений в БД: incoming с sent_at > last_read_at.
    // Telegram возвращает unreadCount некорректно для свежих session'ов (readInboxMaxId=0),
    // поэтому ему нельзя доверять напрямую. Но если TG говорит «всё прочитано» И
    // readInboxMaxId >= topMessageId — значит прочитано на другом устройстве,
    // синхронизируем обратно (Telegram → платформа).
    const { data: convRow } = await supabase
      .from('manager_conversations')
      .select('last_read_at')
      .eq('id', convId)
      .single()
    let lastReadAt = convRow?.last_read_at ?? null

    const readInboxMaxId = dialogMeta?.readInboxMaxId ?? 0
    const topMessageId = dialogMeta?.topMessageId ?? 0
    const tgSaysAllRead = telegramUnread === 0 && readInboxMaxId > 0 && topMessageId > 0 && readInboxMaxId >= topMessageId
    if (tgSaysAllRead) {
      // На другом устройстве прочитали всё — обнуляем наше unread и двигаем last_read_at
      lastReadAt = new Date().toISOString()
    }

    let computedUnread = 0
    const { count: cnt } = await supabase
      .from('manager_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', convId)
      .eq('direction', 'incoming')
      .gt('sent_at', lastReadAt ?? '1970-01-01')
    computedUnread = Number(cnt ?? 0)
    const finalUnread = tgSaysAllRead ? 0 : Math.max(computedUnread, telegramUnread)

    const incomingTimes = peerMsgs.filter(m => !m.isOutgoing).map(m => m.sentAt)
    const outgoingTimes = peerMsgs.filter(m => m.isOutgoing).map(m => m.sentAt)
    const lastIncomingAt = incomingTimes.length > 0 ? incomingTimes[incomingTimes.length - 1] : null
    const lastOutgoingAt = outgoingTimes.length > 0 ? outgoingTimes[outgoingTimes.length - 1] : null
    const lastMessageAt = latest?.sentAt ?? dialogMeta?.topMessageDate ?? null
    const preview = latest ? (latest.text ?? (latest.mediaType ? `[${latest.mediaType}]` : '')).slice(0, 200) : null
    newIncoming += incomingCountForConv

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = {
      peer_username: peerUsername,
      peer_first_name: peerFirstName,
      updated_at: new Date().toISOString(),
      unread_count: finalUnread,
    }
    if (tgSaysAllRead) updates.last_read_at = lastReadAt
    if (lastIncomingAt) updates.last_incoming_at = lastIncomingAt
    if (lastOutgoingAt) updates.last_outgoing_at = lastOutgoingAt
    if (lastMessageAt) updates.last_message_at = lastMessageAt
    if (preview) updates.last_message_preview = preview
    if (latest) updates.last_message_direction = latest.isOutgoing ? 'outgoing' : 'incoming'
    await supabase.from('manager_conversations').update(updates).eq('id', convId)

    // Собираем задачи на скачивание аватарок — будут выполнены пачкой после основного
    // цикла в одной MTProto-сессии (экономим время, один коннект на все).
    if (dialogMeta?.peerHasPhoto) {
      const lastAvatarAt = existingConv?.peer_photo_updated_at ?? null
      const needsRefresh = !lastAvatarAt || (Date.now() - new Date(lastAvatarAt).getTime()) > AVATAR_REFRESH_MS
      if (needsRefresh) {
        avatarTasks.push({ convId, peerTelegramId: peerId, peerUsername })
      }
    }

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

  // Пачкой докачиваем аватарки — одна MTProto-сессия, до MAX_AVATARS_PER_SYNC за раз
  if (avatarTasks.length > 0 && acc.mtproto_api_hash_enc && acc.mtproto_session_enc) {
    await batchSyncAvatars(
      supabase,
      { mtproto_api_id: acc.mtproto_api_id, mtproto_api_hash_enc: acc.mtproto_api_hash_enc, mtproto_session_enc: acc.mtproto_session_enc },
      avatarTasks,
    ).catch(err => console.error('batchSyncAvatars err:', err))
  }

  return { fetched: msgs.length, saved, newConversations, newIncoming, avatars: avatarTasks.length }
}
