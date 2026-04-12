import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { runChatbotAgent } from '@/lib/ai-agents/chatbot-agent'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { scenarioId, projectId, history, userMessage } = body

    if (!scenarioId || !projectId || !userMessage) {
      return NextResponse.json({ error: 'scenarioId, projectId, userMessage required' }, { status: 400 })
    }

    const supabase = await createServerSupabase()

    // Verify the scenario belongs to the project — isolation guarantee
    const { data: scenario, error: scErr } = await supabase
      .from('scenarios')
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
    console.error('chatbot agent error:', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Unknown error',
      hint: 'Установи ANTHROPIC_API_KEY в Vercel env vars',
    }, { status: 500 })
  }
}
