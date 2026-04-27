// Identity stitching: слияние Гость-карточки в основную (с telegram_id).
//
// Используется в двух местах:
//  1. landing-public-render.ts — когда юзер возвращается из бота на сайт,
//     cookie указывает на Гостя, а ?_sc=<id> — на telegram-карточку.
//  2. telegram webhook — когда /start пришёл с payload vt_<token>,
//     указывающим на ранее созданную Гость-карточку.

import type { SupabaseClient } from '@supabase/supabase-js'

type CustomerLite = {
  id: string
  project_id: string
  full_name: string | null
  email: string | null
  phone: string | null
  telegram_id: string | null
  telegram_username: string | null
  instagram: string | null
  vk: string | null
  whatsapp: string | null
  tags: string[] | null
  source_id: string | null
  source_name: string | null
  source_slug: string | null
  visitor_token: string | null
  bot_subscribed: boolean | null
  channel_subscribed: boolean | null
  is_blocked: boolean | null
  first_touch_at: string | null
  first_touch_kind: string | null
  first_touch_source: string | null
  first_touch_landing_id: string | null
  first_touch_referrer: string | null
  first_touch_url: string | null
  first_touch_utm: Record<string, string> | null
}

async function loadCustomer(supabase: SupabaseClient, id: string): Promise<CustomerLite | null> {
  const { data } = await supabase
    .from('customers')
    .select('id, project_id, full_name, email, phone, telegram_id, telegram_username, instagram, vk, whatsapp, tags, source_id, source_name, source_slug, visitor_token, bot_subscribed, channel_subscribed, is_blocked, first_touch_at, first_touch_kind, first_touch_source, first_touch_landing_id, first_touch_referrer, first_touch_url, first_touch_utm')
    .eq('id', id)
    .maybeSingle()
  return (data ?? null) as CustomerLite | null
}

/**
 * Сливает гостевую карточку (`guestId`) в основную (`targetId`):
 *  - переносит все связанные записи (visits, actions, orders, ...)
 *  - объединяет контакты (target в приоритете, отсутствующие поля берутся из guest)
 *  - удаляет guest-запись
 *
 * Безопасно вызывать когда обе карточки в одном проекте и guest без telegram_id.
 * Возвращает true если merge выполнен, false если пропущен (например guest === target,
 * не в одном проекте, guest имеет telegram_id и т.п.).
 */
