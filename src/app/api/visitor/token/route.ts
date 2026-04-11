import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VISITOR_COOKIE = 'stud_vid'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 год

/**
 * GET /api/visitor/token
 * Возвращает visitor_token из httpOnly cookie.
 * Если cookie нет — создаёт новый, ставит его, возвращает.
 *
 * Используется клиентским JS-трекером (VideoEmbed, и т.д.) для получения
 * токена при отправке track-запросов, поскольку сам httpOnly cookie JS-коду недоступен.
 */
export async function GET(_request: NextRequest) {
  const cookieStore = await cookies()
  let visitorToken = cookieStore.get(VISITOR_COOKIE)?.value

  const alreadyExists = !!visitorToken
  if (!visitorToken) {
    visitorToken = randomUUID()
  }

  const response = NextResponse.json({
    token: visitorToken,
    existed: alreadyExists,
  })

  if (!alreadyExists) {
    response.cookies.set(VISITOR_COOKIE, visitorToken, {
      maxAge: COOKIE_MAX_AGE,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    })
  }

  return response
}
