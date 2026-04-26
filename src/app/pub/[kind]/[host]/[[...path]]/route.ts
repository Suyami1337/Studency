// Публичный роут для лендингов школ — middleware rewrite'ит сюда:
//   <sub>.studency.ru/<path>     →  /_pub/sub/<sub>/<path>
//   <custom-domain>/<path>       →  /_pub/cust/<encoded-host>/<path>
//
// Резолвит проект по subdomain или custom_domain, ищет landing по
// (project_id, slug) с уникальностью в рамках проекта.

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

  // Lookup project
  let projectQuery = supabase.from('projects').select('id, subdomain, custom_domain, custom_domain_status')
  if (kind === 'sub') {
    projectQuery = projectQuery.eq('subdomain', host.toLowerCase())
  } else if (kind === 'cust') {
    const decoded = decodeURIComponent(host).toLowerCase()
    projectQuery = projectQuery.eq('custom_domain', decoded).eq('custom_domain_status', 'verified')
  } else {
    return notFoundResponse()
  }
  const { data: project } = await projectQuery.maybeSingle()
  if (!project) return notFoundResponse()

  // Лендинги доступны ТОЛЬКО по конкретному slug'у. Пустой путь (root
  // субдомена) = 404 — у школы нет автоматической главной страницы,
  // ученики приходят по конкретной ссылке которую им дали.
  const slug = (path && path.length > 0 ? path[0] : '').toLowerCase()
  if (!slug) return notFoundResponse()

  const { data: landing } = await supabase
    .from('landings')
    .select('id, slug, status, name, meta_title, meta_description, is_mini_app, project_id, is_blocks_based, html_content')
    .eq('project_id', project.id)
    .eq('status', 'published')
    .eq('slug', slug)
    .limit(1)
    .maybeSingle()

  if (!landing) return notFoundResponse()

  return renderLandingResponse(landing as PublicLanding, supabase, BASE_URL)
}
