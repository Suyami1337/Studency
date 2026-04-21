import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decryptSecret } from '@/lib/crypto-vault'
import { revokeSession } from '@/lib/telegram-mtproto'

export const runtime = 'nodejs'

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * POST /api/social/telegram/manager/logout
 * Body: { accountId }
 *
 * Полностью удаляет менеджер-аккаунт:
 * 1. Отзывает session в Telegram (если получится — не блокирует удаление при ошибке)
 * 2. DELETE из manager_accounts — cascade удалит manager_conversations, manager_messages,
 *    manager_account_grants через FK ON DELETE CASCADE.
 * После этого можно заново подключить аккаунт с нуля.
 */
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

    // Попытка отозвать session в Telegram — если ошибка, всё равно удаляем из БД
    if (acc?.mtproto_session_enc && acc.mtproto_api_hash_enc) {
      try {
        await revokeSession(
          Number(acc.mtproto_api_id),
          decryptSecret(acc.mtproto_api_hash_enc),
          decryptSecret(acc.mtproto_session_enc),
        )
      } catch (err) {
        console.error('manager logout remote revoke failed (продолжаем удаление из БД):', err)
      }
    }

    const { error } = await supabase.from('manager_accounts').delete().eq('id', accountId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal' }, { status: 500 })
  }
}
