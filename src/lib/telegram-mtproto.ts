// Thin wrapper around gramjs (telegram/MTProto) for channel statistics.
// Isolates gramjs imports to prevent them leaking into non-Node contexts.
//
// Public surface:
//   sendLoginCode(apiId, apiHash, phone) -> { phoneCodeHash, sessionSeed }
//   completeLogin(apiId, apiHash, sessionSeed, phone, phoneCodeHash, code, password?) -> sessionString
//   fetchChannelStats(apiId, apiHash, sessionString, channelUsernameOrId) -> { subs, posts[], fullInfo }
//   revokeSession(apiId, apiHash, sessionString) -> void

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any

async function createClient(apiId: number, apiHash: string, sessionString = ''): Promise<AnyClient> {
  const { TelegramClient } = await import('telegram')
  const { StringSession } = await import('telegram/sessions')
  const session = new StringSession(sessionString)
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 3,
    requestRetries: 3,
  })
  await client.connect()
  return client
}

export type LoginCodeResult = { phoneCodeHash: string; sessionSeed: string }

/** 1. Отправляет код подтверждения на телефон. Возвращает phoneCodeHash и промежуточную session seed. */
export async function sendLoginCode(apiId: number, apiHash: string, phone: string): Promise<LoginCodeResult> {
  const client = await createClient(apiId, apiHash, '')
  try {
    const { Api } = await import('telegram')
    const res = await client.invoke(new Api.auth.SendCode({
      phoneNumber: phone,
      apiId,
      apiHash,
      settings: new Api.CodeSettings({
        allowFlashcall: false,
        currentNumber: true,
        allowAppHash: false,
        allowMissedCall: false,
      }),
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const phoneCodeHash = (res as any).phoneCodeHash
    const sessionSeed = String(client.session.save())
    return { phoneCodeHash, sessionSeed }
  } finally {
    await client.disconnect().catch(() => null)
  }
}

/** 2. Завершает логин после ввода кода (и опционально пароля 2FA). Возвращает полную session string. */
export async function completeLogin(
  apiId: number,
  apiHash: string,
  sessionSeed: string,
  phone: string,
  phoneCodeHash: string,
  code: string,
  password?: string,
): Promise<string> {
  const client = await createClient(apiId, apiHash, sessionSeed)
  try {
    const { Api } = await import('telegram')
    try {
      await client.invoke(new Api.auth.SignIn({
        phoneNumber: phone,
        phoneCodeHash,
        phoneCode: code,
      }))
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any
      if (e?.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        if (!password) throw new Error('2FA_PASSWORD_REQUIRED')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pwd: any = await (await import('telegram/Password')).computeCheck(
          await client.invoke(new Api.account.GetPassword()),
          password,
        )
        await client.invoke(new Api.auth.CheckPassword({ password: pwd }))
      } else {
        throw err
      }
    }
    const sessionString = String(client.session.save())
    return sessionString
  } finally {
    await client.disconnect().catch(() => null)
  }
}

export type ChannelStats = {
  subscribersCount: number
  title: string | null
  username: string | null
  description: string | null
  postsWithViews: Array<{ id: number; views: number; forwards: number; date: string | null }>
}

/** Читает stats канала через MTProto. Требует чтобы юзер был админом канала. */
export async function fetchChannelStats(
  apiId: number,
  apiHash: string,
  sessionString: string,
  channelIdentifier: string | number,
  messagesLimit = 30,
): Promise<ChannelStats> {
  const client = await createClient(apiId, apiHash, sessionString)
  try {
    const { Api } = await import('telegram')
    const entity = await client.getEntity(channelIdentifier)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ent: any = entity

    // Subscribers count + title + description
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const full: any = await client.invoke(new Api.channels.GetFullChannel({ channel: ent }))
    const subscribersCount = Number(full.fullChat.participantsCount ?? 0)
    const title = ent.title ?? null
    const username = ent.username ?? null
    const description = full.fullChat.about ?? null

    // Последние N сообщений с просмотрами
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const history: any = await client.invoke(new Api.messages.GetHistory({
      peer: ent,
      limit: messagesLimit,
      offsetId: 0,
      offsetDate: 0,
      addOffset: 0,
      maxId: 0,
      minId: 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hash: 0 as any,
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const postsWithViews = (history.messages ?? []).filter((m: any) => m.className === 'Message').map((m: any) => ({
      id: Number(m.id),
      views: Number(m.views ?? 0),
      forwards: Number(m.forwards ?? 0),
      date: m.date ? new Date(Number(m.date) * 1000).toISOString() : null,
    }))

    return { subscribersCount, title, username, description, postsWithViews }
  } finally {
    await client.disconnect().catch(() => null)
  }
}

export async function revokeSession(apiId: number, apiHash: string, sessionString: string): Promise<void> {
  const client = await createClient(apiId, apiHash, sessionString)
  try {
    const { Api } = await import('telegram')
    await client.invoke(new Api.auth.LogOut())
  } finally {
    await client.disconnect().catch(() => null)
  }
}

// =====================================================
// Диалоги и личные сообщения (manager accounts)
// =====================================================

export type IncomingMessage = {
  messageId: number
  peerTelegramId: number
  peerUsername: string | null
  peerFirstName: string | null
  text: string | null
  mediaType: string | null
  sentAt: string
  isOutgoing: boolean
}

export type DialogMeta = {
  peerTelegramId: number
  peerUsername: string | null
  peerFirstName: string | null
  peerHasPhoto: boolean        // есть ли фото (для опционального скачивания)
  unreadCount: number          // ← СЫРОЕ значение из Telegram (ненадёжно для свежих session'ов)
  topMessageDate: string | null
  topMessageId: number | null
  readInboxMaxId: number       // id последнего прочитанного incoming из TG, 0 если session не синхронизирован
}

export type FetchManagerDialogsResult = {
  messages: IncomingMessage[]
  dialogs: DialogMeta[]
}

/**
 * Тянет все user-to-user диалоги пагинацией и сообщения из них.
 * Возвращает и список сообщений для записи, и meta каждого диалога (включая
 * unread_count — источник истины из Telegram).
 */
export async function fetchManagerDialogs(params: {
  apiId: number
  apiHash: string
  sessionString: string
  /** Только сообщения новее этой даты (UTC ISO) — для incremental */
  sinceIso?: string
  /** Страница GetDialogs (обычно 100) */
  pageSize?: number
  /** Максимум страниц пагинации */
  maxPages?: number
  /** Максимум сообщений на диалог при GetHistory */
  messagesPerDialog?: number
}): Promise<FetchManagerDialogsResult> {
  const { apiId, apiHash, sessionString, sinceIso, pageSize = 100, maxPages = 10, messagesPerDialog = 30 } = params
  const sinceTs = sinceIso ? Math.floor(new Date(sinceIso).getTime() / 1000) : 0
  const client = await createClient(apiId, apiHash, sessionString)
  const allMessages: IncomingMessage[] = []
  const allDialogs: DialogMeta[] = []
  const deadline = Date.now() + 50_000
  try {
    const { Api } = await import('telegram')

    // === Пагинация GetDialogs ===
    // offsetDate, offsetId, offsetPeer переопределяем из последнего element каждой страницы
    let offsetDate = 0
    let offsetId = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let offsetPeer: any = new Api.InputPeerEmpty()
    // Собираем все страницы
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pages: any[] = []

    for (let page = 0; page < maxPages; page++) {
      if (Date.now() > deadline) break
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resp: any = await client.invoke(new Api.messages.GetDialogs({
        offsetDate,
        offsetId,
        offsetPeer,
        limit: pageSize,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hash: 0 as any,
      }))
      pages.push(resp)
      const dialogsOnPage = resp.dialogs ?? []
      if (dialogsOnPage.length < pageSize) break  // больше нет диалогов

      // Подготовка offset для следующей страницы — последнее сообщение последнего диалога
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lastDialog: any = dialogsOnPage[dialogsOnPage.length - 1]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lastTopMsg: any = (resp.messages ?? []).find((m: { id: number }) => m.id === lastDialog.topMessage)
      if (!lastTopMsg) break
      offsetDate = Number(lastTopMsg.date) || 0

      // Если все диалоги на этой странице уже старше sinceIso → дальше тем более старее, стоп
      if (sinceTs && offsetDate < sinceTs) break

      offsetId = Number(lastTopMsg.id) || 0
      // Определяем peer для offset
      const lastPeer = lastDialog.peer
      if (lastPeer?.className === 'PeerUser') {
        const u = (resp.users ?? []).find((x: { id: number | string }) => String(x.id) === String(lastPeer.userId))
        if (u) offsetPeer = new Api.InputPeerUser({ userId: u.id, accessHash: u.accessHash ?? 0 as unknown as bigint })
      } else if (lastPeer?.className === 'PeerChannel') {
        const c = (resp.chats ?? []).find((x: { id: number | string }) => String(x.id) === String(lastPeer.channelId))
        if (c) offsetPeer = new Api.InputPeerChannel({ channelId: c.id, accessHash: c.accessHash ?? 0 as unknown as bigint })
      } else if (lastPeer?.className === 'PeerChat') {
        offsetPeer = new Api.InputPeerChat({ chatId: lastPeer.chatId })
      }
    }

    // === Сборка user map + top message map ===
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const users = new Map<number, any>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const topMsgById = new Map<number, any>()
    for (const resp of pages) {
      for (const u of resp.users ?? []) users.set(Number(u.id), u)
      for (const m of resp.messages ?? []) {
        if (m.className === 'Message' && m.peerId?.userId) {
          const uid = Number(m.peerId.userId)
          if (!topMsgById.has(uid)) topMsgById.set(uid, m)
        }
      }
    }

    // === Для каждого user-диалога решаем нужен ли GetHistory ===
    for (const resp of pages) {
      for (const d of resp.dialogs ?? []) {
        if (Date.now() > deadline) break
        if (d.peer?.className !== 'PeerUser') continue
        const userId = Number(d.peer.userId)
        const userObj = users.get(userId)
        if (!userObj || userObj.self || userObj.bot) continue

        const topMsg = topMsgById.get(userId)
        const topDate = topMsg ? Number(topMsg.date) || 0 : 0
        const unreadCount = Number(d.unreadCount ?? 0)

        // Возвращаем ВСЕ пользовательские диалоги из GetDialogs с их unreadCount —
        // это источник истины для статуса прочитано/непрочитано. Фильтрация (не
        // создавать пустые conversations на «чистом старте») делается на стороне
        // manager-sync: там сверяем с существующими записями в БД.
        allDialogs.push({
          peerTelegramId: userId,
          peerUsername: userObj.username ?? null,
          peerFirstName: userObj.firstName ?? null,
          peerHasPhoto: Boolean(userObj.photo && userObj.photo.className !== 'UserProfilePhotoEmpty'),
          unreadCount,
          topMessageDate: topDate ? new Date(topDate * 1000).toISOString() : null,
          topMessageId: topMsg?.id ? Number(topMsg.id) : null,
          readInboxMaxId: Number(d.readInboxMaxId ?? 0),
        })

        // Skip GetHistory если топ-сообщение старее sinceIso (unread-only диалоги всё равно
        // возвращаем, чтобы синк смог обнулить unread в БД когда пользователь прочтёт в TG)
        if (sinceTs && topDate < sinceTs) continue

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const history: any = await client.invoke(new Api.messages.GetHistory({
            peer: userObj,
            limit: messagesPerDialog,
            offsetId: 0,
            offsetDate: 0,
            addOffset: 0,
            maxId: 0,
            minId: 0,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            hash: 0 as any,
          }))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const m of (history.messages ?? []) as any[]) {
            if (m.className !== 'Message') continue
            const msgDate = Number(m.date) || 0
            if (sinceTs && msgDate < sinceTs) continue
            allMessages.push({
              messageId: Number(m.id),
              peerTelegramId: userId,
              peerUsername: userObj.username ?? null,
              peerFirstName: userObj.firstName ?? null,
              text: m.message ?? null,
              mediaType: m.media ? (m.media.className || 'unknown') : null,
              sentAt: new Date(msgDate * 1000).toISOString(),
              isOutgoing: Boolean(m.out),
            })
          }
        } catch (err) {
          console.error('fetchManagerDialogs history err for user', userId, err)
        }
      }
    }
  } finally {
    await client.disconnect().catch(() => null)
  }
  return { messages: allMessages, dialogs: allDialogs }
}

/**
 * Скачивает фото профиля пользователя через MTProto (downloadProfilePhoto).
 * Возвращает Buffer с jpeg-данными или null если у пира нет фото / скрыто настройками.
 */
export async function downloadPeerAvatar(params: {
  apiId: number
  apiHash: string
  sessionString: string
  peerTelegramId: number
  peerUsername?: string | null
}): Promise<Buffer | null> {
  const client = await createClient(params.apiId, params.apiHash, params.sessionString)
  try {
    const { Api } = await import('telegram')
    // Прогрев peer cache
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

    const cleanUsername = params.peerUsername?.replace(/^@/, '') || null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let entity: any = null
    if (cleanUsername) {
      try { entity = await client.getEntity(cleanUsername) } catch { /* fallback */ }
    }
    if (!entity) {
      try { entity = await client.getEntity(params.peerTelegramId) } catch { return null }
    }
    if (!entity) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer: any = await client.downloadProfilePhoto(entity, { isBig: false })
    if (!buffer || (Buffer.isBuffer(buffer) && buffer.length === 0)) return null
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  } catch (err) {
    console.error('downloadPeerAvatar error:', err)
    return null
  } finally {
    await client.disconnect().catch(() => null)
  }
}

/**
 * Помечает весь диалог как прочитанный на стороне Telegram (ReadHistory).
 * Важно: для надёжного resolve peer'а сначала подгружаем свежий список диалогов
 * в session cache, и используем username вместо bare id когда доступен.
 * Без этого getInputEntity падает для peer'ов, которые появились ПОСЛЕ логина
 * (напр. новый клиент написал первый раз) — session string из БД не знает их access_hash.
 */
export async function markDialogAsRead(params: {
  apiId: number
  apiHash: string
  sessionString: string
  peerTelegramId: number
  peerUsername?: string | null
  maxId?: number
}): Promise<void> {
  const client = await createClient(params.apiId, params.apiHash, params.sessionString)
  try {
    const { Api } = await import('telegram')
    // Прогреваем peer cache последним списком диалогов — чтобы access_hash был доступен
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
    } catch (e) {
      console.error('markDialogAsRead GetDialogs warmup failed:', e)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let peer: any
    const cleanUsername = params.peerUsername?.replace(/^@/, '') || null
    if (cleanUsername) {
      try { peer = await client.getInputEntity(cleanUsername) } catch { /* fallback ниже */ }
    }
    if (!peer) {
      peer = await client.getInputEntity(params.peerTelegramId)
    }

    // maxId=0 означает «read all» но в некоторых случаях Telegram игнорирует —
    // передаём конкретный id если известен
    const maxId = params.maxId && params.maxId > 0 ? params.maxId : 0
    await client.invoke(new Api.messages.ReadHistory({ peer, maxId }))
  } finally {
    await client.disconnect().catch(() => null)
  }
}

/**
 * Отправка сообщения от имени менеджера (через MTProto).
 * Сначала прогреваем peer cache через GetDialogs — без этого StringSession
 * из БД не знает access_hash для клиентов, которые появились после логина.
 * Плюс пробуем resolve по username если он передан.
 */
export async function sendManagerMessage(params: {
  apiId: number
  apiHash: string
  sessionString: string
  peerTelegramId: number
  peerUsername?: string | null
  text: string
}): Promise<{ messageId: number } | null> {
  const { apiId, apiHash, sessionString, peerTelegramId, peerUsername, text } = params
  const client = await createClient(apiId, apiHash, sessionString)
  try {
    const { Api } = await import('telegram')

    // Прогрев peer cache — без этого getInputEntity падает для новых клиентов
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
    } catch (e) {
      console.error('sendManagerMessage GetDialogs warmup failed:', e)
    }

    // Пытаемся сначала resolve через username (не требует access_hash),
    // потом fallback на peerTelegramId (из прогретого cache)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let peer: any
    const cleanUsername = peerUsername?.replace(/^@/, '') || null
    if (cleanUsername) {
      try { peer = await client.getInputEntity(cleanUsername) } catch { /* fallback */ }
    }
    if (!peer) {
      peer = await client.getInputEntity(peerTelegramId)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await client.invoke(new Api.messages.SendMessage({
      peer,
      message: text,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      randomId: BigInt(Date.now() * 1000 + Math.floor(Math.random() * 1000)) as any,
    }))
    // Ищем id из Updates
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any[] = result.updates ?? [result]
    for (const u of updates) {
      if (u.className === 'UpdateMessageID' && u.id) return { messageId: Number(u.id) }
      if (u.className === 'UpdateShortSentMessage' && u.id) return { messageId: Number(u.id) }
    }
    return { messageId: 0 }
  } finally {
    await client.disconnect().catch(() => null)
  }
}
