import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { runLandingAgent } from '@/lib/ai-agents/landing-agent'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { landingId, projectId, history, userMessage } = body

    if (!landingId || !projectId || !userMessage) {
      return NextResponse.json({ error: 'landingId, projectId, userMessage required' }, { status: 400 })
    }

    const supabase = await createServerSupabase()

    // Ownership guard
    const { data: landing, error } = await supabase
      .from('landings')
      .select('id, project_id, name')
      .eq('id', landingId)
      .single()
    if (error || !landing) {
      return NextResponse.json({ error: 'Лендинг не найден' }, { status: 404 })
    }
    if (landing.project_id !== projectId) {
      return NextResponse.json({ error: 'Лендинг не в этом проекте' }, { status: 403 })
    }

    const result = await runLandingAgent({
      landingId,
      projectId,
      history: Array.isArray(history) ? history : [],
      userMessage,
      supabase,
    })

    return NextResponse.json({
      ok: true,
      assistantText: result.assistantText,
      toolCalls: result.toolCalls,
      changesApplied: result.changesApplied,
      history: result.history,
    })
  } catch (err) {
    console.error('landing agent error:', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Unknown error',
      hint: 'Установи ANTHROPIC_API_KEY в Vercel env vars',
    }, { status: 500 })
  }
}
