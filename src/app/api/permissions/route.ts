// GET /api/permissions
//
// Глобальный каталог permissions (для UI конструктора ролей).
// Не требует авторизации (этот же справочник в src/lib/permissions.ts).

import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('permissions')
    .select('code, category, label, description, is_dangerous, sort_order')
    .order('sort_order', { ascending: true })

  return NextResponse.json({ permissions: data ?? [] })
}
