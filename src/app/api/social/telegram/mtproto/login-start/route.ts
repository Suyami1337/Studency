import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { encryptSecret } from '@/lib/crypto-vault'
import { sendLoginCode } from '@/lib/telegram-mtproto'

export const runtime = 'nodejs'
export const maxDuration = 60

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/social/telegram/mtproto/login-start
 * Body: { projectId, apiId, apiHash, phone }
 *
 * 1. Вызывает auth.sendCode — Telegram шлёт код в Telegram-приложение пользователя
 * 2. Сохраняет промежуточные данные (api_hash, phone, phone_code_hash, session_seed)
 *    в social_mtproto_login_flows в шифрованном виде
 * 3. Возвращает flow_id чтобы клиент мог завершить логин через /login-verify
 */
export async function POST(request: NextRequest) {
  try {
    const { projectId, apiId, apiHash, phone } = await request.json()
    if (!projectId || !apiId || !apiHash || !phone) {
      return NextResponse.json({ error: 'projectId, apiId, apiHash, phone обязательны' }, { status: 400 })
    }

    const apiIdNum = Number(apiId)
    if (!Number.isFinite(apiIdNum) || apiIdNum <= 0) {
      return NextResponse.json({ error: 'apiId должен быть числом' }, { status: 400 })
    }

    let codeResult
    try {
      codeResult = await sendLoginCode(apiIdNum, String(apiHash), String(phone))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: 'Telegram: ' + msg, hint: 'Проверь что api_id и api_hash верные (с my.telegram.org) и номер в международном формате +79...' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { data: flow, error } = await supabase
      .from('social_mtproto_login_flows')
      .insert({
        project_id: projectId,
        api_id: apiIdNum,
        api_hash_enc: encryptSecret(String(apiHash)),
        phone_enc: encryptSecret(String(phone)),
        phone_code_hash_enc: encryptSecret(codeResult.phoneCodeHash),
        session_seed_enc: encryptSecret(codeResult.sessionSeed),
      })
      .select('id, expires_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, flow_id: flow.id, expires_at: flow.expires_at })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    console.error('mtproto login-start error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
