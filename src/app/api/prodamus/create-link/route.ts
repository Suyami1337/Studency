import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createPaymentLink } from '@/lib/prodamus'

export const runtime = 'nodejs'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/prodamus/create-link
 * Body: { order_id }
 * Creates a Prodamus payment link for an existing order.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const orderId = body.order_id
    if (!orderId) return NextResponse.json({ error: 'order_id required' }, { status: 400 })

    const supabase = getSupabase()
    const { data: order } = await supabase
      .from('orders')
      .select('id, amount, product_name, customer_id')
      .eq('id', orderId)
      .single()

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    let email: string | undefined
    let phone: string | undefined
    if (order.customer_id) {
      const { data: customer } = await supabase
        .from('customers').select('email, phone').eq('id', order.customer_id).single()
      email = customer?.email ?? undefined
      phone = customer?.phone ?? undefined
    }

    const baseUrl = request.nextUrl.origin

    try {
      const paymentUrl = createPaymentLink({
        orderId: order.id,
        amount: order.amount ?? 0,
        productName: order.product_name ?? 'Заказ',
        customerEmail: email,
        customerPhone: phone,
        successUrl: `${baseUrl}/payment-success?order=${order.id}`,
        callbackUrl: `${baseUrl}/api/prodamus/webhook`,
      })
      return NextResponse.json({ ok: true, url: paymentUrl })
    } catch (err) {
      return NextResponse.json({
        error: err instanceof Error ? err.message : 'Prodamus not configured',
        hint: 'Установи PRODAMUS_BASE_URL и PRODAMUS_SECRET_KEY в Vercel env vars',
      }, { status: 500 })
    }
  } catch (err) {
    console.error('prodamus create-link error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
