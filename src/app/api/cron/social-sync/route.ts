import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scrapeTelegramChannel } from '@/lib/telegram-channel-scraper'
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
 * GET /api/cron/social-sync
 *
 * Для каждого активного social_account типа telegram:
 *  - Если подключён MTProto → берём подписчиков + посты с просмотрами/форвардами через user-аккаунт
 *  - Иначе → подписчиков через Bot API (getChatMemberCount),
 *    посты для публичных каналов парсим t.me/s/
 *
 * Вызывается внешним cron-job.org раз в час.
 */
export async function GET(_request: NextRequest) {
  const supabase = getSupabase()
  const { data: accounts } = await supabase
    .from('social_accounts')
    .select('id, project_id, external_id, external_username, telegram_bot_id, metadata, mtproto_api_id, mtproto_api_hash_enc, mtproto_session_enc')
    .eq('platform', 'telegram')
    .eq('is_active', true)
    .limit(100)

  const results: Array<{ id: string; ok: boolean; note?: string }> = []

  for (const acc of accounts ?? []) {
    try {
      const hasMtproto = Boolean(acc.mtproto_session_enc && acc.mtproto_api_hash_enc && acc.mtproto_api_id)
      let subsCount: number | null = null
      let postsSynced = 0

      if (hasMtproto) {
        // MTProto path — full fidelity
        try {
          const apiHash = decryptSecret(acc.mtproto_api_hash_enc!)
          const session = decryptSecret(acc.mtproto_session_enc!)
          const identifier = acc.external_username ?? (acc.external_id.startsWith('-') ? Number(acc.external_id) : acc.external_id)
          const stats = await fetchChannelStats(Number(acc.mtproto_api_id), apiHash, session, identifier, 50)
          subsCount = stats.subscribersCount

          // Snapshot
          await supabase.from('social_subscribers_snapshots').insert({ account_id: acc.id, subscribers_count: subsCount })

          // Update account metadata
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const md = { ...(acc.metadata as Record<string, any>), subscribers_count: subsCount, description: stats.description }
          await supabase.from('social_accounts').update({
            metadata: md,
            external_title: stats.title ?? null,
            external_username: stats.username ? '@' + stats.username.replace(/^@/, '') : acc.external_username,
            last_sync_at: new Date().toISOString(),
            mtproto_last_sync_at: new Date().toISOString(),
            mtproto_status: 'connected',
            mtproto_last_error: null,
            sync_error: null,
          }).eq('id', acc.id)

          // Posts with views/forwards
          for (const p of stats.postsWithViews) {
            const { error } = await supabase.from('social_content_items').upsert({
              account_id: acc.id,
              external_id: String(p.id),
              type: 'tg_post',
              url: acc.external_username ? `https://t.me/${acc.external_username.replace(/^@/, '')}/${p.id}` : null,
              published_at: p.date,
              metrics: { views: p.views, forwards: p.forwards },
              last_metrics_update_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: 'account_id,external_id' })
            if (!error) postsSynced++
          }

          results.push({ id: acc.id, ok: true, note: `mtproto: subs=${subsCount}, posts=${postsSynced}` })
          continue
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'mtproto error'
          await supabase.from('social_accounts').update({ mtproto_status: 'error', mtproto_last_error: msg }).eq('id', acc.id)
          // Падаем на Bot API путь ниже
        }
      }

      // Bot API fallback path
      if (acc.telegram_bot_id) {
        const { data: bot } = await supabase.from('telegram_bots').select('token').eq('id', acc.telegram_bot_id).single()
        if (bot?.token) {
          const cntRes = await fetch(`https://api.telegram.org/bot${bot.token}/getChatMemberCount?chat_id=${acc.external_id}`)
          const cntJson = await cntRes.json()
          if (cntJson.ok) subsCount = cntJson.result
        }
      }

      if (subsCount !== null) {
        await supabase.from('social_subscribers_snapshots').insert({ account_id: acc.id, subscribers_count: subsCount })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const md = { ...(acc.metadata as Record<string, any>), subscribers_count: subsCount }
        await supabase.from('social_accounts').update({ metadata: md, last_sync_at: new Date().toISOString() }).eq('id', acc.id)
      }

      const uname = acc.external_username
      if (uname) {
        try {
          const posts = await scrapeTelegramChannel(uname, 30)
          for (const p of posts) {
            await supabase.from('social_content_items').upsert({
              account_id: acc.id,
              external_id: p.externalId,
              type: 'tg_post',
              title: p.text.split('\n')[0].slice(0, 200) || null,
              body: p.text,
              url: p.url,
              thumbnail_url: null,
              published_at: p.publishedAt,
              metrics: {
                views: p.views ?? 0,
                reactions: p.reactions ?? 0,
                forwards: p.forwards ?? 0,
                replies: p.replies ?? 0,
                media_type: p.mediaType,
              },
              last_metrics_update_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: 'account_id,external_id' })
            postsSynced++
          }
          results.push({ id: acc.id, ok: true, note: `bot: subs=${subsCount}, posts=${postsSynced}` })
        } catch (err) {
          results.push({ id: acc.id, ok: true, note: `bot: subs=${subsCount}, scrape_error=${err instanceof Error ? err.message : 'unknown'}` })
        }
      } else {
        results.push({ id: acc.id, ok: true, note: `bot: subs=${subsCount}, приватный канал (рекомендуем MTProto)` })
      }

      await supabase.from('social_accounts').update({ sync_error: null }).eq('id', acc.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown'
      await supabase.from('social_accounts').update({ sync_error: msg }).eq('id', acc.id)
      results.push({ id: acc.id, ok: false, note: msg })
    }
  }

  // Clean up expired login flows (housekeeping)
  await supabase.from('social_mtproto_login_flows').delete().lt('expires_at', new Date().toISOString())

  return NextResponse.json({ ok: true, synced: results.length, results })
}
