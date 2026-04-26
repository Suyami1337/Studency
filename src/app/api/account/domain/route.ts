// API настроек домена аккаунта (level 1).
//
// GET    /api/account/domain — текущие subdomain/custom_domain + актуальный статус из Vercel
// PATCH  /api/account/domain — изменить subdomain или подключить custom_domain
// DELETE /api/account/domain — отвязать custom_domain

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { validateSubdomain, ROOT_DOMAIN } from '@/lib/subdomain'
import { addVercelDomain, removeVercelDomain, checkVercelDomain } from '@/lib/vercel-domains'

export const runtime = 'nodejs'

async function getAccount() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401, error: 'unauthorized' }
  const { data: account } = await supabase
    .from('account_domains')
    .select('user_id, subdomain, custom_domain, custom_domain_status, custom_domain_added_at')
    .eq('user_id', user.id)
    .maybeSingle()
  return { ok: true as const, supabase, user, account }
}

export async function GET() {
  const a = await getAccount()
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })
  if (!a.account) {
    return NextResponse.json({ subdomain: null, custom_domain: null })
  }

  let status = a.account.custom_domain_status
  let verification: unknown = null
  let config: unknown = null
  if (a.account.custom_domain) {
    try {
      const r = await checkVercelDomain(a.account.custom_domain)
      if (r.status !== 'not_found') {
        status = r.status
        verification = r.verification ?? null
        config = r.config ?? null
        if (status !== a.account.custom_domain_status) {
          await a.supabase.from('account_domains').update({ custom_domain_status: status }).eq('user_id', a.user.id)
        }
      }
    } catch { /* ignore */ }
  }
  return NextResponse.json({
    subdomain: a.account.subdomain,
    custom_domain: a.account.custom_domain,
    custom_domain_status: status,
    verification,
    config,
  })
}

export async function PATCH(request: NextRequest) {
  const a = await getAccount()
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })

  const body = await request.json()

  // Изменение subdomain
  if (typeof body.subdomain === 'string') {
    const sub = body.subdomain.toLowerCase().trim()
    const err = validateSubdomain(sub)
    if (err) return NextResponse.json({ error: err }, { status: 400 })

    const oldSub = a.account?.subdomain ?? null

    // Upsert
    const { error } = await a.supabase
      .from('account_domains')
      .upsert({ user_id: a.user.id, subdomain: sub }, { onConflict: 'user_id' })
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        return NextResponse.json({ error: 'Этот поддомен уже занят' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Vercel: добавить новый, удалить старый
    addVercelDomain(`${sub}.${ROOT_DOMAIN}`).catch(e => console.error('Vercel addDomain failed:', e))
    if (oldSub && oldSub !== sub) {
      removeVercelDomain(`${oldSub}.${ROOT_DOMAIN}`).catch(() => {})
    }
    return NextResponse.json({ ok: true, subdomain: sub })
  }

  // Подключение custom_domain
  if (typeof body.custom_domain === 'string') {
    if (!a.account?.subdomain) {
      return NextResponse.json({ error: 'Сначала создайте поддомен аккаунта' }, { status: 400 })
    }
    const domain = body.custom_domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
      return NextResponse.json({ error: 'Невалидный формат домена' }, { status: 400 })
    }
    if (a.account.custom_domain && a.account.custom_domain !== domain) {
      try { await removeVercelDomain(a.account.custom_domain) } catch {}
    }
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
    const { error } = await a.supabase.from('account_domains').update({
      custom_domain: domain,
      custom_domain_status: vercelResult.status,
      custom_domain_added_at: new Date().toISOString(),
    }).eq('user_id', a.user.id)
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        try { await removeVercelDomain(domain) } catch {}
        return NextResponse.json({ error: 'Этот домен уже подключён к другому аккаунту' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({
      ok: true,
      custom_domain: domain,
      status: vercelResult.status,
      verification: vercelResult.verification,
      config: vercelResult.config,
    })
  }

  return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
}

export async function DELETE() {
  const a = await getAccount()
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })
  if (!a.account?.custom_domain) return NextResponse.json({ ok: true })

  try { await removeVercelDomain(a.account.custom_domain) } catch {}
  await a.supabase.from('account_domains').update({
    custom_domain: null,
    custom_domain_status: null,
    custom_domain_added_at: null,
  }).eq('user_id', a.user.id)
  return NextResponse.json({ ok: true })
}
