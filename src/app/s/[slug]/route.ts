// Legacy route /s/<slug> — старые ссылки до системы доменов.
// Slug глобально дублирующийся теперь — берём первый opубликованный лендинг.
// Если у проекта есть subdomain или custom_domain — редирект 301 на новый URL.

import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { renderLandingResponse, notFoundResponse, type PublicLanding } from '@/lib/landing-public-render'
import { ROOT_DOMAIN } from '@/lib/subdomain'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://studency.ru'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: landing } = await supabase
    .from('landings')
    .select('id, slug, status, name, meta_title, meta_description, is_mini_app, project_id, is_blocks_based, html_content')
    .eq('slug', slug)
    .eq('status', 'published')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!landing) return notFoundResponse()

  // Если у проекта есть subdomain/custom_domain — 301 редирект на новый URL
  const { data: project } = await supabase
    .from('projects')
    .select('subdomain, custom_domain, custom_domain_status')
    .eq('id', landing.project_id)
    .single()

  if (project) {
    let target: string | null = null
    if (project.custom_domain && project.custom_domain_status === 'verified') {
      target = `https://${project.custom_domain}/${landing.slug}`
    } else if (project.subdomain) {
      target = `https://${project.subdomain}.${ROOT_DOMAIN}/${landing.slug}`
    }
    if (target && new URL(request.url).host !== new URL(target).host) {
      return NextResponse.redirect(target, 301)
    }
  }

  return renderLandingResponse(landing as PublicLanding, supabase, BASE_URL)
}
