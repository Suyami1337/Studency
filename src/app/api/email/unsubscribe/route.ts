import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export const runtime = 'nodejs'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function sign(data: string): string {
  const secret = process.env.UNSUBSCRIBE_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'fallback'
  return crypto.createHmac('sha256', secret).update(data).digest('hex').slice(0, 32)
}

function verifyAndParseToken(token: string): { project_id: string; email: string } | null {
  const [base, sig] = token.split('.')
  if (!base || !sig) return null
  const expected = sign(base)
  if (expected !== sig) return null
  try {
    const payload = JSON.parse(Buffer.from(base, 'base64url').toString('utf-8'))
    return { project_id: payload.p, email: payload.e }
  } catch {
    return null
  }
}

// GET — отписаться по ссылке (one-click from email footer)
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'no token' }, { status: 400 })

  const parsed = verifyAndParseToken(token)
  if (!parsed) return NextResponse.json({ error: 'invalid token' }, { status: 400 })

  const supabase = getSupabase()
  await supabase.from('email_unsubscribes').upsert({
    project_id: parsed.project_id,
    email: parsed.email,
    reason: 'one-click',
  }, { onConflict: 'project_id,email' })

  // Перенаправляем на страницу подтверждения
  const url = new URL('/unsubscribe', request.url)
  url.searchParams.set('ok', '1')
  url.searchParams.set('email', parsed.email)
  return NextResponse.redirect(url)
}

// POST — one-click unsubscribe (RFC 8058, Gmail использует)
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'no token' }, { status: 400 })

  const parsed = verifyAndParseToken(token)
  if (!parsed) return NextResponse.json({ error: 'invalid token' }, { status: 400 })

  const supabase = getSupabase()
  await supabase.from('email_unsubscribes').upsert({
    project_id: parsed.project_id,
    email: parsed.email,
    reason: 'one-click-post',
  }, { onConflict: 'project_id,email' })

  return NextResponse.json({ ok: true })
}
