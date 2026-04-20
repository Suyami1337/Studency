import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decryptSecret } from '@/lib/crypto-vault'
import { revokeSession } from '@/lib/telegram-mtproto'

export const runtime = 'nodejs'
export const maxDuration = 60

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/social/telegram/mtproto/logout
 * Body: { accountId }
 *
 * Вызывает auth.logOut в Telegram (session на стороне TG становится
 * невалидной) и стирает расшифрованные credentials из БД.
 */
export async function POST(request: NextRequest) {
  try {
    const { accountId } = await request.json()
    if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 })

    const supabase = getSupabase()
    const { data: acc } = await supabase
      .from('social_accounts')
      .select('id, mtproto_api_id, mtproto_api_hash_enc, mtproto_session_enc')
      .eq('id', accountId)
      .single()

    if (!acc) return NextResponse.json({ error: 'account not found' }, { status: 404 })

    if (acc.mtproto_session_enc && acc.mtproto_api_hash_enc && acc.mtproto_api_id) {
      try {
        await revokeSession(
          Number(acc.mtproto_api_id),
          decryptSecret(acc.mtproto_api_hash_enc),
          decryptSecret(acc.mtproto_session_enc),
        )
      } catch (err) {
        // Даже если логаут не удался — чистим БД
        console.error('mtproto logout remote error:', err)
      }
    }

    await supabase.from('social_accounts').update({
      mtproto_api_id: null,
      mtproto_api_hash_enc: null,
      mtproto_session_enc: null,
      mtproto_phone_enc: null,
      mtproto_status: null,
      mtproto_connected_at: null,
      mtproto_last_sync_at: null,
      mtproto_last_error: null,
    }).eq('id', accountId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('mtproto logout error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
