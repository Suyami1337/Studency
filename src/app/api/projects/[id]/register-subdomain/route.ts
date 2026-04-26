// POST /api/projects/[id]/register-subdomain
// Регистрирует текущий project.subdomain в Vercel (нужно один раз для
// каждого нового поддомена, чтобы Vercel выдал SSL через HTTP-01).
// Вызывается клиентом после создания нового проекта.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { ensureProjectAccess } from '@/lib/api-auth'
import { addVercelDomain } from '@/lib/vercel-domains'
import { ROOT_DOMAIN } from '@/lib/subdomain'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const access = await ensureProjectAccess(supabase, id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const { data: project } = await supabase
    .from('projects')
    .select('subdomain')
    .eq('id', id)
    .single()
  if (!project?.subdomain) return NextResponse.json({ error: 'no subdomain' }, { status: 400 })

  const host = `${project.subdomain}.${ROOT_DOMAIN}`
  try {
    const result = await addVercelDomain(host)
    return NextResponse.json({ ok: true, host, status: result.status })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Vercel error' }, { status: 500 })
  }
}
