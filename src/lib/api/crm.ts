import { createClient } from '@/lib/supabase'

const supabase = createClient()

export type CrmBoard = {
  id: string
  project_id: string
  name: string
  funnel_id: string | null
  created_at: string
  updated_at: string
}

export type CrmBoardStage = {
  id: string
  board_id: string
  name: string
  color: string
  order_position: number
  funnel_stage_id: string | null
  created_at: string
}

export async function getCrmBoards(projectId: string) {
  const { data, error } = await supabase
    .from('crm_boards')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as CrmBoard[]
}

export async function getCrmBoard(id: string) {
  const { data, error } = await supabase
    .from('crm_boards')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as CrmBoard
}

export async function createCrmBoard(projectId: string, name: string) {
  const { data, error } = await supabase
    .from('crm_boards')
    .insert({ project_id: projectId, name })
    .select()
    .single()

  if (error) throw error
  return data as CrmBoard
}

export async function deleteCrmBoard(id: string) {
  const { error } = await supabase
    .from('crm_boards')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// Board stages
export async function getBoardStages(boardId: string) {
  const { data, error } = await supabase
    .from('crm_board_stages')
    .select('*')
    .eq('board_id', boardId)
    .order('order_position')

  if (error) throw error
  return data as CrmBoardStage[]
}

export async function createBoardStage(boardId: string, name: string, color: string, orderPosition: number) {
  const { data, error } = await supabase
    .from('crm_board_stages')
    .insert({ board_id: boardId, name, color, order_position: orderPosition })
    .select()
    .single()

  if (error) throw error
  return data as CrmBoardStage
}

export async function deleteBoardStage(id: string) {
  const { error } = await supabase
    .from('crm_board_stages')
    .delete()
    .eq('id', id)

  if (error) throw error
}
