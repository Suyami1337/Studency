// CRM Automation Engine
// Оценивает правила auto-столбцов и перемещает клиентов по доскам.
//
// Вызывается из endpoints которые пишут события:
//   /api/events, /api/videos/track, /api/landing/submit,
//   /api/prodamus/webhook, telegram webhook (customer_actions)
//
// Логика:
// 1. Получаем все доски проекта
// 2. Для каждой доски получаем auto-столбцы с правилами
// 3. Для каждого столбца проверяем правила (OR между правилами, AND внутри)
// 4. Если правило совпало — проверяем:
//    a) Не сработало ли уже (crm_stage_rule_fired)
//    b) Движение только вперёд (order_position текущего < order_position целевого)
//    c) Если require_from_previous — клиент на предыдущем столбце
// 5. Перемещаем + пишем лог + отмечаем fired

import { SupabaseClient } from '@supabase/supabase-js'

export type EventContext = {
  projectId: string
  customerId: string
  eventType: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventData: Record<string, any>  // все данные события для проверки фильтров
}

/**
 * Главная функция — вызывается после каждого значимого события клиента.
 * Проходит по всем доскам проекта, проверяет auto-столбцы, двигает клиента.
 *
 * Возвращает массив перемещений которые произошли.
 */
export async function evaluateAutoBoards(
  supabase: SupabaseClient,
  ctx: EventContext
): Promise<Array<{ boardId: string; fromStageId: string | null; toStageId: string; stageName: string }>> {
  const movements: Array<{ boardId: string; fromStageId: string | null; toStageId: string; stageName: string }> = []

  try {
    // 1. Все доски проекта
    const { data: boards } = await supabase
      .from('crm_boards')
      .select('id')
      .eq('project_id', ctx.projectId)

    if (!boards || boards.length === 0) return movements

    for (const board of boards) {
      const moved = await evaluateBoard(supabase, ctx, board.id)
      if (moved) movements.push(moved)
    }
  } catch (err) {
    console.error('evaluateAutoBoards error:', err)
  }

  return movements
}

/**
 * Оценивает одну доску для одного клиента.
 */
async function evaluateBoard(
  supabase: SupabaseClient,
  ctx: EventContext,
  boardId: string
): Promise<{ boardId: string; fromStageId: string | null; toStageId: string; stageName: string } | null> {
  // Получаем все столбцы доски с правилами
  const { data: stages } = await supabase
    .from('crm_board_stages')
    .select('id, name, order_position, automation_mode, require_from_previous')
    .eq('board_id', boardId)
    .order('order_position')

  if (!stages || stages.length === 0) return null

  // Получаем текущую позицию клиента на этой доске
  const { data: currentPos } = await supabase
    .from('customer_crm_positions')
    .select('stage_id')
    .eq('customer_id', ctx.customerId)
    .eq('board_id', boardId)
    .maybeSingle()

  const currentStageId = currentPos?.stage_id ?? null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentStage = currentStageId ? stages.find((s: any) => s.id === currentStageId) : null
  const currentOrder = currentStage?.order_position ?? -1

  // Получаем все auto-столбцы с правилами
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autoStages = stages.filter((s: any) => s.automation_mode === 'auto')
  if (autoStages.length === 0) return null

  const stageIds = autoStages.map((s: { id: string }) => s.id)
  const { data: allRules } = await supabase
    .from('crm_stage_rules')
    .select('*')
    .in('stage_id', stageIds)
    .order('order_index')

  if (!allRules || allRules.length === 0) return null

  // Группируем правила по stage_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rulesByStage = new Map<string, any[]>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of allRules as any[]) {
    if (!rulesByStage.has(r.stage_id)) rulesByStage.set(r.stage_id, [])
    rulesByStage.get(r.stage_id)!.push(r)
  }

  // Проверяем уже сработавшие правила для этого клиента
  const { data: firedRecords } = await supabase
    .from('crm_stage_rule_fired')
    .select('stage_id, rule_id')
    .eq('customer_id', ctx.customerId)
    .in('stage_id', stageIds)

  const firedSet = new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (firedRecords ?? []).map((f: any) => `${f.stage_id}:${f.rule_id}`)
  )

  // Ищем самый дальний столбец (максимальный order_position) где правило совпало
  let bestMatch: { stageId: string; stageName: string; ruleId: string; orderPosition: number } | null = null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const stage of autoStages as any[]) {
    // Только вперёд
    if (stage.order_position <= currentOrder) continue

    // Require from previous — клиент должен быть на предыдущем столбце
    if (stage.require_from_previous) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prevStage = stages.find((s: any) => s.order_position === stage.order_position - 1)
      if (!prevStage || currentStageId !== prevStage.id) continue
    }

    const rules = rulesByStage.get(stage.id) ?? []

    // OR между правилами — ищем хотя бы одно совпавшее
    for (const rule of rules) {
      // Уже сработало — пропускаем
      if (firedSet.has(`${stage.id}:${rule.id}`)) continue

      // Проверяем: event_type совпадает?
      if (rule.event_type !== ctx.eventType) continue

      // Проверяем фильтры (AND — все должны совпасть)
      if (!matchFilters(rule.filters, ctx.eventData)) continue

      // Совпало! Это кандидат. Берём если order_position больше текущего лучшего.
      if (!bestMatch || stage.order_position > bestMatch.orderPosition) {
        bestMatch = {
          stageId: stage.id,
          stageName: stage.name,
          ruleId: rule.id,
          orderPosition: stage.order_position,
        }
      }

      // Не break — проверяем все столбцы (ищем максимальный)
    }
  }

  if (!bestMatch) return null

  // Перемещаем клиента
  await moveCustomer(supabase, ctx.customerId, boardId, currentStageId, bestMatch.stageId, bestMatch.ruleId)

  return {
    boardId,
    fromStageId: currentStageId,
    toStageId: bestMatch.stageId,
    stageName: bestMatch.stageName,
  }
}

