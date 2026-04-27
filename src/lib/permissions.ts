// Каталог permissions и helpers для проверки прав.
//
// Источник правды — таблица permissions в БД (миграция 44).
// Эти константы синхронизированы с ней и нужны для безопасной работы из кода
// (избежать magic strings в API/UI).

import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// CATALOG (синхронизирован с supabase/44-roles-and-access.sql, BLOCK B)
// ---------------------------------------------------------------------------

export const PERMISSIONS = {
  // CRM
  CRM_CUSTOMERS_VIEW: 'crm.customers.view',
  CRM_CUSTOMERS_CREATE: 'crm.customers.create',
  CRM_CUSTOMERS_EDIT: 'crm.customers.edit',
  CRM_CUSTOMERS_DELETE: 'crm.customers.delete',
  CRM_CUSTOMERS_EXPORT: 'crm.customers.export',
  CRM_SEGMENTS_VIEW: 'crm.segments.view',
  CRM_SEGMENTS_EDIT: 'crm.segments.edit',
  CRM_NOTES_VIEW: 'crm.notes.view',
  CRM_NOTES_CREATE: 'crm.notes.create',
  CRM_NOTES_EDIT: 'crm.notes.edit',
  CRM_NOTES_DELETE: 'crm.notes.delete',
  CRM_FIELDS_VIEW: 'crm.fields.view',
  CRM_FIELDS_EDIT: 'crm.fields.edit',

  // Чат-боты
  CHATBOTS_VIEW: 'chatbots.view',
  CHATBOTS_CREATE: 'chatbots.create',
  CHATBOTS_EDIT: 'chatbots.edit',
  CHATBOTS_DELETE: 'chatbots.delete',
  CHATBOTS_BROADCASTS_VIEW: 'chatbots.broadcasts.view',
  CHATBOTS_BROADCASTS_CREATE: 'chatbots.broadcasts.create',
  CHATBOTS_BROADCASTS_EDIT: 'chatbots.broadcasts.edit',
  CHATBOTS_BROADCASTS_DELETE: 'chatbots.broadcasts.delete',

  // Переписки
  CONVERSATIONS_VIEW: 'conversations.view',
  CONVERSATIONS_REPLY: 'conversations.reply',

  // Воронки
  FUNNELS_VIEW: 'funnels.view',
  FUNNELS_CREATE: 'funnels.create',
  FUNNELS_EDIT: 'funnels.edit',
  FUNNELS_DELETE: 'funnels.delete',

  // Обучение
  LEARNING_COURSES_VIEW: 'learning.courses.view',
  LEARNING_COURSES_CREATE: 'learning.courses.create',
  LEARNING_COURSES_EDIT: 'learning.courses.edit',
  LEARNING_COURSES_DELETE: 'learning.courses.delete',
  LEARNING_LESSONS_VIEW: 'learning.lessons.view',
  LEARNING_LESSONS_CREATE: 'learning.lessons.create',
  LEARNING_LESSONS_EDIT: 'learning.lessons.edit',
  LEARNING_LESSONS_DELETE: 'learning.lessons.delete',
  LEARNING_HOMEWORK_REVIEW: 'learning.homework.review',
  LEARNING_ANALYTICS_VIEW: 'learning.analytics.view',
  LEARNING_ACCESS_GRANT: 'learning.access.grant',
  LEARNING_ACCESS_REVOKE: 'learning.access.revoke',

  // Продукты
  PRODUCTS_VIEW: 'products.view',
  PRODUCTS_CREATE: 'products.create',
  PRODUCTS_EDIT: 'products.edit',
  PRODUCTS_DELETE: 'products.delete',

  // Заказы
  ORDERS_VIEW: 'orders.view',
  ORDERS_CREATE: 'orders.create',
  ORDERS_EDIT: 'orders.edit',
  ORDERS_DELETE: 'orders.delete',
  ORDERS_REFUND: 'orders.refund',

  // Сайты
  SITES_LANDINGS_VIEW: 'sites.landings.view',
  SITES_LANDINGS_CREATE: 'sites.landings.create',
  SITES_LANDINGS_EDIT: 'sites.landings.edit',
  SITES_LANDINGS_DELETE: 'sites.landings.delete',
  SITES_SOURCES_VIEW: 'sites.sources.view',
  SITES_SOURCES_EDIT: 'sites.sources.edit',

  // Аналитика
  ANALYTICS_GENERAL_VIEW: 'analytics.general.view',
  ANALYTICS_SOURCES_VIEW: 'analytics.sources.view',
  ANALYTICS_FUNNEL_VIEW: 'analytics.funnel.view',
  ANALYTICS_EXPORT: 'analytics.export',

  // Соцсети
  SOCIAL_CHANNELS_VIEW: 'social.channels.view',
  SOCIAL_CHANNELS_EDIT: 'social.channels.edit',

  // Медиа
  MEDIA_VIEW: 'media.view',
  MEDIA_UPLOAD: 'media.upload',
  MEDIA_DELETE: 'media.delete',

  // Видео
  VIDEOS_VIEW: 'videos.view',
  VIDEOS_UPLOAD: 'videos.upload',
  VIDEOS_DELETE: 'videos.delete',

  // Журнал
  JOURNAL_VIEW: 'journal.view',

  // Команда и роли
  TEAM_MEMBERS_VIEW: 'team.members.view',
  TEAM_MEMBERS_INVITE: 'team.members.invite',
  TEAM_MEMBERS_EDIT: 'team.members.edit',
  TEAM_MEMBERS_REMOVE: 'team.members.remove',
  TEAM_ROLES_VIEW: 'team.roles.view',
  TEAM_ROLES_CREATE: 'team.roles.create',
  TEAM_ROLES_EDIT: 'team.roles.edit',
  TEAM_ROLES_DELETE: 'team.roles.delete',
  TEAM_IMPERSONATE: 'team.impersonate',

  // Настройки
  SETTINGS_PROJECT_VIEW: 'settings.project.view',
  SETTINGS_PROJECT_EDIT: 'settings.project.edit',
  SETTINGS_INTEGRATIONS_VIEW: 'settings.integrations.view',
  SETTINGS_INTEGRATIONS_EDIT: 'settings.integrations.edit',
  SETTINGS_DOMAIN_VIEW: 'settings.domain.view',
  SETTINGS_DOMAIN_EDIT: 'settings.domain.edit',

  // Опасная зона
  DANGER_DELETE_PROJECT: 'danger.delete_project',
  DANGER_TRANSFER_OWNERSHIP: 'danger.transfer_ownership',
  DANGER_EXPORT_ALL_DATA: 'danger.export_all_data',
} as const

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

