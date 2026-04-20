import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getChat } from '@/lib/telegram'

export const runtime = 'nodejs'
export const maxDuration = 60

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/social/telegram/discover
 * Body: { projectId }
 *
 * Находит все Telegram-каналы где бот(ы) проекта являются администраторами —
 * и добавляет их в social_accounts. Источники данных:
 *  1. Накопленные в БД события chat_member (webhook уже пишет — см. telegram/webhook/route.ts)
 *     Каждое событие содержит chat.id канала.
 *  2. Явно сконфигурированный channel_id у телеграм-бота (поле telegram_bots.channel_id).
 *
 * Для каждого найденного chat_id делаем getChat чтобы подтянуть title/username/avatar.
 */
export async function POST(request: NextRequest) {
  try {
    const { projectId } = await request.json()
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

    const supabase = getSupabase()

    // 1. Все активные боты проекта
    const { data: bots } = await supabase
      .from('telegram_bots')
      .select('id, token, channel_id')
      .eq('project_id', projectId)
      .eq('is_active', true)

    if (!bots || bots.length === 0) {
      return NextResponse.json({ found: 0, added: 0, hint: 'Нет активных Telegram-ботов в проекте' })
    }

    // 2. Собираем кандидатов: channel_id из telegram_bots + уникальные chat.id
    //    из событий customer_actions где action=channel_subscribed
    const candidates = new Map<string, { botId: string; botToken: string; chatId: string }>()

    for (const bot of bots) {
      if (bot.channel_id) {
        candidates.set(bot.channel_id, { botId: bot.id, botToken: bot.token, chatId: bot.channel_id })
      }
    }

    // Из логов подписок (customer_actions с action=channel_subscribed)
    const { data: subEvents } = await supabase
      .from('customer_actions')
      .select('data')
      .eq('project_id', projectId)
      .eq('action', 'channel_subscribed')
      .limit(500)

    for (const ev of subEvents ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const channelId = (ev.data as any)?.channel_id
      if (!channelId) continue
      if (candidates.has(String(channelId))) continue
      // Для "новых" каналов найдём первого бота как ответственного
      candidates.set(String(channelId), { botId: bots[0].id, botToken: bots[0].token, chatId: String(channelId) })
    }

    let found = 0
    let added = 0

    for (const [, cand] of candidates) {
      found++
      try {
        const chat = await getChat(cand.botToken, cand.chatId)
        if (!chat.ok) continue
        const c = chat.result
        // Пропускаем если это не канал
        if (c.type !== 'channel' && c.type !== 'supergroup') continue

        // upsert в social_accounts
        const { data: existing } = await supabase
          .from('social_accounts')
          .select('id')
          .eq('project_id', projectId)
          .eq('platform', 'telegram')
          .eq('external_id', String(c.id))
          .maybeSingle()

        const metadata: Record<string, unknown> = {
          description: c.description ?? null,
          type: c.type,
        }

        // Попробуем узнать число подписчиков
        try {
          const cntRes = await fetch(`https://api.telegram.org/bot${cand.botToken}/getChatMemberCount?chat_id=${c.id}`)
          const cntJson = await cntRes.json()
          if (cntJson.ok) metadata.subscribers_count = cntJson.result
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_) { /* ignore */ }

        if (existing) {
          await supabase.from('social_accounts').update({
            external_username: c.username ? '@' + c.username : null,
            external_title: c.title ?? null,
            external_avatar_url: null, // Bot API не даёт прямой URL к аватару без загрузки файла — пропустим
            telegram_bot_id: cand.botId,
            metadata,
            last_sync_at: new Date().toISOString(),
            is_active: true,
          }).eq('id', existing.id)
        } else {
          await supabase.from('social_accounts').insert({
            project_id: projectId,
            platform: 'telegram',
            external_id: String(c.id),
            external_username: c.username ? '@' + c.username : null,
            external_title: c.title ?? null,
            external_avatar_url: null,
            telegram_bot_id: cand.botId,
            metadata,
            last_sync_at: new Date().toISOString(),
          })
          added++
        }
      } catch (err) {
        console.error('discover getChat error for', cand.chatId, err)
      }
    }

    return NextResponse.json({ found, added })
  } catch (err) {
    console.error('social discover error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
