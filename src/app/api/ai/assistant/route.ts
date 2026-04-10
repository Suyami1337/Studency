import { NextRequest, NextResponse } from 'next/server'
import { aiAssistant } from '@/lib/ai'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { question, context } = body
    if (!question) return NextResponse.json({ error: 'question required' }, { status: 400 })

    const answer = await aiAssistant(question, context)
    return NextResponse.json({ ok: true, answer })
  } catch (err) {
    console.error('ai assistant error:', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Unknown',
      hint: 'Установи ANTHROPIC_API_KEY в Vercel env vars',
    }, { status: 500 })
  }
}
