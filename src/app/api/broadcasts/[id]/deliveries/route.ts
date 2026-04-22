import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/broadcasts/[id]/deliveries
 * Возвращает получателей конкретной рассылки с информацией о клиенте
 * (имя, telegram username, email) и статусом доставки.
 * Используется в detail-модалке рассылки «Получатели».
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('broadcast_deliveries')
    .select('id, status, error, sent_at, created_at, customer_id, customers(full_name, telegram_username, telegram_id, email, bot_blocked_at, bot_blocked_source)')
    .eq('broadcast_id', id)
    .order('created_at', { ascending: false })
    .limit(1000)

  if (error) {
    console.error('[broadcast deliveries] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ deliveries: data ?? [] })
}
