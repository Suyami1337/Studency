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
