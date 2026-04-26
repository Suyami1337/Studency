// API настроек домена проекта.
//
// PATCH  /api/projects/[id]/domain — изменить subdomain или подключить custom_domain
// GET    /api/projects/[id]/domain — статус кастомного домена (live запрос Vercel)
// DELETE /api/projects/[id]/domain — отвязать custom_domain

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { validateSubdomain, ROOT_DOMAIN } from '@/lib/subdomain'
import { addVercelDomain, removeVercelDomain, checkVercelDomain } from '@/lib/vercel-domains'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

async function ensureOwnership(supabase: ReturnType<typeof createServerSupabase> extends Promise<infer T> ? T : never, projectId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401, error: 'unauthorized' }
  const { data: project } = await supabase
    .from('projects')
    .select('id, owner_id, subdomain, custom_domain, custom_domain_status')
    .eq('id', projectId)
    .single()
  if (!project) return { ok: false as const, status: 404, error: 'project not found' }
  if (project.owner_id !== user.id) {
    // Может быть member — проверим
    const { data: m } = await supabase.from('project_members').select('role').eq('project_id', projectId).eq('user_id', user.id).maybeSingle()
    if (!m || m.role !== 'owner') return { ok: false as const, status: 403, error: 'forbidden' }
  }
  return { ok: true as const, project }
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const guard = await ensureOwnership(supabase, id)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const body = await request.json()

  // Изменение subdomain
  if (typeof body.subdomain === 'string') {
    const sub = body.subdomain.toLowerCase().trim()
    const err = validateSubdomain(sub)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
    const oldSub = guard.project.subdomain as string | null
    const { error } = await supabase.from('projects').update({ subdomain: sub }).eq('id', id)
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        return NextResponse.json({ error: 'Этот поддомен уже занят' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    // Зарегистрировать новый поддомен в Vercel (для выдачи SSL через HTTP-01).
    // Wildcard *.studency.ru без Vercel-NS не получает wildcard-SSL — каждый
    // субдомен надо добавить как отдельный domain.
    const newHost = `${sub}.${ROOT_DOMAIN}`
    addVercelDomain(newHost).catch(e => console.error('Vercel addDomain failed:', e))
    // Старый удалить (фоном)
    if (oldSub && oldSub !== sub) {
      removeVercelDomain(`${oldSub}.${ROOT_DOMAIN}`).catch(() => {})
    }
    return NextResponse.json({ ok: true, subdomain: sub })
  }

  // Подключение custom_domain
  if (typeof body.custom_domain === 'string') {
    const domain = body.custom_domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
      return NextResponse.json({ error: 'Невалидный формат домена' }, { status: 400 })
    }
    // Если до этого был другой — отвяжем в Vercel
    if (guard.project.custom_domain && guard.project.custom_domain !== domain) {
      try { await removeVercelDomain(guard.project.custom_domain) } catch {}
    }
    // Добавляем в Vercel
    let vercelResult
    try {
      vercelResult = await addVercelDomain(domain)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Vercel API недоступен'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
    if (!vercelResult.ok) {
      return NextResponse.json({ error: vercelResult.error || 'Не удалось добавить домен в Vercel' }, { status: 400 })
    }
    // Сохраняем в БД
    const { error } = await supabase.from('projects').update({
      custom_domain: domain,
      custom_domain_status: vercelResult.status,
      custom_domain_added_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        // Откатим добавление в Vercel
        try { await removeVercelDomain(domain) } catch {}
        return NextResponse.json({ error: 'Этот домен уже подключён к другому проекту' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({
      ok: true,
      custom_domain: domain,
      status: vercelResult.status,
      verification: vercelResult.verification,
    })
  }

  return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const guard = await ensureOwnership(supabase, id)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  if (!guard.project.custom_domain) {
    return NextResponse.json({ ok: true, custom_domain: null, status: null })
  }

  let vercelStatus
  try {
    vercelStatus = await checkVercelDomain(guard.project.custom_domain)
  } catch (e) {
    return NextResponse.json({ ok: true, custom_domain: guard.project.custom_domain, status: guard.project.custom_domain_status, error: e instanceof Error ? e.message : 'Vercel API error' })
  }

  // Обновим статус в БД если он поменялся
  if (vercelStatus.status !== 'not_found' && vercelStatus.status !== guard.project.custom_domain_status) {
    await supabase.from('projects').update({ custom_domain_status: vercelStatus.status }).eq('id', id)
  }

  return NextResponse.json({
    ok: true,
    custom_domain: guard.project.custom_domain,
    status: vercelStatus.status,
    verification: vercelStatus.verification,
  })
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const guard = await ensureOwnership(supabase, id)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  if (guard.project.custom_domain) {
    try { await removeVercelDomain(guard.project.custom_domain) } catch {}
  }
  await supabase.from('projects').update({
    custom_domain: null,
    custom_domain_status: 'pending',
    custom_domain_added_at: null,
  }).eq('id', id)

  return NextResponse.json({ ok: true })
}
