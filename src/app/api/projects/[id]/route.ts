// DELETE /api/projects/[id] — удалить проект полностью.
//
// Cascade БД удалит все связанные данные (customers, landings, bots, etc).
// Дополнительно отвязываем subdomain и custom_domain из Vercel.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { removeVercelDomain } from '@/lib/vercel-domains'

export const runtime = 'nodejs'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'studency.ru'

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: project } = await supabase
    .from('projects')
    .select('id, owner_id, subdomain, custom_domain')
    .eq('id', id)
    .single()
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })
  if (project.owner_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Vercel cleanup (фоном, не блокируем удаление)
  if (project.subdomain) {
    removeVercelDomain(`${project.subdomain}.${ROOT_DOMAIN}`).catch(() => {})
  }
  if (project.custom_domain) {
    removeVercelDomain(project.custom_domain).catch(() => {})
  }

  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
