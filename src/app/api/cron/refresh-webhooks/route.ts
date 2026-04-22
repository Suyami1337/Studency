import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { setTelegramWebhook } from '@/lib/telegram'

export const runtime = 'nodejs'
export const maxDuration = 60

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * GET /api/cron/refresh-webhooks
 *
 * Переустанавливает webhook у всех активных ботов с актуальным allowed_updates.
 * Идемпотентно — Telegram просто обновляет конфигурацию.
 *
 * Зачем: когда мы добавляем новый тип update в allowed_updates (например
 * callback_query), старые боты его не получают, пока webhook не переустановлен.
 * Этот cron автоматически держит все боты в актуальном состоянии.
 *
 * Запускается cron-job.org раз в сутки.
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabase()

  const { data: bots } = await supabase
    .from('telegram_bots')
    .select('id, name, token')
    .eq('is_active', true)

  if (!bots || bots.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, failed: 0, message: 'no active bots' })
  }

  // Строим base URL так же как в /api/telegram/setup
  let baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  baseUrl = baseUrl.replace('://studency.ru', '://www.studency.ru').replace(/\/$/, '')

  let updated = 0
  let failed = 0
  const errors: Array<{ bot: string; error: string }> = []

  for (const bot of bots) {
    try {
      const webhookUrl = `${baseUrl}/api/telegram/webhook?token=${bot.token}`
      const result = await setTelegramWebhook(bot.token, webhookUrl)
      if (result.ok) {
        await supabase.from('telegram_bots').update({ webhook_url: webhookUrl }).eq('id', bot.id)
        updated++
      } else {
        failed++
        errors.push({ bot: bot.name, error: result.description || 'setWebhook failed' })
      }
    } catch (err) {
      failed++
      errors.push({ bot: bot.name, error: err instanceof Error ? err.message : 'unknown' })
    }
  }

  return NextResponse.json({ ok: true, total: bots.length, updated, failed, errors })
}
