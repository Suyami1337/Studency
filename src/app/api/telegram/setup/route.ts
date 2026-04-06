import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { setTelegramWebhook, getTelegramBotInfo } from '@/lib/telegram'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { token, projectId, name } = await request.json()

    // Verify token with Telegram
    const botInfo = await getTelegramBotInfo(token)
    if (!botInfo.ok) {
      return NextResponse.json({ error: 'Невалидный токен бота' }, { status: 400 })
    }

    const botUsername = botInfo.result.username

    // Save bot to database
    const { data: bot, error } = await supabase
      .from('telegram_bots')
      .insert({
        project_id: projectId,
        name: name || botInfo.result.first_name,
        token,
        bot_username: botUsername,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Set webhook
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
    const webhookUrl = `${baseUrl}/api/telegram/webhook?token=${token}`

    const webhookResult = await setTelegramWebhook(token, webhookUrl)

    if (webhookResult.ok) {
      await supabase
        .from('telegram_bots')
        .update({ webhook_url: webhookUrl })
        .eq('id', bot.id)
    }

    return NextResponse.json({
      ok: true,
      bot: {
        id: bot.id,
        name: bot.name,
        username: botUsername,
        webhook_set: webhookResult.ok,
      },
    })
  } catch (error) {
    console.error('Setup error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