export async function mergeGuestIntoCustomer(
  supabase: SupabaseClient,
  guestId: string,
  targetId: string,
  opts: { allowGuestWithTelegram?: boolean } = {},
): Promise<boolean> {
  if (!guestId || !targetId || guestId === targetId) return false

  const [guest, target] = await Promise.all([
    loadCustomer(supabase, guestId),
    loadCustomer(supabase, targetId),
  ])
  if (!guest || !target) return false
  if (guest.project_id !== target.project_id) return false
  // По умолчанию защита от конфликта: «полноценную» tg-карточку (с telegram_id)
  // не сливаем как Гостя — потому что неясно кто из них «настоящий».
  // Cron-merge дубликатов передаёт allowGuestWithTelegram=true когда оба
  // customer имеют ОДИН И ТОТ ЖЕ telegram_id (точная дубликация).
  if (guest.telegram_id && !opts.allowGuestWithTelegram) return false
  if (guest.telegram_id && opts.allowGuestWithTelegram && guest.telegram_id !== target.telegram_id) {
    // защита: не сливаем разных tg-юзеров
    return false
  }

  // Перенос связанных таблиц. Делаем пер-таблично через try-catch чтобы единичный
  // конфликт constraint'а не сорвал merge целиком.
  const tablesToReassign = [
    'landing_visits',
    'button_clicks',
    'customer_actions',
    'customer_notes',
    'customer_touchpoints',
    'orders',
    'events',
    'video_views',
    'customer_funnel_positions',
    'customer_field_values',
    'customer_crm_positions',
    'broadcast_deliveries',
    'chatbot_conversations',
    'tracking_events',
  ]
  for (const t of tablesToReassign) {
    try {
      await supabase.from(t).update({ customer_id: targetId }).eq('customer_id', guestId)
    } catch (err) {
      console.warn(`[merge] reassign ${t} failed:`, err)
    }
  }

  // Объединяем поля: target в приоритете на КОНТАКТЫ, но first-touch берём
  // САМЫЙ РАННИЙ из двух — это и есть «навсегда сохранённая точка входа».
  // Если у Гостя first_touch раньше → он и записан как первоисточник.
  const mergedTags = Array.from(new Set([...(target.tags ?? []), ...(guest.tags ?? [])]))
  const useGuestFirstTouch = (() => {
    const g = guest.first_touch_at ? new Date(guest.first_touch_at).getTime() : Infinity
    const t = target.first_touch_at ? new Date(target.first_touch_at).getTime() : Infinity
    return g < t
  })()
  const patch: Partial<CustomerLite> = {
    full_name: target.full_name ?? guest.full_name,
    email: target.email ?? guest.email,
    phone: target.phone ?? guest.phone,
    instagram: target.instagram ?? guest.instagram,
    vk: target.vk ?? guest.vk,
    whatsapp: target.whatsapp ?? guest.whatsapp,
    tags: mergedTags.length > 0 ? mergedTags : null,
    source_id: target.source_id ?? guest.source_id,
    source_name: target.source_name ?? guest.source_name,
    source_slug: target.source_slug ?? guest.source_slug,
    visitor_token: target.visitor_token ?? guest.visitor_token,
    ...(useGuestFirstTouch
      ? {
          first_touch_at: guest.first_touch_at,
          first_touch_kind: guest.first_touch_kind,
          first_touch_source: guest.first_touch_source,
          first_touch_landing_id: guest.first_touch_landing_id,
          first_touch_referrer: guest.first_touch_referrer,
          first_touch_url: guest.first_touch_url,
          first_touch_utm: guest.first_touch_utm,
        }
      : {}),
  }
  try {
    await supabase.from('customers').update(patch).eq('id', targetId)
  } catch (err) {
    console.warn('[merge] update target failed:', err)
  }

  try {
    await supabase.from('customers').delete().eq('id', guestId)
  } catch (err) {
    console.warn('[merge] delete guest failed:', err)
  }

  return true
}

/**
 * Удобный helper: ищет Гость-карточку по visitor_token в проекте и сливает её
 * в target. Делает ничего если гостя нет или гость = target.
 */
export async function mergeByVisitorToken(
  supabase: SupabaseClient,
  visitorToken: string | null | undefined,
  projectId: string,
  targetId: string,
): Promise<boolean> {
  if (!visitorToken || !projectId || !targetId) {
    console.log('[merge-by-vt] skip: missing args', { hasVT: !!visitorToken, hasProject: !!projectId, hasTarget: !!targetId })
    return false
  }
  const { data: guest } = await supabase
    .from('customers')
    .select('id, telegram_id')
    .eq('visitor_token', visitorToken)
    .eq('project_id', projectId)
    .neq('id', targetId)
    .limit(1)
    .maybeSingle()
  if (!guest) {
    console.log('[merge-by-vt] no guest found for vt', { visitorToken, projectId, targetId })
    return false
  }
  const guestRow = guest as { id: string; telegram_id: string | null }
  if (guestRow.telegram_id) {
    console.log('[merge-by-vt] guest has telegram_id, skip', { guestId: guestRow.id, guestTg: guestRow.telegram_id })
    return false
  }
  console.log('[merge-by-vt] merging', { guestId: guestRow.id, targetId })
  const ok = await mergeGuestIntoCustomer(supabase, guestRow.id, targetId)
  console.log('[merge-by-vt] result', { ok, guestId: guestRow.id, targetId })
  return ok
}
