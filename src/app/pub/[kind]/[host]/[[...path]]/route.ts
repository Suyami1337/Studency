// Публичный роут для лендингов школ — middleware rewrite'ит сюда:
//   <sub>.studency.ru/<path>     →  /pub/owner/<owner_id>/<path>
//   <custom-domain>/<path>       →  /pub/cust/<encoded-host>/<path>
//
// Лендинг резолвится по (owner_id, slug). Один subdomain/домен на аккаунт,
// под ним живут лендинги ВСЕХ проектов юзера — slug уникален в рамках account.

import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { renderLandingResponse, notFoundResponse, type PublicLanding } from '@/lib/landing-public-render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://studency.ru'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ kind: string; host: string; path?: string[] }> }
) {
  const { kind, host, path } = await params
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let ownerId: string | null = null

  if (kind === 'owner') {
    if (host === '__not_found__') return notFoundResponse()
    ownerId = host
  } else if (kind === 'cust') {
    const decoded = decodeURIComponent(host).toLowerCase()
    const { data: ad } = await supabase
      .from('account_domains')
      .select('user_id')
      .eq('custom_domain', decoded)
      .eq('custom_domain_status', 'verified')
      .maybeSingle()
    if (!ad) return notFoundResponse()
    ownerId = ad.user_id
  } else if (kind === 'sub') {
    // Backward-compat: старый middleware ещё мог отправлять сюда (например
    // от прокинутого URL). Резолвим subdomain → user_id.
    const { data: ad } = await supabase
      .from('account_domains')
      .select('user_id')
      .eq('subdomain', host.toLowerCase())
      .maybeSingle()
    if (!ad) return notFoundResponse()
    ownerId = ad.user_id
  } else {
    return notFoundResponse()
  }

  if (!ownerId) return notFoundResponse()

  // Лендинги доступны ТОЛЬКО по конкретному slug'у. Пустой путь (root
  // subdomain'а) = 404 — у школы нет автоматической главной страницы,
  // ученики приходят по конкретной ссылке которую им дали.
  const slug = (path && path.length > 0 ? path[0] : '').toLowerCase()
  if (!slug) return notFoundResponse()

  const { data: landing } = await supabase
    .from('landings')
    .select('id, slug, status, name, meta_title, meta_description, is_mini_app, project_id, is_blocks_based, html_content')
    .eq('owner_id', ownerId)
    .eq('status', 'published')
    .eq('slug', slug)
    .limit(1)
    .maybeSingle()

  if (!landing) return notFoundResponse()

  return renderLandingResponse(landing as PublicLanding, supabase, BASE_URL)
}
