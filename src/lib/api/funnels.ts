import { createClient } from '@/lib/supabase'

const supabase = createClient()

export type Funnel = {
  id: string
  project_id: string
  name: string
  description: string | null
  status: 'draft' | 'active' | 'archived'
  created_at: string
  updated_at: string
}

export type FunnelStage = {
  id: string
  funnel_id: string
  name: string
  stage_type: 'bot' | 'landing' | 'order' | 'payment' | 'learning' | 'custom'
  order_position: number
  tool_id: string | null
  settings: Record<string, unknown>
  created_at: string
}

export async function getFunnels(projectId: string) {
  const { data, error } = await supabase
    .from('funnels')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as Funnel[]
}

export async function getFunnel(id: string) {
  const { data, error } = await supabase
    .from('funnels')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as Funnel
}

export async function createFunnel(projectId: string, name: string) {
  const { data, error } = await supabase
    .from('funnels')
    .insert({ project_id: projectId, name })
    .select()
    .single()

  if (error) throw error
  return data as Funnel
}

export async function updateFunnel(id: string, updates: Partial<Funnel>) {
  const { data, error } = await supabase
    .from('funnels')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Funnel
}

export async function deleteFunnel(id: string) {
  const { error } = await supabase
    .from('funnels')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// Stages
export async function getFunnelStages(funnelId: string) {
  const { data, error } = await supabase
    .from('funnel_stages')
    .select('*')
    .eq('funnel_id', funnelId)
    .order('order_position')

  if (error) throw error
  return data as FunnelStage[]
}

export async function createFunnelStage(funnelId: string, name: string, stageType: string, orderPosition: number) {
  const { data, error } = await supabase
    .from('funnel_stages')
    .insert({ funnel_id: funnelId, name, stage_type: stageType, order_position: orderPosition })
    .select()
    .single()

  if (error) throw error
  return data as FunnelStage
}

export async function deleteFunnelStage(id: string) {
  const { error } = await supabase
    .from('funnel_stages')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// Analytics: count customers per stage
export async function getFunnelStageStats(funnelId: string) {
  const { data, error } = await supabase
    .from('customer_funnel_positions')
    .select('stage_id')
    .eq('funnel_id', funnelId)

  if (error) throw error

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    const sid = (row as Record<string, unknown>).stage_id as string
    counts[sid] = (counts[sid] || 0) + 1
  }
  return counts
}
