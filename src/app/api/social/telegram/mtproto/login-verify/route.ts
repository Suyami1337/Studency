import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { encryptSecret, decryptSecret } from '@/lib/crypto-vault'
import { completeLogin } from '@/lib/telegram-mtproto'

export const runtime = 'nodejs'
export const maxDuration = 60

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/social/telegram/mtproto/login-verify
 * Body: { flowId, code, password? }
 *
 * 1. Вытаскивает flow из таблицы по id
 * 2. Через gramjs вызывает auth.signIn (+ checkPassword если 2FA)
 * 3. На успехе — сохраняет зашифрованную session в social_accounts для всех
 *    каналов проекта (или даёт API чтобы применить к конкретному каналу)
 * 4. Удаляет login-flow (использован)
 *
 * Для MVP: session привязывается к проекту целиком (mtproto_status="connected"
 * на тех social_accounts где юзер уже залогинен в канал). Каналы, где этот
 * user-аккаунт тоже админ, автоматом смогут использовать MTProto.
 */
export async function POST(request: NextRequest) {
  try {
    const { flowId, code, password } = await request.json()
    if (!flowId || !code) {
      return NextResponse.json({ error: 'flowId и code обязательны' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { data: flow } = await supabase
      .from('social_mtproto_login_flows')
      .select('*')
      .eq('id', flowId)
      .single()

    if (!flow) return NextResponse.json({ error: 'Login flow не найден или истёк' }, { status: 404 })
    if (new Date(flow.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Login flow истёк, начни заново' }, { status: 410 })
    }

    const apiHash = decryptSecret(flow.api_hash_enc)
    const phone = decryptSecret(flow.phone_enc)
    const phoneCodeHash = decryptSecret(flow.phone_code_hash_enc)
    const sessionSeed = decryptSecret(flow.session_seed_enc)

    let sessionString: string
    try {
      sessionString = await completeLogin(
        Number(flow.api_id),
        apiHash,
        sessionSeed,
        phone,
        phoneCodeHash,
        String(code),
        password ? String(password) : undefined,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === '2FA_PASSWORD_REQUIRED') {
        return NextResponse.json({ error: 'На аккаунте включена двухэтапная проверка. Пришли password.', needs_password: true }, { status: 400 })
      }
      return NextResponse.json({ error: 'Telegram: ' + msg }, { status: 400 })
    }

    // Применяем session ко всем Telegram social_accounts проекта, у которых
    // ещё нет mtproto_session. Так юзер может подключить один user-аккаунт и
    // он автоматом будет работать для всех каналов где он админ.
    const apiHashEnc = encryptSecret(apiHash)
    const phoneEnc = encryptSecret(phone)
    const sessionEnc = encryptSecret(sessionString)

    const { data: accounts } = await supabase
      .from('social_accounts')
      .select('id')
      .eq('project_id', flow.project_id)
      .eq('platform', 'telegram')
      .eq('is_active', true)
      .is('mtproto_status', null)

    let linkedCount = 0
    for (const acc of accounts ?? []) {
      const { error } = await supabase.from('social_accounts').update({
        mtproto_api_id: flow.api_id,
        mtproto_api_hash_enc: apiHashEnc,
        mtproto_phone_enc: phoneEnc,
        mtproto_session_enc: sessionEnc,
        mtproto_status: 'connected',
        mtproto_connected_at: new Date().toISOString(),
        mtproto_last_error: null,
      }).eq('id', acc.id)
      if (!error) linkedCount++
    }

    // Чистим login flow
    await supabase.from('social_mtproto_login_flows').delete().eq('id', flowId)

    return NextResponse.json({ ok: true, linked_channels: linkedCount })
  } catch (err) {
    console.error('mtproto login-verify error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
