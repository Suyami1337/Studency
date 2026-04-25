import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadRecipients } from '@/lib/broadcast-send'
import { createServerSupabase } from '@/lib/supabase-server'
import { ensureProjectAccess } from '@/lib/api-auth'

export const runtime = 'nodejs'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/broadcasts/preview-count
 * Возвращает сколько клиентов попадёт в рассылку с указанными параметрами.
 * Используется кнопкой «Подсчитать» в форме создания — чтобы увидеть размер
 * аудитории ДО того как жать «Отправить».
 *
 * Тело: { project_id, telegram_bot_id?, channel, segment_type, segment_value? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.project_id) return NextResponse.json({ error: 'project_id required' }, { status: 400 })
    const authClient = await createServerSupabase()
    const access = await ensureProjectAccess(authClient, body.project_id)
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
    const supabase = getSupabase()

    const channel = body.channel ?? 'telegram'
    const useTelegram = channel === 'telegram' || channel === 'both'
    const useEmail = channel === 'email' || channel === 'both'

    if (useTelegram && !body.telegram_bot_id) {
      return NextResponse.json({ error: 'Для Telegram-канала нужен бот' }, { status: 400 })
    }

    // loadRecipients принимает broadcast-like объект
    const recipients = await loadRecipients(
      supabase,
      {
        project_id: body.project_id,
        telegram_bot_id: body.telegram_bot_id ?? null,
        channel,
        segment_type: body.segment_type ?? 'all',
        segment_value: body.segment_value ?? null,
      },
      { useTelegram, useEmail }
    )
    return NextResponse.json({ count: recipients.length })
  } catch (err) {
    console.error('[preview-count] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
