import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * GET /api/videos/debug?kinescope_id=...
 * Возвращает сырой ответ Kinescope API для отладки.
 * TODO: удалить после того как synergy работает стабильно.
 */
export async function GET(request: NextRequest) {
  const kinescopeId = request.nextUrl.searchParams.get('kinescope_id')
  if (!kinescopeId) return NextResponse.json({ error: 'kinescope_id required' }, { status: 400 })

  const token = process.env.KINESCOPE_API_TOKEN
  if (!token) return NextResponse.json({ error: 'KINESCOPE_API_TOKEN not set' }, { status: 500 })

  try {
    const res = await fetch(`https://api.kinescope.io/v1/videos/${kinescopeId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
    const text = await res.text()
    return NextResponse.json({
      status_code: res.status,
      body_raw: text.slice(0, 2000),
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}
