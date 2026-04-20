import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { encryptSecret } from '@/lib/crypto-vault'
import { sendLoginCode } from '@/lib/telegram-mtproto'

export const runtime = 'nodejs'
export const maxDuration = 60

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * POST /api/social/telegram/manager/login-start
 * Body: { projectId, apiId, apiHash, phone, title? }
 *
 * Sendcode + сохраняем flow в social_mtproto_login_flows (тот же механизм что
 * для каналов), плюс в api_hash_enc добавим marker 'manager' через metadata
 * чтобы login-verify знал что это для manager_accounts а не social_accounts.
 */
export async function POST(request: NextRequest) {
  try {
    const { projectId, apiId, apiHash, phone, title } = await request.json()
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
      return NextResponse.json({
        error: 'Telegram: ' + (err instanceof Error ? err.message : String(err)),
        hint: 'Проверь api_id / api_hash (my.telegram.org) и международный формат номера',
      }, { status: 400 })
    }

    const supabase = getSupabase()
    // В сессионный seed закодируем metadata: kind=manager + title
    const seedWithMeta = JSON.stringify({
      kind: 'manager',
      title: title ?? null,
      session: codeResult.sessionSeed,
    })

    const { data: flow, error } = await supabase
      .from('social_mtproto_login_flows')
      .insert({
        project_id: projectId,
        api_id: apiIdNum,
        api_hash_enc: encryptSecret(String(apiHash)),
        phone_enc: encryptSecret(String(phone)),
        phone_code_hash_enc: encryptSecret(codeResult.phoneCodeHash),
        session_seed_enc: encryptSecret(seedWithMeta),
      })
      .select('id, expires_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, flow_id: flow.id, expires_at: flow.expires_at })
  } catch (err) {
    console.error('manager login-start error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal' }, { status: 500 })
  }
}
