import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Утилита: тихое удаление — не падает если таблица не существует или нет строк
async function safeDelete(supabase: ReturnType<typeof getSupabase>, table: string, column: string, value: string) {
  try {
    await supabase.from(table).delete().eq(column, value)
  } catch (e) {
    console.warn(`safeDelete ${table}.${column}=${value}:`, e)
  }
}

// POST /api/customers/[id]/delete
// Полное удаление клиента: все его данные во всех таблицах
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: customerId } = await params

  if (!customerId) {
    return NextResponse.json({ error: 'Missing customer id' }, { status: 400 })
  }

  const supabase = getSupabase()

  // Получаем visitor_token для удаления tracking_events
  const { data: customer, error: fetchErr } = await supabase
    .from('customers')
    .select('id, visitor_token')
    .eq('id', customerId)
    .single()

  if (fetchErr || !customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  const visitorToken = customer.visitor_token

  // Удаляем в правильном порядке (от зависимых к независимым)

  // 1. Сначала удаляем сообщения из разговоров (дочерние записи)
  try {
    const { data: convs } = await supabase
      .from('chatbot_conversations')
      .select('id')
      .eq('customer_id', customerId)
    if (convs && convs.length > 0) {
      await supabase.from('chatbot_messages').delete().in('conversation_id', convs.map(c => c.id))
    }
  } catch (e) {
    console.warn('Delete chatbot_messages:', e)
  }

  // 2. Остальные зависимые таблицы
  await safeDelete(supabase, 'chatbot_conversations', 'customer_id', customerId)
  await safeDelete(supabase, 'lead_submissions', 'customer_id', customerId)
  await safeDelete(supabase, 'landing_visits', 'customer_id', customerId)
  await safeDelete(supabase, 'customer_funnel_positions', 'customer_id', customerId)
  await safeDelete(supabase, 'customer_actions', 'customer_id', customerId)
  await safeDelete(supabase, 'customer_notes', 'customer_id', customerId)
  await safeDelete(supabase, 'orders', 'customer_id', customerId)

  // 3. Tracking events по visitor_token
  if (visitorToken) {
    await safeDelete(supabase, 'tracking_events', 'visitor_token', visitorToken)
  }

  // 4. Наконец сам клиент
  const { error } = await supabase.from('customers').delete().eq('id', customerId)
  if (error) {
    console.error('Delete customer final error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
