// Server-side auth helpers для API routes.
//
// ensureProjectAccess(projectId) — гарантирует что текущий юзер
// (через cookie/session) действительно имеет доступ к проекту.
// Используется во всех routes которые принимают projectId от клиента.

import type { SupabaseClient } from '@supabase/supabase-js'

export type ProjectAccessResult =
  | { ok: true; userId: string; role: string }
  | { ok: false; status: number; error: string }

/** Проверяет что user авторизован и состоит в проекте (owner или member). */
export async function ensureProjectAccess(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ProjectAccessResult> {
  if (!projectId) return { ok: false, status: 400, error: 'projectId required' }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'unauthorized' }

  // owner проекта
  const { data: project } = await supabase
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .maybeSingle()
  if (project?.owner_id === user.id) {
    return { ok: true, userId: user.id, role: 'owner' }
  }

  // или member через project_members + roles
  const { data: member } = await supabase
    .from('project_members')
    .select('status, roles!inner(code)')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()
  const roleCode = (member as { roles?: { code?: string } } | null)?.roles?.code
  if (roleCode) {
    return { ok: true, userId: user.id, role: roleCode }
  }

  return { ok: false, status: 403, error: 'forbidden' }
}

/** Проверяет владение лендингом (по project_id). */
export async function ensureLandingAccess(
  supabase: SupabaseClient,
  landingId: string,
): Promise<{ ok: true; landing: { id: string; project_id: string }; userId: string } | { ok: false; status: number; error: string }> {
  if (!landingId) return { ok: false, status: 400, error: 'landingId required' }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'unauthorized' }

  const { data: landing } = await supabase
    .from('landings')
    .select('id, project_id')
    .eq('id', landingId)
    .maybeSingle()
  if (!landing) return { ok: false, status: 404, error: 'landing not found' }

  const access = await ensureProjectAccess(supabase, landing.project_id)
  if (!access.ok) return access
  return { ok: true, landing, userId: user.id }
}
