// GET  /api/projects/[id]/customers/[customerId]/access
//   — список выданных доступов клиента (с тарифами/курсами/expires_at)
//
// POST /api/projects/[id]/customers/[customerId]/access
//   Body: { tariff_id, mode: 'free' | 'create_paid_order', notes? }
//   - 'free'              — сразу создаём customer_access (без заказа)
//   - 'create_paid_order' — создаём orders(status='pending'), доступ откроется
//                           когда заказ перейдёт в paid (через webhook или
//                           ручную пометку «оплачен» в карточке заказа)

import { NextResponse } from 'next/server'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { hasPermission, PERMISSIONS } from '@/lib/permissions'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; customerId: string }> },
) {
  const { id: projectId, customerId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Достаточно crm.customers.view ИЛИ learning.access.grant — для UI карточки клиента
  const canView =
    (await hasPermission(supabase, projectId, user.id, PERMISSIONS.CRM_CUSTOMERS_VIEW)) ||
    (await hasPermission(supabase, projectId, user.id, PERMISSIONS.LEARNING_ACCESS_GRANT))
  if (!canView) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { data: rows } = await supabase
    .from('customer_access')
    .select(`
      id, granted_at, expires_at, status, source, source_order_id, notes, revoked_at,
      tariff_id, tariffs!inner(name, price, access_type, access_days, access_until_date,
        product_id, products!inner(name))
    `)
    .eq('customer_id', customerId)
    .eq('project_id', projectId)
    .order('granted_at', { ascending: false })

  type Tariff = {
    name: string; price: number; access_type: string; access_days: number | null;
    access_until_date: string | null; product_id: string;
    products: { name: string } | { name: string }[]
  }
  type Row = {
    id: string; granted_at: string; expires_at: string | null; status: string;
    source: string; source_order_id: string | null; notes: string | null; revoked_at: string | null;
    tariff_id: string; tariffs: Tariff | Tariff[]
  }

  const access = ((rows ?? []) as unknown as Row[]).map(r => {
    const tariff = Array.isArray(r.tariffs) ? r.tariffs[0] : r.tariffs
    const product = Array.isArray(tariff.products) ? tariff.products[0] : tariff.products
    const isExpired = r.expires_at ? new Date(r.expires_at) < new Date() : false
    return {
      id: r.id,
      granted_at: r.granted_at,
      expires_at: r.expires_at,
      status: r.status,
      is_expired: isExpired,
      source: r.source,
      source_order_id: r.source_order_id,
      notes: r.notes,
      revoked_at: r.revoked_at,
      tariff_id: r.tariff_id,
      tariff_name: tariff.name,
      tariff_price: tariff.price,
      product_name: product.name,
      access_type: tariff.access_type,
    }
  })

  return NextResponse.json({ access })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; customerId: string }> },
) {
  const { id: projectId, customerId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const allowed = await hasPermission(supabase, projectId, user.id, PERMISSIONS.LEARNING_ACCESS_GRANT)
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let body: { tariff_id?: string; mode?: 'free' | 'create_paid_order'; notes?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const tariffId = body.tariff_id?.trim()
  const mode = body.mode ?? 'free'
  if (!tariffId) return NextResponse.json({ error: 'tariff_id required' }, { status: 400 })

  const svc = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Проверяем что тариф принадлежит этому проекту
  const { data: tariff } = await svc
    .from('tariffs')
    .select('id, product_id, price, name, products!inner(project_id)')
    .eq('id', tariffId)
    .maybeSingle()
  type ProductsNode = { project_id: string }
  const tariffProjectId = tariff
    ? (Array.isArray((tariff as unknown as { products: ProductsNode | ProductsNode[] }).products)
        ? ((tariff as unknown as { products: ProductsNode[] }).products[0]?.project_id)
        : ((tariff as unknown as { products: ProductsNode }).products?.project_id))
    : null
  if (!tariff || tariffProjectId !== projectId) {
    return NextResponse.json({ error: 'tariff does not belong to project' }, { status: 400 })
  }

  // Проверяем что customer существует в этом проекте
  const { data: customer } = await svc
    .from('customers')
    .select('id, project_id, email')
    .eq('id', customerId)
    .maybeSingle()
  if (!customer || customer.project_id !== projectId) {
    return NextResponse.json({ error: 'customer not found in project' }, { status: 404 })
  }

  if (mode === 'free') {
    // Создаём заказ-подарок (status=paid, amount=0) для аудита + customer_access
    const { data: order, error: orderErr } = await svc
      .from('orders')
      .insert({
        project_id: projectId,
        customer_id: customerId,
        product_id: tariff.product_id,
        tariff_id: tariffId,
        status: 'paid',
        amount: 0,
        paid_amount: 0,
        customer_email: customer.email,
        notes: body.notes ?? 'Бесплатный доступ выдан вручную',
      })
      .select('id')
      .single()
    if (orderErr) {
      console.error('create gift order error:', orderErr)
      return NextResponse.json({ error: orderErr.message }, { status: 500 })
    }

    const { data: accessId, error: grantErr } = await svc.rpc('grant_tariff_access', {
      p_project_id: projectId,
      p_customer_id: customerId,
      p_tariff_id: tariffId,
      p_source: 'order',
      p_source_order_id: order.id,
      p_granted_by: user.id,
      p_notes: body.notes ?? null,
    })
    if (grantErr) return NextResponse.json({ error: grantErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, mode: 'free', order_id: order.id, access_id: accessId })
  }

  if (mode === 'create_paid_order') {
    const { data: order, error: orderErr } = await svc
      .from('orders')
      .insert({
        project_id: projectId,
        customer_id: customerId,
        product_id: tariff.product_id,
        tariff_id: tariffId,
        status: 'pending',
        amount: tariff.price,
        paid_amount: 0,
        customer_email: customer.email,
        notes: body.notes ?? null,
      })
      .select('id')
      .single()
    if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      mode: 'create_paid_order',
      order_id: order.id,
      info: 'Заказ создан со статусом pending. Доступ откроется автоматически когда заказ будет помечен оплаченным (вручную или через Prodamus webhook).',
    })
  }

  return NextResponse.json({ error: 'invalid mode' }, { status: 400 })
}
