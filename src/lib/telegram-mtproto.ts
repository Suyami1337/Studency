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
  isOutgoing: boolean  // сообщение отправлено менеджером (не клиентом)
}

/**
 * Достаёт входящие (и исходящие) сообщения из личных диалогов менеджера за
 * последние N дней или новее указанной даты. Только приватные чаты (user-to-user),
 * каналы и группы игнорим.
 */
export async function fetchManagerDialogs(params: {
  apiId: number
  apiHash: string
  sessionString: string
  /** Только сообщения новее этой даты (UTC ISO) — для incremental */
  sinceIso?: string
  /** Максимум диалогов за вызов */
  maxDialogs?: number
  /** Максимум сообщений на диалог */
  messagesPerDialog?: number
}): Promise<IncomingMessage[]> {
  const { apiId, apiHash, sessionString, sinceIso, maxDialogs = 100, messagesPerDialog = 100 } = params
  const sinceTs = sinceIso ? Math.floor(new Date(sinceIso).getTime() / 1000) : 0
  const client = await createClient(apiId, apiHash, sessionString)
  const all: IncomingMessage[] = []
  // Временной бюджет — 50 сек (при Vercel maxDuration 60 оставляем запас)
  const deadline = Date.now() + 50_000
  try {
    const { Api } = await import('telegram')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dialogs: any = await client.invoke(new Api.messages.GetDialogs({
      offsetDate: 0,
      offsetId: 0,
      offsetPeer: new Api.InputPeerEmpty(),
      limit: maxDialogs,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hash: 0 as any,
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const users = new Map<number, any>()
    for (const u of dialogs.users ?? []) users.set(Number(u.id), u)

    // Собираем top message id для каждого диалога — чтоб оценить нужен ли GetHistory
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const topMsgById = new Map<number, any>()
    for (const m of dialogs.messages ?? []) {
      if (m.className === 'Message' && m.peerId?.userId) {
        const uid = Number(m.peerId.userId)
        if (!topMsgById.has(uid)) topMsgById.set(uid, m)
      }
    }

    for (const d of dialogs.dialogs ?? []) {
      if (Date.now() > deadline) break  // кончилось время — выходим, следующий cron подхватит
      // peer типа PeerUser = личный диалог
      if (d.peer?.className !== 'PeerUser') continue
      const userId = Number(d.peer.userId)
      const userObj = users.get(userId)
      if (!userObj || userObj.self || userObj.bot) continue  // пропускаем себя и ботов

      // Оптимизация: если sinceIso задан и top message диалога старее —
      // GetHistory не нужен, в этом диалоге нет новых сообщений.
      if (sinceTs) {
        const topMsg = topMsgById.get(userId)
        if (topMsg && Number(topMsg.date) < sinceTs) continue
      }

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
          all.push({
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
  } finally {
    await client.disconnect().catch(() => null)
  }
  return all
}

/** Отправка сообщения от имени менеджера (через MTProto). */
export async function sendManagerMessage(params: {
  apiId: number
  apiHash: string
  sessionString: string
  peerTelegramId: number
  text: string
}): Promise<{ messageId: number } | null> {
  const { apiId, apiHash, sessionString, peerTelegramId, text } = params
  const client = await createClient(apiId, apiHash, sessionString)
  try {
    const { Api } = await import('telegram')
    // Получаем InputUser через resolveUsername или прямо по id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const peer: any = await client.getInputEntity(peerTelegramId)
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