// ---------------------------------------------------------------------------
// SYSTEM ROLE CODES (синхронизировано с миграцией 44)
// ---------------------------------------------------------------------------

export const SYSTEM_ROLES = {
  OWNER: 'owner',
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  GUEST: 'guest',
  LEAD: 'lead',
  STUDENT: 'student',
  CURATOR: 'curator',
  SALES: 'sales',
  MARKETER: 'marketer',
} as const

export type SystemRoleCode = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES]

export type AccessType = 'admin_panel' | 'student_panel' | 'no_access'

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/**
 * Проверяет наличие конкретного permission у текущего юзера в проекте.
 * Использует SQL функцию has_permission() — она STABLE и быстрая.
 */
export async function hasPermission(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  permission: PermissionCode,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_permission', {
    p_project_id: projectId,
    p_user_id: userId,
    p_permission: permission,
  })
  if (error) {
    console.error('hasPermission rpc error:', error)
    return false
  }
  return Boolean(data)
}

/**
 * Получить роль пользователя в проекте (или null если не член).
 */
export async function getMemberRole(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<{
  role_id: string
  role_code: string
  role_label: string
  access_type: AccessType
  is_system: boolean
} | null> {
  const { data, error } = await supabase.rpc('get_member_role', {
    p_project_id: projectId,
    p_user_id: userId,
  })
  if (error || !data || data.length === 0) return null
  return data[0] as {
    role_id: string
    role_code: string
    role_label: string
    access_type: AccessType
    is_system: boolean
  }
}

/**
 * Получить весь набор permissions пользователя в проекте.
 * Используется для отрисовки UI (показывать/скрывать кнопки и разделы).
 */
export async function getMemberPermissions(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('get_member_permissions', {
    p_project_id: projectId,
    p_user_id: userId,
  })
  if (error || !data) return new Set()
  return new Set((data as Array<{ permission_code: string }>).map((r) => r.permission_code))
}

/**
 * Сервер-сайд проверка: пользователь должен иметь permission, иначе 403.
 * Возвращает { ok: true } или { ok: false, status, error }.
 */
export async function requirePermission(
  supabase: SupabaseClient,
  projectId: string,
  permission: PermissionCode,
): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'unauthorized' }

  const allowed = await hasPermission(supabase, projectId, user.id, permission)
  if (!allowed) return { ok: false, status: 403, error: 'forbidden' }

  return { ok: true, userId: user.id }
}
