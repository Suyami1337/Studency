import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decryptSecret } from '@/lib/crypto-vault'
import { revokeSession } from '@/lib/telegram-mtproto'

export const runtime = 'nodejs'

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(request: NextRequest) {
  try {
    const { accountId } = await request.json()
    if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 })

    const supabase = getSupabase()
    const { data: acc } = await supabase
      .from('manager_accounts')
      .select('mtproto_api_id, mtproto_api_hash_enc, mtproto_session_enc')
      .eq('id', accountId)
      .single()

    if (acc?.mtproto_session_enc && acc.mtproto_api_hash_enc) {
      try {
        await revokeSession(
          Number(acc.mtproto_api_id),
          decryptSecret(acc.mtproto_api_hash_enc),
          decryptSecret(acc.mtproto_session_enc),
        )
      } catch (err) { console.error('manager logout remote:', err) }
    }

    await supabase.from('manager_accounts').update({
      status: 'disabled',
      mtproto_session_enc: null,
      mtproto_api_hash_enc: null,
      mtproto_phone_enc: null,
    }).eq('id', accountId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal' }, { status: 500 })
  }
}
