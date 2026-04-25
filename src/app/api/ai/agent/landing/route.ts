import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { runLandingAgent } from '@/lib/ai-agents/landing-agent'
import { ensureProjectAccess } from '@/lib/api-auth'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { landingId, projectId, history, userMessage, attachments } = body

    if (!landingId || !projectId || (!userMessage && (!Array.isArray(attachments) || attachments.length === 0))) {
      return NextResponse.json({ error: 'landingId, projectId, userMessage required' }, { status: 400 })
    }

    const supabase = await createServerSupabase()

    // 1. User должен иметь доступ к projectId
    const access = await ensureProjectAccess(supabase, projectId)
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    // 2. Лендинг существует и принадлежит этому проекту
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
      userMessage: userMessage ?? '',
      attachments: Array.isArray(attachments) ? attachments : undefined,
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
