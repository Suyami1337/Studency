// Одиночный блок: PATCH (обновление) и DELETE.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string; blockId: string }> }

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id: landingId, blockId } = await params
  const supabase = await createServerSupabase()
  const body = await request.json()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: any = {}
  const allowed = ['name', 'html_content', 'content', 'desktop_styles', 'mobile_styles', 'layout', 'is_hidden', 'block_type']
  for (const k of allowed) {
    if (body[k] !== undefined) updates[k] = body[k]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('landing_blocks')
    .update(updates)
    .eq('id', blockId)
    .eq('landing_id', landingId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, block: data })
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id: landingId, blockId } = await params
  const supabase = await createServerSupabase()

  const { error } = await supabase
    .from('landing_blocks')
    .delete()
    .eq('id', blockId)
    .eq('landing_id', landingId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
