import { createClient } from '@/lib/supabase'

const supabase = createClient()

export type Customer = {
  id: string
  project_id: string
  email: string | null
  phone: string | null
  full_name: string | null
  telegram_id: string | null
  telegram_username: string | null
  instagram: string | null
  vk: string | null
  whatsapp: string | null
  tags: string[]
  notes: string | null
  is_blocked: boolean
  created_at: string
  updated_at: string
}

export type CustomerAction = {
  id: string
  customer_id: string
  action: string
  data: Record<string, unknown>
  created_at: string
}

export async function getCustomers(projectId: string) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as Customer[]
}

export async function getCustomer(id: string) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as Customer
}

export async function createCustomer(projectId: string, customer: Partial<Customer>) {
  const { data, error } = await supabase
    .from('customers')
    .insert({ ...customer, project_id: projectId })
    .select()
    .single()

  if (error) throw error
  return data as Customer
}

export async function updateCustomer(id: string, updates: Partial<Customer>) {
  const { data, error } = await supabase
    .from('customers')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Customer
}

export async function getCustomerActions(customerId: string) {
  const { data, error } = await supabase
    .from('customer_actions')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error
  return data as CustomerAction[]
}

export async function logCustomerAction(
  customerId: string,
  projectId: string,
  action: string,
  actionData: Record<string, unknown> = {}
) {
  const { error } = await supabase
    .from('customer_actions')
    .insert({
      customer_id: customerId,
      project_id: projectId,
      action,
      data: actionData,
    })

  if (error) throw error
}

export async function getCustomersByStage(boardId: string, stageId: string) {
  const { data, error } = await supabase
    .from('customer_crm_positions')
    .select('customer_id, customers(*)')
    .eq('board_id', boardId)
    .eq('stage_id', stageId)

  if (error) throw error
  return (data ?? []).map(d => (d as Record<string, unknown>).customers as Customer)
}

export async function moveCustomerToStage(customerId: string, boardId: string, stageId: string) {
  const { error } = await supabase
    .from('customer_crm_positions')
    .upsert(
      { customer_id: customerId, board_id: boardId, stage_id: stageId, updated_at: new Date().toISOString() },
      { onConflict: 'customer_id,board_id' }
    )

  if (error) throw error
}
