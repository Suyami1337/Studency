// GET /api/projects/[id]/tariffs
//
// Возвращает все тарифы проекта (через JOIN с products), для UI выдачи
// доступа в карточке клиента (dropdown «выбрать продукт + тариф»).

import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { hasPermission, PERMISSIONS } from '@/lib/permissions'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const allowed =
    (await hasPermission(supabase, projectId, user.id, PERMISSIONS.PRODUCTS_VIEW)) ||
    (await hasPermission(supabase, projectId, user.id, PERMISSIONS.LEARNING_ACCESS_GRANT))
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { data } = await supabase
    .from('tariffs')
    .select(`
      id, name, price, is_active, access_type, access_days, access_until_date,
      product_id, products!inner(id, name, project_id, is_active)
    `)
    .eq('products.project_id', projectId)
    .order('order_position', { ascending: true })

  type ProductNode = { id: string; name: string; project_id: string; is_active: boolean }
  type Row = {
    id: string; name: string; price: number; is_active: boolean;
    access_type: string; access_days: number | null; access_until_date: string | null;
    product_id: string; products: ProductNode | ProductNode[]
  }

  const tariffs = ((data ?? []) as unknown as Row[]).map(t => {
    const p = Array.isArray(t.products) ? t.products[0] : t.products
    return {
      id: t.id,
      name: t.name,
      price: t.price,
      is_active: t.is_active,
      access_type: t.access_type,
      access_days: t.access_days,
      access_until_date: t.access_until_date,
      product_id: p.id,
      product_name: p.name,
      product_active: p.is_active,
    }
  })

  return NextResponse.json({ tariffs })
}
