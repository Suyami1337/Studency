import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scrapeTelegramChannel } from '@/lib/telegram-channel-scraper'

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
 *   1. Снимает snapshot числа подписчиков (через getChatMemberCount)
 *   2. Для публичных каналов (с username) парсит t.me/s/ и обновляет
 *      social_content_items (посты с просмотрами + реакциями)
 *
 * Вызывается внешним cron-job.org раз в час (не каждую минуту —
 * Telegram может забанить за флуд парсинга).
 */
export async function GET(_request: NextRequest) {
  const supabase = getSupabase()
  const { data: accounts } = await supabase
    .from('social_accounts')
    .select('id, project_id, external_id, external_username, telegram_bot_id, metadata')
    .eq('platform', 'telegram')
    .eq('is_active', true)
    .limit(100)

  const results: Array<{ id: string; ok: boolean; note?: string }> = []

  for (const acc of accounts ?? []) {
    try {
      // 1. Snapshot подписчиков
      let subsCount: number | null = null
      if (acc.telegram_bot_id) {
        const { data: bot } = await supabase
          .from('telegram_bots').select('token').eq('id', acc.telegram_bot_id).single()
        if (bot?.token) {
          const cntRes = await fetch(`https://api.telegram.org/bot${bot.token}/getChatMemberCount?chat_id=${acc.external_id}`)
          const cntJson = await cntRes.json()
          if (cntJson.ok) subsCount = cntJson.result
        }
      }

      if (subsCount !== null) {
        await supabase.from('social_subscribers_snapshots').insert({
          account_id: acc.id,
          subscribers_count: subsCount,
        })
        // Обновляем metadata для быстрого чтения на дашборде
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const md = { ...(acc.metadata as Record<string, any>), subscribers_count: subsCount }
        await supabase.from('social_accounts').update({ metadata: md, last_sync_at: new Date().toISOString() }).eq('id', acc.id)
      }

      // 2. Парсинг постов — только для публичных каналов
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
          }
          results.push({ id: acc.id, ok: true, note: `subs=${subsCount}, posts=${posts.length}` })
        } catch (err) {
          results.push({ id: acc.id, ok: true, note: `subs=${subsCount}, scrape_error=${err instanceof Error ? err.message : 'unknown'}` })
        }
      } else {
        results.push({ id: acc.id, ok: true, note: `subs=${subsCount}, no_username (приватный канал)` })
      }

      await supabase.from('social_accounts').update({
        last_sync_at: new Date().toISOString(),
        sync_error: null,
      }).eq('id', acc.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown'
      await supabase.from('social_accounts').update({ sync_error: msg }).eq('id', acc.id)
      results.push({ id: acc.id, ok: false, note: msg })
    }
  }

  return NextResponse.json({ ok: true, synced: results.length, results })
}
