import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decryptSecret } from '@/lib/crypto-vault'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * GET /api/social/telegram/manager/debug-unread?accountId=XXX
 * Диагностический: читает GetDialogs через MTProto и возвращает сырой unreadCount
 * по каждому peer, чтобы сравнить с состоянием мобильного Telegram.
 * УДАЛИТЬ после диагностики.
 */
export async function GET(request: NextRequest) {
  try {
    const accountId = request.nextUrl.searchParams.get('accountId')
    if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 })

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: acc } = await supabase
      .from('manager_accounts')
      .select('mtproto_api_id, mtproto_api_hash_enc, mtproto_session_enc')
      .eq('id', accountId)
      .single()
    if (!acc) return NextResponse.json({ error: 'not found' }, { status: 404 })

    const { TelegramClient, Api } = await import('telegram') as typeof import('telegram') & { Api: typeof import('telegram').Api }
    const { StringSession } = await import('telegram/sessions')

    const client = new TelegramClient(
      new StringSession(decryptSecret(acc.mtproto_session_enc!)),
      Number(acc.mtproto_api_id),
      decryptSecret(acc.mtproto_api_hash_enc!),
      { connectionRetries: 2 },
    )
    await client.connect()

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resp: any = await client.invoke(new Api.messages.GetDialogs({
        offsetDate: 0,
        offsetId: 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        offsetPeer: new Api.InputPeerEmpty() as any,
        limit: 50,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hash: 0 as any,
      }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const users = new Map<string, any>()
      for (const u of resp.users ?? []) users.set(String(u.id), u)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dialogs = (resp.dialogs ?? []).filter((d: any) => d.peer?.className === 'PeerUser').map((d: any) => {
        const uid = String(d.peer.userId)
        const u = users.get(uid)
        return {
          userId: uid,
          firstName: u?.firstName ?? null,
          username: u?.username ?? null,
          bot: u?.bot ?? false,
          self: u?.self ?? false,
          unreadCount: Number(d.unreadCount ?? 0),
          readInboxMaxId: d.readInboxMaxId ?? null,
          readOutboxMaxId: d.readOutboxMaxId ?? null,
          topMessage: d.topMessage ?? null,
          unreadMentionsCount: d.unreadMentionsCount ?? 0,
        }
      })

      return NextResponse.json({ ok: true, dialogs })
    } finally {
      await client.disconnect().catch(() => null)
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal' }, { status: 500 })
  }
}
