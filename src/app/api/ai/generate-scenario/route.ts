import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateChatbotScenario } from '@/lib/ai'

export const runtime = 'nodejs'
export const maxDuration = 60

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/ai/generate-scenario
 * Body: { description, telegram_bot_id }
 * Generates a chatbot scenario via Claude and saves it to DB.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { description, telegram_bot_id } = body

    if (!description || !telegram_bot_id) {
      return NextResponse.json({ error: 'description and telegram_bot_id required' }, { status: 400 })
    }

    // 1. Generate scenario via Claude
    let scenario
    try {
      scenario = await generateChatbotScenario(description)
    } catch (err) {
      return NextResponse.json({
        error: err instanceof Error ? err.message : 'AI generation failed',
        hint: 'Установи ANTHROPIC_API_KEY в Vercel env vars',
      }, { status: 500 })
    }

    const supabase = getSupabase()

    // 2. Create scenario
    const { data: scenarioRow, error: scenErr } = await supabase
      .from('chatbot_scenarios')
      .insert({
        telegram_bot_id,
        name: scenario.name,
        status: 'draft',
      })
      .select().single()

    if (scenErr || !scenarioRow) {
      return NextResponse.json({ error: scenErr?.message ?? 'Failed to create scenario' }, { status: 500 })
    }

    // 3. Create messages
    const messageIds: string[] = []
    for (let i = 0; i < scenario.messages.length; i++) {
      const m = scenario.messages[i]
      const { data: msgRow } = await supabase
        .from('scenario_messages')
        .insert({
          scenario_id: scenarioRow.id,
          order_position: i,
          text: m.text,
          is_start: m.is_start,
          trigger_word: m.trigger_word ?? null,
          delay_minutes: 0,
          delay_unit: 'min',
        })
        .select().single()

      if (msgRow) messageIds.push(msgRow.id)
    }

    // 4. Create buttons
    for (let i = 0; i < scenario.messages.length; i++) {
      const m = scenario.messages[i]
      if (!m.buttons) continue
      for (let j = 0; j < m.buttons.length; j++) {
        const b = m.buttons[j]
        await supabase.from('scenario_buttons').insert({
          message_id: messageIds[i],
          order_position: j,
          text: b.text,
          action_type: b.action_type,
          action_url: b.action_type === 'url' ? b.value : null,
          action_trigger_word: b.action_type === 'trigger' ? b.value : null,
        })
      }
    }

    return NextResponse.json({ ok: true, scenario_id: scenarioRow.id, scenario })
  } catch (err) {
    console.error('generate-scenario error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
