// Cron-задача: ищет дубликаты customers в каждом проекте по telegram_id /
// email / phone и сливает Гость-карточки в полноценные.
//
// Запускается через cron-job.org (раз в час). Защищён CRON_SECRET в URL.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { mergeGuestIntoCustomer } from '@/lib/customer-merge'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type CustomerLite = {
  id: string
  project_id: string
  telegram_id: string | null
  email: string | null
  phone: string | null
  first_touch_at: string | null
  created_at: string
}

export async function GET(request: NextRequest) {
  // Простая защита: cron-job.org может ходить с известным секретом
  const auth = request.nextUrl.searchParams.get('secret')
  if (process.env.CRON_SECRET && auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()
  const stats = { telegram_merged: 0, email_merged: 0, phone_merged: 0, errors: 0 }

  // Берём все customers и группируем в коде. Для масштаба до десятков тысяч
  // карточек — терпимо. Если станет больше — переедем на DB-side GROUP BY.
  const { data: rows } = await supabase
    .from('customers')
    .select('id, project_id, telegram_id, email, phone, first_touch_at, created_at')
    .order('created_at', { ascending: true })

  const customers = (rows ?? []) as CustomerLite[]

  // Группировка по project_id + ключу
  const groupBy = (key: 'telegram_id' | 'email' | 'phone'): Map<string, CustomerLite[]> => {
    const m = new Map<string, CustomerLite[]>()
    for (const c of customers) {
      const v = c[key]
      if (!v) continue
      const k = `${c.project_id}::${v.toLowerCase()}`
      const arr = m.get(k) ?? []
      arr.push(c)
      m.set(k, arr)
    }
    return m
  }

  async function mergeDupGroup(group: CustomerLite[], statKey: 'telegram_merged' | 'email_merged' | 'phone_merged') {
    if (group.length < 2) return

    // ───── Защита: для phone/email групп не сливаем если в группе НЕСКОЛЬКО
    // разных telegram_id. Это значит несколько разных людей дали один и тот же
    // номер телефона / email (опечатка / ошибка). Лучше оставить дубликаты,
    // чем испортить данные слиянием.
    if (statKey === 'email_merged' || statKey === 'phone_merged') {
      const distinctTgIds = new Set(group.map(c => c.telegram_id).filter(Boolean) as string[])
      if (distinctTgIds.size > 1) {
        console.warn(`[cron-merge] ${statKey} skip: ${distinctTgIds.size} distinct telegram_ids in group`)
        return
      }
    }

    // Target = тот, у кого есть telegram_id; иначе — самый ранний по first_touch_at
    const sortedByValue = [...group].sort((a, b) => {
      const aTg = a.telegram_id ? 1 : 0
      const bTg = b.telegram_id ? 1 : 0
      if (aTg !== bTg) return bTg - aTg
      const aT = a.first_touch_at ? new Date(a.first_touch_at).getTime() : new Date(a.created_at).getTime()
      const bT = b.first_touch_at ? new Date(b.first_touch_at).getTime() : new Date(b.created_at).getTime()
      return aT - bT
    })
    const target = sortedByValue[0]
    const guests = sortedByValue.slice(1)
    for (const g of guests) {
      try {
        const ok = await mergeGuestIntoCustomer(supabase, g.id, target.id, {
          allowGuestWithTelegram: statKey === 'telegram_merged',
        })
        if (ok) stats[statKey]++
      } catch (err) {
        console.error('[cron-merge] error:', err)
        stats.errors++
      }
    }
  }

  // 1. По telegram_id
  for (const group of groupBy('telegram_id').values()) {
    await mergeDupGroup(group, 'telegram_merged')
  }
  // 2. По email
  for (const group of groupBy('email').values()) {
    await mergeDupGroup(group, 'email_merged')
  }
  // 3. По phone
  for (const group of groupBy('phone').values()) {
    await mergeDupGroup(group, 'phone_merged')
  }

  return NextResponse.json({ ok: true, stats })
}
