// Шорткоды видео {{video:UUID}} ↔ iframe Kinescope.
//
// В БД храним шорткод (URL независимый). При рендере (публичная страница
// /s/[slug] и preview-iframe в редакторе) заменяем на iframe-плеер.
// При сохранении из редактора — обратная замена, чтобы не записать в БД
// готовый iframe-HTML и сохранить возможность менять видео через Settings.

import type { SupabaseClient } from '@supabase/supabase-js'

const SHORTCODE_RE = /\{\{\s*video\s*:\s*([a-f0-9-]{36})\s*\}\}/gi
// Iframe со специальным data-атрибутом — наш маркер для обратной замены
const IFRAME_RE = /<div\s+class="stud-video-wrap"[^>]*>\s*<iframe[^>]*data-studency-video-id="([a-f0-9-]{36})"[^>]*><\/iframe>\s*<\/div>/gi

export async function replaceVideoShortcodes(
  html: string,
  supabase: SupabaseClient,
): Promise<string> {
  if (!html) return html
  const uuids = new Set<string>()
  let m: RegExpExecArray | null
  // Сбрасываем lastIndex — global regex переиспользуется
  SHORTCODE_RE.lastIndex = 0
  while ((m = SHORTCODE_RE.exec(html)) !== null) uuids.add(m[1])
  if (uuids.size === 0) return html

  const { data: videos } = await supabase
    .from('videos')
    .select('id, kinescope_id, embed_url, title')
    .in('id', Array.from(uuids))

  const map = new Map<string, { id: string; kinescope_id: string | null; embed_url: string | null; title: string | null }>()
  for (const v of (videos ?? [])) map.set(v.id, v)

  SHORTCODE_RE.lastIndex = 0
  return html.replace(SHORTCODE_RE, (_, uuid: string) => {
    const video = map.get(uuid)
    if (!video || !video.kinescope_id) {
      return `<div class="stud-video-missing" data-studency-video-id="${uuid}" style="padding:20px;background:#f3f4f6;border:2px dashed #d1d5db;border-radius:8px;text-align:center;color:#6b7280;font-family:sans-serif;font-size:14px;">Видео не найдено</div>`
    }
    const src = video.embed_url || `https://kinescope.io/embed/${video.kinescope_id}`
    const title = (video.title || '').replace(/"/g, '&quot;')
    return `<div class="stud-video-wrap" style="position:relative;width:100%;max-width:960px;margin:20px auto;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000;"><iframe data-studency-video-id="${video.id}" src="${src}" style="width:100%;height:100%;border:0;" allow="autoplay; fullscreen; picture-in-picture; encrypted-media;" title="${title}"></iframe></div>`
  })
}

/** Обратная замена: iframe с data-studency-video-id → шорткод. */
export function restoreVideoShortcodes(html: string): string {
  if (!html) return html
  // Полная iframe-обёртка с маркером
  let out = html.replace(IFRAME_RE, (_, uuid: string) => `{{video:${uuid}}}`)
  // На случай если разметка была сломана и пользователь оставил только iframe без обёртки
  out = out.replace(/<iframe[^>]*data-studency-video-id="([a-f0-9-]{36})"[^>]*><\/iframe>/gi, (_, uuid: string) => `{{video:${uuid}}}`)
  // Также «видео не найдено» плашка
  out = out.replace(/<div\s+class="stud-video-missing"[^>]*data-studency-video-id="([a-f0-9-]{36})"[^>]*>[\s\S]*?<\/div>/gi, (_, uuid: string) => `{{video:${uuid}}}`)
  return out
}
