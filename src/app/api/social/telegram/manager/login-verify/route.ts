import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { encryptSecret, decryptSecret } from '@/lib/crypto-vault'
import { completeLogin } from '@/lib/telegram-mtproto'

export const runtime = 'nodejs'
export const maxDuration = 120

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * POST /api/social/telegram/manager/login-verify
 * Body: { flowId, code, password? }
 *
 * Если seed metadata.kind='manager' — создаём запись в manager_accounts
 * (в отличие от channels flow, который привязывает session к social_accounts).
 * После успеха запускаем первичный импорт последних 30 дней в фоне.
 */
export async function POST(request: NextRequest) {
  try {
    const { flowId, code, password } = await request.json()
    if (!flowId || !code) return NextResponse.json({ error: 'flowId и code обязательны' }, { status: 400 })

    const supabase = getSupabase()
    const { data: flow } = await supabase.from('social_mtproto_login_flows').select('*').eq('id', flowId).single()
    if (!flow) return NextResponse.json({ error: 'Login flow не найден' }, { status: 404 })
    if (new Date(flow.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Login flow истёк' }, { status: 410 })
    }

    const apiHash = decryptSecret(flow.api_hash_enc)
    const phone = decryptSecret(flow.phone_enc)
    const phoneCodeHash = decryptSecret(flow.phone_code_hash_enc)
    const seedRaw = decryptSecret(flow.session_seed_enc)

    // Распаковываем metadata если есть (manager flow), иначе старый flow каналов
    let sessionSeed = seedRaw
    let kind: 'manager' | 'channel' = 'channel'
    let title: string | null = null
    try {
      const parsed = JSON.parse(seedRaw)
      if (parsed && typeof parsed === 'object' && parsed.kind === 'manager') {
        kind = 'manager'
        title = parsed.title ?? null
        sessionSeed = parsed.session
      }
    } catch { /* plain seed */ }

    if (kind !== 'manager') {
      return NextResponse.json({ error: 'Этот flow не для manager-аккаунта, используй /mtproto/login-verify' }, { status: 400 })
    }

    let sessionString: string
    try {
      sessionString = await completeLogin(
        Number(flow.api_id), apiHash, sessionSeed, phone, phoneCodeHash,
        String(code), password ? String(password) : undefined,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === '2FA_PASSWORD_REQUIRED') {
        return NextResponse.json({ error: 'Введите пароль 2FA', needs_password: true }, { status: 400 })
      }
      return NextResponse.json({ error: 'Telegram: ' + msg }, { status: 400 })
    }

    // Вытаскиваем me чтобы узнать telegram_user_id / username
    let tgUserId: number | null = null
    let tgUsername: string | null = null
    let tgFirstName: string | null = null
    try {
      const { TelegramClient } = await import('telegram')
      const { StringSession } = await import('telegram/sessions')
      const client = new TelegramClient(new StringSession(sessionString), Number(flow.api_id), apiHash, { connectionRetries: 2 })
      await client.connect()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const me: any = await client.getMe()
      tgUserId = Number(me?.id ?? 0) || null
      tgUsername = me?.username ?? null
      tgFirstName = me?.firstName ?? null
      await client.disconnect()
    } catch (err) {
      console.error('manager getMe failed:', err)
    }

    const { data: account, error: accErr } = await supabase
      .from('manager_accounts')
      .insert({
        project_id: flow.project_id,
        title: title ?? tgFirstName ?? null,
        telegram_user_id: tgUserId,
        telegram_username: tgUsername,
        telegram_first_name: tgFirstName,
        telegram_phone: phone.slice(-4),
        mtproto_api_id: flow.api_id,
        mtproto_api_hash_enc: encryptSecret(apiHash),
        mtproto_session_enc: encryptSecret(sessionString),
        mtproto_phone_enc: encryptSecret(phone),
        status: 'active',
      })
      .select()
      .single()

    await supabase.from('social_mtproto_login_flows').delete().eq('id', flowId)

    if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 })

    // Fire-and-forget: первичный импорт (30 дней)
    void fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://www.studency.ru'}/api/social/telegram/manager/import-history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: account.id, days: 30 }),
    }).catch(() => null)

    return NextResponse.json({ ok: true, account_id: account.id })
  } catch (err) {
    console.error('manager login-verify error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal' }, { status: 500 })
  }
}
