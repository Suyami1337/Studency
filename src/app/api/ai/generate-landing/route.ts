import { NextRequest, NextResponse } from 'next/server'
import { generateLandingContent } from '@/lib/ai'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { description } = body
    if (!description) return NextResponse.json({ error: 'description required' }, { status: 400 })

    const content = await generateLandingContent(description)
    return NextResponse.json({ ok: true, content })
  } catch (err) {
    console.error('generate-landing error:', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Unknown',
      hint: 'Установи ANTHROPIC_API_KEY в Vercel env vars',
    }, { status: 500 })
  }
}
