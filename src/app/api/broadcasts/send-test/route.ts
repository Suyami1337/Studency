import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendFollowupContent } from '@/lib/scenario-sender'

export const runtime = 'nodejs'
export const maxDuration = 30

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/broadcasts/send-test
 *
 * Тестовая отправка одному получателю — чтобы убедиться что текст/медиа/
 * кнопки выглядят как надо перед запуском на всю базу.
 *
 * Body:
 *   telegram_bot_id: uuid
 *   to_customer_id:  uuid (получатель — клиент с conversation у этого бота)
 *   text, media_type, media_url: контент
 *   buttons: массив BroadcastButton[] — но в тест-режиме реально шлём
 *            только url-кнопки. trigger/goto_message callback'и не работают
 *            без broadcast_id в БД — их просто пропускаем (юзер увидит текст
 *            и медиа, этого достаточно для проверки вёрстки).
 *
 * Не создаёт broadcast в БД, не пишет в broadcast_deliveries. Только одна
 * запись в chatbot_messages (как outgoing) чтобы не путать историю диалога.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      telegram_bot_id,
      to_customer_id,
      text,
      media_type,
      media_url,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buttons,
    } = body as {
      telegram_bot_id: string
      to_customer_id: string
      text: string | null
      media_type: string | null
      media_url: string | null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buttons: any[] | null
    }

    if (!telegram_bot_id) return NextResponse.json({ error: 'telegram_bot_id required' }, { status: 400 })
    if (!to_customer_id) return NextResponse.json({ error: 'to_customer_id required' }, { status: 400 })
    if (!text && !media_url) return NextResponse.json({ error: 'Добавь текст или медиа' }, { status: 400 })

    const supabase = getSupabase()

    // Находим бот
    const { data: bot } = await supabase
      .from('telegram_bots').select('id, token').eq('id', telegram_bot_id).single()
    if (!bot) return NextResponse.json({ error: 'Бот не найден' }, { status: 404 })

    // Находим conversation у получателя с этим ботом
    const { data: conv } = await supabase
      .from('chatbot_conversations')
      .select('id, telegram_chat_id, chat_blocked, customers(full_name, telegram_username)')
      .eq('telegram_bot_id', telegram_bot_id)
      .eq('customer_id', to_customer_id)
      .gt('telegram_chat_id', 0)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!conv) return NextResponse.json({ error: 'У выбранного клиента нет активного диалога с ботом. Пусть он напишет боту /start.' }, { status: 400 })
    if (conv.chat_blocked) return NextResponse.json({ error: 'Клиент заблокировал бота — тестовая отправка не пройдёт' }, { status: 400 })

    // Только url-кнопки в тест-режиме (callback без broadcast_id всё равно не сработает)
    const testButtons = Array.isArray(buttons)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (buttons as any[])
          .filter(b => b && b.text && (b.action_type === 'url' || (!b.action_type && b.url)) && b.url)
          .map(b => ({ text: String(b.text), url: String(b.url) }))
      : []

    const res = await sendFollowupContent(bot.token, conv.telegram_chat_id, {
      text, media_type, media_url,
    }, testButtons.length > 0 ? testButtons : undefined)

    if (!res.ok) {
      return NextResponse.json({ error: 'Telegram отклонил: ' + res.error }, { status: 500 })
    }

    // Пишем в чат-лог — чтобы в истории диалога было видно что ушло
    await supabase.from('chatbot_messages').insert({
      conversation_id: conv.id,
      direction: 'outgoing',
      content: '[ТЕСТ] ' + (text || `[${media_type}]`),
    })

    const nonUrlButtons = Array.isArray(buttons)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (buttons as any[]).filter(b => b?.action_type && b.action_type !== 'url').length
      : 0

    return NextResponse.json({
      ok: true,
      note: nonUrlButtons > 0
        ? `Отправлено. Кнопки типа trigger/goto (${nonUrlButtons} шт.) пропущены — они работают только в реальной рассылке.`
        : undefined,
    })
  } catch (err) {
    console.error('[broadcasts/send-test] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
