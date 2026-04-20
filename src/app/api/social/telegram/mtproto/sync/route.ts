import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decryptSecret } from '@/lib/crypto-vault'
import { fetchChannelStats } from '@/lib/telegram-mtproto'

export const runtime = 'nodejs'
export const maxDuration = 60

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/social/telegram/mtproto/sync
 * Body: { accountId }
 *
 * Один аккаунт, вручную запустить. В фоне то же самое делает cron social-sync.
 */
export async function POST(request: NextRequest) {
  try {
    const { accountId } = await request.json()
    if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 })

    const supabase = getSupabase()
    const { data: acc } = await supabase
      .from('social_accounts')
      .select('id, external_id, external_username, mtproto_api_id, mtproto_api_hash_enc, mtproto_session_enc, metadata')
      .eq('id', accountId)
      .single()

    if (!acc) return NextResponse.json({ error: 'account not found' }, { status: 404 })
    if (!acc.mtproto_session_enc || !acc.mtproto_api_hash_enc || !acc.mtproto_api_id) {
      return NextResponse.json({ error: 'MTProto не подключён для этого канала' }, { status: 400 })
    }

    const apiId = Number(acc.mtproto_api_id)
    const apiHash = decryptSecret(acc.mtproto_api_hash_enc)
    const session = decryptSecret(acc.mtproto_session_enc)

    // Используем username если есть, иначе external_id
    const identifier = acc.external_username ?? (acc.external_id.startsWith('-') ? Number(acc.external_id) : acc.external_id)
    let stats
    try {
      stats = await fetchChannelStats(apiId, apiHash, session, identifier, 50)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await supabase.from('social_accounts').update({
        mtproto_status: 'error',
        mtproto_last_error: msg,
      }).eq('id', accountId)
      return NextResponse.json({ error: 'MTProto: ' + msg }, { status: 500 })
    }

    // Обновляем данные канала
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const md = { ...(acc.metadata as Record<string, any>), subscribers_count: stats.subscribersCount, description: stats.description }
    await supabase.from('social_accounts').update({
      metadata: md,
      external_title: stats.title ?? null,
      external_username: stats.username ? '@' + stats.username.replace(/^@/, '') : acc.external_username,
      mtproto_last_sync_at: new Date().toISOString(),
      mtproto_status: 'connected',
      mtproto_last_error: null,
      last_sync_at: new Date().toISOString(),
    }).eq('id', accountId)

    // Snapshot
    await supabase.from('social_subscribers_snapshots').insert({
      account_id: accountId,
      subscribers_count: stats.subscribersCount,
    })

    // Посты — апсертим с просмотрами и форвардами
    let upsertCount = 0
    for (const p of stats.postsWithViews) {
      const { error } = await supabase.from('social_content_items').upsert({
        account_id: accountId,
        external_id: String(p.id),
        type: 'tg_post',
        url: acc.external_username
          ? `https://t.me/${acc.external_username.replace(/^@/, '')}/${p.id}`
          : null,
        published_at: p.date,
        metrics: {
          views: p.views,
          forwards: p.forwards,
        },
        last_metrics_update_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'account_id,external_id' })
      if (!error) upsertCount++
    }

    return NextResponse.json({
      ok: true,
      subscribers: stats.subscribersCount,
      posts_synced: upsertCount,
    })
  } catch (err) {
    console.error('mtproto sync error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
