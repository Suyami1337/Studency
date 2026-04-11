// Usage tracking helper — пишет записи в usage_events для мониторинга
// мастер-ресурсов (AI, Email, Video) по каждому проекту.

import { SupabaseClient } from '@supabase/supabase-js'

export type ResourceType = 'ai_message' | 'email_sent' | 'video_upload' | 'video_storage'

export async function trackUsage(
  supabase: SupabaseClient,
  projectId: string | null,
  resource: ResourceType,
  action?: string,
  units: number = 1,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await supabase.from('usage_events').insert({
      project_id: projectId,
      resource,
      action: action ?? null,
      units,
      metadata: metadata ?? {},
    })
  } catch (err) {
    console.error('usage tracking error:', err)
  }
}