/**
 * Проверяет что все фильтры правила совпадают с данными события (AND).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function matchFilters(filters: Record<string, any>, eventData: Record<string, any>): boolean {
  if (!filters || Object.keys(filters).length === 0) return true

  for (const [key, expected] of Object.entries(filters)) {
    const actual = eventData[key]

    if (actual === undefined || actual === null) return false

    // Строковое сравнение (case-insensitive)
    if (typeof expected === 'string' && typeof actual === 'string') {
      if (expected.toLowerCase() !== actual.toLowerCase()) return false
      continue
    }

    // Числовое сравнение
    if (typeof expected === 'number') {
      if (Number(actual) !== expected) return false
      continue
    }

    // Boolean
    if (typeof expected === 'boolean') {
      if (Boolean(actual) !== expected) return false
      continue
    }

    // Объект с оператором: { "$gte": 90 }
    if (typeof expected === 'object' && expected !== null) {
      if ('$gte' in expected && Number(actual) < Number(expected.$gte)) return false
      if ('$lte' in expected && Number(actual) > Number(expected.$lte)) return false
      if ('$gt' in expected && Number(actual) <= Number(expected.$gt)) return false
      if ('$lt' in expected && Number(actual) >= Number(expected.$lt)) return false
      if ('$contains' in expected && !String(actual).toLowerCase().includes(String(expected.$contains).toLowerCase())) return false
      continue
    }

    // Fallback: strict equality
    if (String(expected) !== String(actual)) return false
  }

  return true
}

/**
 * Перемещает клиента на новый столбец + пишет лог + отмечает fired.
 */
async function moveCustomer(
  supabase: SupabaseClient,
  customerId: string,
  boardId: string,
  fromStageId: string | null,
  toStageId: string,
  ruleId: string
): Promise<void> {
  // Upsert позиции
  const { data: existing } = await supabase
    .from('customer_crm_positions')
    .select('id')
    .eq('customer_id', customerId)
    .eq('board_id', boardId)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('customer_crm_positions')
      .update({ stage_id: toStageId, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('customer_crm_positions')
      .insert({
        customer_id: customerId,
        board_id: boardId,
        stage_id: toStageId,
      })
  }

  // Лог перемещения
  await supabase.from('crm_movement_log').insert({
    customer_id: customerId,
    board_id: boardId,
    from_stage_id: fromStageId,
    to_stage_id: toStageId,
    moved_by: 'automation',
    rule_id: ruleId,
  })

  // Отмечаем что правило сработало (одноразово)
  await supabase.from('crm_stage_rule_fired').upsert({
    customer_id: customerId,
    stage_id: toStageId,
    rule_id: ruleId,
  }, { onConflict: 'customer_id,stage_id,rule_id' })

  // Пишем в customer_actions для timeline
  await supabase.from('customer_actions').insert({
    customer_id: customerId,
    project_id: (await supabase.from('crm_boards').select('project_id').eq('id', boardId).single()).data?.project_id,
    action: 'crm_auto_move',
    data: {
      board_id: boardId,
      from_stage_id: fromStageId,
      to_stage_id: toStageId,
      rule_id: ruleId,
    },
  })
}
