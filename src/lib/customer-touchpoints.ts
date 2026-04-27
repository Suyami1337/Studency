// Touchpoint = одно касание клиента с воронкой проекта.
//
// Записываем при:
//  - первом заходе на лендинг (kind='landing', UTM, referer)
//  - возврате на лендинг с другим UTM/source чем последний touchpoint
//  - первом /start бота если до этого не было лендинг-touchpoint'а (kind='bot')
//  - подписке на канал (kind='channel')
//
// Ключевая логика: ДЕДУПЛИЦИРУЕМ. Не плодим строку при каждом
// рефреше страницы. Новый touchpoint создаётся только если:
//  - source/utm_campaign отличается от последнего, ИЛИ
//  - прошло больше TOUCHPOINT_DEDUP_HOURS с последнего такого же

import type { SupabaseClient } from '@supabase/supabase-js'

const TOUCHPOINT_DEDUP_HOURS = 24

export type TouchpointInput = {
  customer_id: string
  project_id: string
  kind: 'landing' | 'bot' | 'channel' | 'direct'
  source?: string | null
  landing_id?: string | null
  referrer?: string | null
  url?: string | null
  utm?: Record<string, string> | null
}

export async function recordTouchpoint(
  supabase: SupabaseClient,
  input: TouchpointInput,
): Promise<void> {
  // Проверяем последний touchpoint этого клиента — нужно ли вообще писать новый
  const { data: last } = await supabase
    .from('customer_touchpoints')
    .select('ts, kind, source, utm')
    .eq('customer_id', input.customer_id)
    .order('ts', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (last) {
    type Last = { ts: string; kind: string; source: string | null; utm: Record<string, string> | null }
    const l = last as Last
    const lastUtm = l.utm
    const newUtm = input.utm

    const sourceSame = (l.source ?? null) === (input.source ?? null)
    const kindSame = l.kind === input.kind
    const campaignSame = (lastUtm?.utm_campaign ?? null) === (newUtm?.utm_campaign ?? null)
    const utmSourceSame = (lastUtm?.utm_source ?? null) === (newUtm?.utm_source ?? null)

    const lastTime = new Date(l.ts).getTime()
    const now = Date.now()
    const hoursSinceLast = (now - lastTime) / (1000 * 60 * 60)

    // Если ВСЁ совпадает И прошло меньше 24 ч — пропускаем (это просто рефреш страницы)
    if (sourceSame && kindSame && campaignSame && utmSourceSame && hoursSinceLast < TOUCHPOINT_DEDUP_HOURS) {
      return
    }
  }

  await supabase.from('customer_touchpoints').insert({
    customer_id: input.customer_id,
    project_id: input.project_id,
    kind: input.kind,
    source: input.source ?? null,
    landing_id: input.landing_id ?? null,
    referrer: input.referrer ?? null,
    url: input.url ?? null,
    utm: input.utm ?? null,
  }).then(({ error }) => {
    if (error) console.warn('[touchpoint] insert error:', error.message)
  })
}
