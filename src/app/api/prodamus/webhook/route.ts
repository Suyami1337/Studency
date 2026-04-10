import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyWebhookSignature } from '@/lib/prodamus'

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

      // Open product access (if order has tariff_id → tariff_access)
      if (order.tariff_id) {
        const { data: tariff } = await supabase
          .from('tariffs').select('product_id, duration_days').eq('id', order.tariff_id).single()

        if (tariff?.product_id) {
          const expiresAt = tariff.duration_days
            ? new Date(Date.now() + tariff.duration_days * 24 * 60 * 60 * 1000).toISOString()
            : null

          await supabase.from('tariff_access').upsert({
            customer_id: order.customer_id,
            product_id: tariff.product_id,
            tariff_id: order.tariff_id,
            granted_at: new Date().toISOString(),
            expires_at: expiresAt,
          }, { onConflict: 'customer_id,tariff_id' })
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('prodamus webhook error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
