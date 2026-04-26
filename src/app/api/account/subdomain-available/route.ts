// GET /api/account/subdomain-available?sub=<value> — проверить доступность поддомена.
// Используется на странице регистрации (юзер ещё не залогинен), поэтому
// проверка идёт через service role.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateSubdomain } from '@/lib/subdomain'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const sub = (new URL(request.url).searchParams.get('sub') || '').toLowerCase().trim()
  const valErr = validateSubdomain(sub)
  if (valErr) return NextResponse.json({ available: false, error: valErr })

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data } = await svc
    .from('account_domains')
    .select('user_id')
    .eq('subdomain', sub)
    .maybeSingle()

  return NextResponse.json({ available: !data })
}
