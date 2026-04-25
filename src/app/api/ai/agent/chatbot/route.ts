import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { runChatbotAgent } from '@/lib/ai-agents/chatbot-agent'
import { ensureProjectAccess } from '@/lib/api-auth'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { scenarioId, projectId, history, userMessage, attachments } = body

    if (!scenarioId || !projectId || (!userMessage && (!Array.isArray(attachments) || attachments.length === 0))) {
      return NextResponse.json({ error: 'scenarioId, projectId, userMessage required' }, { status: 400 })
    }

    const supabase = await createServerSupabase()

    // 1. User должен иметь доступ к projectId
    const access = await ensureProjectAccess(supabase, projectId)
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    // 2. Сценарий принадлежит этому проекту
    const { data: scenario, error: scErr } = await supabase
      .from('chatbot_scenarios')
      .select('id, project_id, name')
      .eq('id', scenarioId)
      .single()
    if (scErr || !scenario) {
      return NextResponse.json({ error: 'Сценарий не найден' }, { status: 404 })
    }
    if (scenario.project_id !== projectId) {
      return NextResponse.json({ error: 'Сценарий не в этом проекте' }, { status: 403 })
    }

    const result = await runChatbotAgent({
      scenarioId,
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
    console.error('chatbot agent error:', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Unknown error',
      hint: 'Установи ANTHROPIC_API_KEY в Vercel env vars',
    }, { status: 500 })
  }
}
