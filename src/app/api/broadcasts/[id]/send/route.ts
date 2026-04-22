import { NextRequest, NextResponse } from 'next/server'
import { runBroadcast } from '@/lib/broadcast-send'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/broadcasts/[id]/send
 * UI-кнопка «Отправить» — запускает отправку немедленно.
 * Крон использует тот же runBroadcast напрямую (см. /api/cron/broadcasts).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = await runBroadcast(id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 })
  return NextResponse.json(result)
}
