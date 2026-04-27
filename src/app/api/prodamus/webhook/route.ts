import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyWebhookSignature } from '@/lib/prodamus'
import { evaluateAutoBoards } from '@/lib/crm-automation'
import { emitEvent } from '@/lib/event-triggers'

export const runtime = 'nodejs'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/prodamus/webhook
 * Prodamus calls this URL when payment status changes.
 * Expected params: order_id, sum, payment_status, signature
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') ?? ''
    let body: Record<string, string> = {}

    if (contentType.includes('application/json')) {
      body = await request.json()
    } else {
      // form-encoded
      const form = await request.formData()
      form.forEach((v, k) => { body[k] = String(v) })
    }

    const signature = body.signature ?? request.headers.get('sign') ?? ''

    // Verify signature (bypass if secret not set for testing)
    if (process.env.PRODAMUS_SECRET_KEY && !verifyWebhookSignature(body, signature)) {
      console.warn('prodamus webhook: invalid signature', body)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const orderId = body.order_id
    const status = body.payment_status // 'success' | 'failed' | ...
    const sum = parseFloat(body.sum ?? '0')

    if (!orderId) return NextResponse.json({ error: 'No order_id' }, { status: 400 })

    const supabase = getSupabase()

    // Update order
    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    const newStatus = status === 'success' ? 'paid' : status === 'failed' ? 'cancelled' : order.status

    await supabase.from('orders').update({
      status: newStatus,
      paid_amount: status === 'success' ? sum : order.paid_amount,
      updated_at: new Date().toISOString(),
    }).eq('id', orderId)

    // Log action if customer present
    if (order.customer_id && status === 'success') {
      await supabase.from('customer_actions').insert({
        customer_id: order.customer_id,
        project_id: order.project_id,
        action: 'order_paid',
        data: { order_id: orderId, amount: sum },
      })

      // Авто-выдача доступа через RPC grant_tariff_access (миграция 47).
      // expires_at рассчитывается в БД по tariffs.access_type/access_days/access_until_date.
      if (order.tariff_id) {
        const { error: grantErr } = await supabase.rpc('grant_tariff_access', {
          p_project_id: order.project_id,
          p_customer_id: order.customer_id,
          p_tariff_id: order.tariff_id,
          p_source: 'order',
          p_source_order_id: orderId,
          p_granted_by: null,
          p_notes: 'Автовыдача после оплаты Prodamus',
        })
        if (grantErr) console.error('prodamus grant_tariff_access error:', grantErr)
      }

      // CRM автоматизация
      evaluateAutoBoards(supabase, {
        projectId: order.project_id,
        customerId: order.customer_id,
        eventType: 'order_paid',
        eventData: {
          order_id: orderId, amount: sum,
          product_id: order.product_id, product_name: order.product_name,
          tariff_id: order.tariff_id,
        },
      }).catch(err => console.error('CRM auto error:', err))

      // Event triggers — order_paid (запустит сценарии "поздравляем" и отменит
      // негативные "не оплатил / не досмотрел")
      emitEvent(supabase, {
        projectId: order.project_id,
        customerId: order.customer_id,
        eventType: 'order_paid',
        eventName: order.product_name ?? null,
        source: 'prodamus',
        sourceId: order.product_id ?? null,
        metadata: { order_id: orderId, amount: sum, tariff_id: order.tariff_id },
      }).catch(err => console.error('emitEvent order_paid error:', err))
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('prodamus webhook error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
