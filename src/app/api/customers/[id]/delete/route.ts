import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/customers/[id]/delete
// Полное удаление клиента: все его данные во всех таблицах
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: customerId } = await params

  // Проверяем авторизацию через обычный клиент (RLS)
  const userSupabase = createClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Проверяем что клиент принадлежит проекту, к которому у пользователя есть доступ
  const { data: customer } = await userSupabase
    .from('customers')
    .select('id, project_id, visitor_token')
    .eq('id', customerId)
    .single()

  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  // Дальше используем service role для полной очистки
  const supabase = getServiceSupabase()
  const visitorToken = customer.visitor_token

  try {
    // 1. Удаляем заявки с лендингов (SET NULL не каскадирует, удаляем явно)
    await supabase.from('lead_submissions').delete().eq('customer_id', customerId)

    // 2. Удаляем визиты лендинга
    await supabase.from('landing_visits').delete().eq('customer_id', customerId)

    // 3. Удаляем трекинг-события по visitor_token (если есть)
    if (visitorToken) {
      await supabase.from('tracking_events').delete().eq('visitor_token', visitorToken)
    }

    // 4. Удаляем позиции в воронках
    await supabase.from('customer_funnel_positions').delete().eq('customer_id', customerId)

    // 5. Удаляем историю действий
    await supabase.from('customer_actions').delete().eq('customer_id', customerId)

    // 6. Удаляем заметки
    await supabase.from('customer_notes').delete().eq('customer_id', customerId)

    // 7. Удаляем сообщения диалогов через разговоры
    const { data: convs } = await supabase
      .from('chatbot_conversations')
      .select('id')
      .eq('customer_id', customerId)
    if (convs && convs.length > 0) {
      const convIds = convs.map(c => c.id)
      await supabase.from('chatbot_messages').delete().in('conversation_id', convIds)
    }

    // 8. Удаляем разговоры
    await supabase.from('chatbot_conversations').delete().eq('customer_id', customerId)

    // 9. Удаляем заказы
    await supabase.from('orders').delete().eq('customer_id', customerId)

    // 10. Наконец удаляем самого клиента
    const { error } = await supabase.from('customers').delete().eq('id', customerId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Delete customer error:', err)
    return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 })
  }
}
