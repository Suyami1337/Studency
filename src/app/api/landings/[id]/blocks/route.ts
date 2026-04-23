// CRUD для блоков лендинга.
//
// GET  /api/landings/[id]/blocks          — список блоков
// POST /api/landings/[id]/blocks          — создать блок (body: type, content?, after_block_id?)
// POST /api/landings/[id]/blocks?migrate=1 — lazy-миграция legacy html_content → один блок custom_html
// POST /api/landings/[id]/blocks?reorder=1 — переупорядочить (body: ids[])

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { wrapLegacyHtmlAsBlock, type BlockType } from '@/lib/landing-blocks'

export const runtime = 'nodejs'

async function ensureLandingOwnership(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  landingId: string
): Promise<{ ok: true; landing: { id: string; project_id: string; html_content: string | null; is_blocks_based: boolean } } | { ok: false; status: number; error: string }> {
  // Сначала пробуем новую схему (с is_blocks_based — добавлена миграцией 34)
  const full = await supabase
    .from('landings')
    .select('id, project_id, html_content, is_blocks_based')
    .eq('id', landingId)
    .maybeSingle()
  if (full.error) {
    // Если колонки нет — значит миграция 34-landing-blocks.sql не применена. Скажем это прямо.
    const msg = full.error.message || ''
    if (/is_blocks_based|column.*does not exist/i.test(msg)) {
      return {
        ok: false, status: 500,
        error: 'Миграция БД не применена. Открой Supabase → SQL Editor → запусти supabase/34-landing-blocks.sql',
      }
    }
    return { ok: false, status: 500, error: `Supabase: ${msg}` }
  }
  if (!full.data) return { ok: false, status: 404, error: 'Лендинг не найден' }
  return { ok: true, landing: full.data }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: landingId } = await params
  const supabase = await createServerSupabase()
  const guard = await ensureLandingOwnership(supabase, landingId)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const { data: blocks, error } = await supabase
    .from('landing_blocks')
    .select('*')
    .eq('landing_id', landingId)
    .order('order_position', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    blocks: blocks ?? [],
    isBlocksBased: guard.landing.is_blocks_based,
    hasLegacyHtml: Boolean(guard.landing.html_content),
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: landingId } = await params
  const url = new URL(request.url)
  const supabase = await createServerSupabase()

  const guard = await ensureLandingOwnership(supabase, landingId)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  // ──────────────────────────────────────────────────────────
  // Lazy-миграция: из monolithic html_content → один блок custom_html
  // ──────────────────────────────────────────────────────────
  if (url.searchParams.get('migrate') === '1') {
    if (guard.landing.is_blocks_based) {
      return NextResponse.json({ ok: true, alreadyMigrated: true })
    }
    const legacy = guard.landing.html_content ?? ''
    const block = wrapLegacyHtmlAsBlock(legacy, landingId)
    const { data: inserted, error: insErr } = await supabase
      .from('landing_blocks')
      .insert(block)
      .select()
      .single()
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    // Помечаем лендинг как блочный — публичный рендер будет читать блоки
    await supabase.from('landings').update({ is_blocks_based: true }).eq('id', landingId)
    return NextResponse.json({ ok: true, block: inserted })
  }

  // ──────────────────────────────────────────────────────────
  // Reorder: принимает { ids: string[] } — новый порядок
  // ──────────────────────────────────────────────────────────
  if (url.searchParams.get('reorder') === '1') {
    const body = await request.json()
    const ids: unknown = body.ids
    if (!Array.isArray(ids) || !ids.every(x => typeof x === 'string')) {
      return NextResponse.json({ error: 'ids[] required' }, { status: 400 })
    }
    // Обновляем order_position по индексу в массиве
    for (let i = 0; i < ids.length; i++) {
      await supabase
        .from('landing_blocks')
        .update({ order_position: i })
        .eq('id', ids[i])
        .eq('landing_id', landingId)
    }
    return NextResponse.json({ ok: true })
  }

  // ──────────────────────────────────────────────────────────
  // Создание нового блока
  // ──────────────────────────────────────────────────────────
  const body = await request.json()
  const allowedTypes: BlockType[] = ['custom_html', 'hero', 'text', 'image', 'video', 'cta', 'zero']
  const blockType: BlockType = allowedTypes.includes(body.block_type) ? body.block_type : 'text'
  const afterBlockId: string | undefined = body.after_block_id

  // Вычисляем order_position: после указанного блока, иначе в конец
  let newOrder = 0
  if (afterBlockId) {
    const { data: after } = await supabase
      .from('landing_blocks')
      .select('order_position')
      .eq('id', afterBlockId)
      .eq('landing_id', landingId)
      .maybeSingle()
    if (after) {
      newOrder = after.order_position + 1
      // Сдвигаем все блоки после него на +1
      const { data: toShift } = await supabase
        .from('landing_blocks')
        .select('id, order_position')
        .eq('landing_id', landingId)
        .gte('order_position', newOrder)
      for (const s of (toShift ?? [])) {
        await supabase
          .from('landing_blocks')
          .update({ order_position: s.order_position + 1 })
          .eq('id', s.id)
      }
    }
  } else {
    const { data: last } = await supabase
      .from('landing_blocks')
      .select('order_position')
      .eq('landing_id', landingId)
      .order('order_position', { ascending: false })
      .limit(1)
      .maybeSingle()
    newOrder = (last?.order_position ?? -1) + 1
  }

  const insertData = {
    landing_id: landingId,
    order_position: newOrder,
    block_type: blockType,
    name: body.name ?? defaultNameFor(blockType),
    html_content: body.html_content ?? null,
    content: body.content ?? {},
    desktop_styles: body.desktop_styles ?? {},
    mobile_styles: body.mobile_styles ?? {},
    layout: body.layout ?? {},
  }
  const { data: created, error: createErr } = await supabase
    .from('landing_blocks')
    .insert(insertData)
    .select()
    .single()
  if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 })

  // Если лендинг ещё не блочный — переключаем его
  if (!guard.landing.is_blocks_based) {
    await supabase.from('landings').update({ is_blocks_based: true }).eq('id', landingId)
  }

  return NextResponse.json({ ok: true, block: created })
}

function defaultNameFor(type: BlockType): string {
  const map: Record<BlockType, string> = {
    custom_html: 'HTML-блок',
    hero: 'Hero-блок',
    text: 'Текстовый блок',
    image: 'Картинка',
    video: 'Видео',
    cta: 'CTA-кнопка',
    zero: 'Zero-блок (холст)',
  }
  return map[type]
}
