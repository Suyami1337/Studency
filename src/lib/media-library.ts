// Media Library helpers — upload, delete, usage tracking
// Centralized storage for all project media (chatbots, landings, etc.)

import { SupabaseClient } from '@supabase/supabase-js'

export const BUCKET = 'chatbot-media'

export type MediaType = 'photo' | 'video' | 'animation' | 'audio' | 'document' | 'video_note'

export type MediaItem = {
  id: string
  project_id: string
  storage_path: string
  public_url: string
  file_name: string
  mime_type: string
  media_type: MediaType
  size_bytes: number
  uploaded_by: string | null
  uploaded_at: string
}

export type UsageType = 'scenario_message' | 'followup' | 'landing' | 'landing_block'

export function detectMediaTypeFromMime(mime: string): MediaType {
  if (mime === 'image/gif') return 'animation'
  if (mime.startsWith('image/')) return 'photo'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'document'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function uploadMedia(supabase: SupabaseClient, projectId: string, file: File): Promise<MediaItem> {
  const ext = file.name.split('.').pop() || 'bin'
  const storagePath = `${projectId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  // 1. Upload file to Storage
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    cacheControl: '3600', upsert: false,
  })
  if (upErr) throw upErr

  // 2. Get public URL
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)

  // 3. Get user id
  const { data: { user } } = await supabase.auth.getUser()

  // 4. Insert into media_library
  const { data, error } = await supabase.from('media_library').insert({
    project_id: projectId,
    storage_path: storagePath,
    public_url: pub.publicUrl,
    file_name: file.name,
    mime_type: file.type || 'application/octet-stream',
    media_type: detectMediaTypeFromMime(file.type),
    size_bytes: file.size,
    uploaded_by: user?.id ?? null,
  }).select().single()

  if (error) {
    // Clean up uploaded file if DB insert failed
    await supabase.storage.from(BUCKET).remove([storagePath])
    throw error
  }

  return data as MediaItem
}

/**
 * Connect a media file to a usage (e.g. a scenario message).
 * Idempotent — safe to call multiple times.
 */
export async function trackUsage(
  supabase: SupabaseClient, mediaId: string, usageType: UsageType, usageId: string
) {
  await supabase.from('media_usages').upsert({
    media_id: mediaId, usage_type: usageType, usage_id: usageId,
  }, { onConflict: 'media_id,usage_type,usage_id' })
}

/**
 * Remove a specific usage. If this was the media's last usage, delete the file
 * from Storage and the library row too (garbage collection).
 */
export async function untrackUsage(
  supabase: SupabaseClient, mediaId: string, usageType: UsageType, usageId: string
) {
  await supabase.from('media_usages')
    .delete()
    .eq('media_id', mediaId)
    .eq('usage_type', usageType)
    .eq('usage_id', usageId)

  await deleteIfOrphan(supabase, mediaId)
}

/**
 * Remove all usages for a given entity (e.g. when a message is deleted).
 * Triggers orphan cleanup for each affected media.
 */
export async function untrackAllUsages(
  supabase: SupabaseClient, usageType: UsageType, usageId: string
) {
  const { data: usages } = await supabase.from('media_usages')
    .select('media_id')
    .eq('usage_type', usageType)
    .eq('usage_id', usageId)

  const mediaIds = (usages ?? []).map((u: { media_id: string }) => u.media_id)

  await supabase.from('media_usages')
    .delete()
    .eq('usage_type', usageType)
    .eq('usage_id', usageId)

  for (const mid of mediaIds) {
    await deleteIfOrphan(supabase, mid)
  }
}

/**
 * If media has no more usages, delete the file from Storage and remove the library row.
 */
export async function deleteIfOrphan(supabase: SupabaseClient, mediaId: string) {
  const { count } = await supabase.from('media_usages')
    .select('*', { count: 'exact', head: true })
    .eq('media_id', mediaId)

  if ((count ?? 0) > 0) return // still used somewhere

  // Get storage path before deleting library row
  const { data: media } = await supabase.from('media_library')
    .select('storage_path').eq('id', mediaId).single()

  if (media?.storage_path) {
    await supabase.storage.from(BUCKET).remove([media.storage_path])
  }

  await supabase.from('media_library').delete().eq('id', mediaId)
}

/**
 * Force delete a media file — removes from all source tables, Storage, and library.
 * Used when user deletes from the Media Library page directly.
 */
export async function deleteMediaForce(supabase: SupabaseClient, mediaId: string) {
  // Get all usages and clean references in source tables
  const { data: usages } = await supabase.from('media_usages')
    .select('usage_type, usage_id').eq('media_id', mediaId)

  for (const u of (usages ?? []) as { usage_type: string; usage_id: string }[]) {
    if (u.usage_type === 'scenario_message') {
      await supabase.from('scenario_messages').update({
        media_id: null, media_url: null, media_file_name: null, media_type: null,
      }).eq('id', u.usage_id)
    } else if (u.usage_type === 'followup') {
      await supabase.from('message_followups').update({
        media_id: null, media_url: null, media_file_name: null, media_type: null,
      }).eq('id', u.usage_id)
    }
    // TODO: handle 'landing', 'landing_block' types
  }

  // Get storage path
  const { data: media } = await supabase.from('media_library')
    .select('storage_path').eq('id', mediaId).single()

  // Delete from Storage
  if (media?.storage_path) {
    await supabase.storage.from(BUCKET).remove([media.storage_path])
  }

  // Delete from library (cascades to media_usages)
  await supabase.from('media_library').delete().eq('id', mediaId)
}

/**
 * List all media for a project with usage info.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listProjectMedia(supabase: SupabaseClient, projectId: string): Promise<any[]> {
  const { data: items } = await supabase.from('media_library')
    .select('*')
    .eq('project_id', projectId)
    .order('uploaded_at', { ascending: false })

  if (!items || items.length === 0) return []

  const mediaIds = items.map((i: { id: string }) => i.id)
  const { data: usages } = await supabase.from('media_usages')
    .select('*')
    .in('media_id', mediaIds)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usagesByMedia = new Map<string, any[]>()
  for (const u of (usages ?? []) as { media_id: string }[]) {
    if (!usagesByMedia.has(u.media_id)) usagesByMedia.set(u.media_id, [])
    usagesByMedia.get(u.media_id)!.push(u)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return items.map((item: any) => ({
    ...item,
    usages: usagesByMedia.get(item.id) ?? [],
  }))
}
