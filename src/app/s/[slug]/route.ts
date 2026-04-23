// Публичный лендинг — отдаём СЫРОЙ HTML через Route Handler, без React-гидрации.
//
// Почему так: раньше страница была Server Component с <html><body>
// dangerouslySetInnerHTML=... React оборачивал это в runtime и пытался гидрировать.
// Любой <script> внутри HTML лендинга (таймер VSL, кастомный JS) менял DOM сразу
// при parse → React видел mismatch → Minified React error #418. Плюс если шаблон
// содержал свой <!DOCTYPE><html><head>, получалась вложенность html-в-html.
//
// Решение: Route Handler возвращает text/html Response. Браузер парсит как обычную
// страницу, все скрипты работают нативно, никакого React-runtime на клиенте не
// подгружается.
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://studency.vercel.app'

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]!))
}

async function replaceVideoShortcodes(
  html: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<string> {
  const pattern = /\{\{\s*video\s*:\s*([a-f0-9-]{36})\s*\}\}/gi
  const uuids = new Set<string>()
  let m
  while ((m = pattern.exec(html)) !== null) {
    uuids.add(m[1])
  }
  if (uuids.size === 0) return html

  const { data: videos } = await supabase
    .from('videos')
    .select('id, kinescope_id, embed_url, title')
    .in('id', Array.from(uuids))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map = new Map<string, any>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const v of (videos ?? []) as any[]) map.set(v.id, v)

  return html.replace(pattern, (_, uuid) => {
    const video = map.get(uuid)
    if (!video || !video.kinescope_id) {
      return `<div style="padding:20px;background:#f3f4f6;border:2px dashed #d1d5db;border-radius:8px;text-align:center;color:#6b7280;font-family:sans-serif;font-size:14px;">Видео не найдено</div>`
    }
    const src = video.embed_url || `https://kinescope.io/embed/${video.kinescope_id}`
    return `<div class="stud-video-wrap" style="position:relative;width:100%;max-width:960px;margin:20px auto;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000;">
<iframe
  data-studency-video-id="${video.id}"
  src="${src}"
  style="width:100%;height:100%;border:0;"
  allow="autoplay; fullscreen; picture-in-picture; encrypted-media;"
  title="${(video.title || '').replace(/"/g, '&quot;')}"
></iframe>
</div>`
  })
}

/**
 * Разбирает HTML шаблона на head/body части. Шаблоны могут быть как полным
 * документом (<!DOCTYPE...><html>...), так и фрагментом — работает и там и там.
 * Из headInner удаляется <title> (мы ставим свой на основе meta_title).
 */
function extractHtmlParts(html: string): { headInner: string; bodyInner: string; bodyAttrs: string } {
  const headMatch = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html)
  const bodyMatch = /<body([^>]*)>([\s\S]*?)<\/body>/i.exec(html)
  const headInner = headMatch
    ? headMatch[1].replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')
    : ''
  const bodyInner = bodyMatch ? bodyMatch[2] : html
  const bodyAttrs = bodyMatch ? (bodyMatch[1] ?? '') : ''
  return { headInner, bodyInner, bodyAttrs }
}

function buildTrackingScript(opts: {
  slug: string
  visitorToken: string
  baseUrl: string
  isMiniApp: boolean
  projectId: string
}): string {
  const { slug, visitorToken, baseUrl, isMiniApp, projectId } = opts
  return `<script>
(function() {
  var SLUG = ${JSON.stringify(slug)};
  var VT   = ${JSON.stringify(visitorToken)};
  var BASE = ${JSON.stringify(baseUrl)};
  var IS_MINI_APP = ${isMiniApp ? 'true' : 'false'};
  var PROJECT_ID = ${JSON.stringify(projectId)};

  try {
    if (IS_MINI_APP && window.Telegram && window.Telegram.WebApp) {
      var wa = window.Telegram.WebApp;
      wa.ready();
      wa.expand();
      var initData = wa.initData || '';
      if (initData) {
        fetch(BASE + '/api/landing/' + SLUG + '/mini-app-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData: initData, visitorToken: VT, projectId: PROJECT_ID }),
          keepalive: true
        }).catch(function() {});
      }
    }
  } catch (e) { /* ignore */ }

  function getLabel(el) {
    var t = (el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || el.title || '').trim();
    return t.replace(/\\s+/g, ' ').slice(0, 80);
  }

  function track(payload) {
    fetch(BASE + '/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ landingSlug: SLUG, visitorToken: VT }, payload)),
      keepalive: true
    }).catch(function() {});
  }

  var videoStates = {};

  function genSessionId() {
    return 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function initVideoTracking() {
    var iframes = document.querySelectorAll('iframe[data-studency-video-id]');
    for (var i = 0; i < iframes.length; i++) {
      var videoId = iframes[i].getAttribute('data-studency-video-id');
      if (!videoId || videoStates[videoId]) continue;
      videoStates[videoId] = {
        sessionId: genSessionId(),
        iframeEl: iframes[i],
        started: false,
        completed: false,
        lastReported: 0,
        maxPos: 0,
        watchTime: 0,
        duration: 0,
      };
    }
  }

  function videoTrack(videoId, event) {
    var s = videoStates[videoId];
    if (!s) return;
    var body = {
      video_id: videoId,
      session_id: s.sessionId,
      visitor_token: VT,
      watch_time_seconds: Math.round(s.watchTime),
      max_position_seconds: Math.round(s.maxPos),
      completed: s.completed,
      event: event,
    };
    fetch(BASE + '/api/videos/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true
    }).catch(function() {});
  }

  window.addEventListener('message', function(e) {
    if (!e.origin || e.origin.indexOf('kinescope.io') === -1) return;
    var data = e.data || {};
    var eventType = (data.event || data.type || '').toString().replace(/^kinescope[:.]/, '');
    var payload = data.data || data;

    var ids = Object.keys(videoStates);
    var matchedId = null;
    for (var i = 0; i < ids.length; i++) {
      if (videoStates[ids[i]].iframeEl.contentWindow === e.source) {
        matchedId = ids[i];
        break;
      }
    }
    if (!matchedId && ids.length === 1) matchedId = ids[0];
    if (!matchedId) return;

    var s = videoStates[matchedId];

    if (eventType === 'ready' || eventType === 'play') {
      if (!s.started) {
        s.started = true;
        videoTrack(matchedId, 'start');
      }
    } else if (eventType === 'timeupdate') {
      var current = Number(payload.currentTime || 0);
      var duration = Number(payload.duration || s.duration || 0);
      if (duration > 0) s.duration = duration;
      if (current > s.maxPos) s.maxPos = current;
      s.watchTime = Math.max(s.watchTime, current);

      if (duration > 0 && current / duration >= 0.9 && !s.completed) {
        s.completed = true;
        videoTrack(matchedId, 'complete');
      }

      var now = Date.now();
      if (now - s.lastReported > 10000) {
        s.lastReported = now;
        videoTrack(matchedId, 'progress');
      }
    } else if (eventType === 'ended') {
      s.completed = true;
      if (s.duration > 0) { s.watchTime = s.duration; s.maxPos = s.duration; }
      videoTrack(matchedId, 'complete');
    }
  });

  window.addEventListener('pagehide', function() {
    Object.keys(videoStates).forEach(function(id) {
      var s = videoStates[id];
      if (s.started && !s.completed) videoTrack(id, 'progress');
    });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVideoTracking);
  } else {
    initVideoTracking();
  }
  setTimeout(initVideoTracking, 500);
  setTimeout(initVideoTracking, 2000);

  document.addEventListener('click', function(e) {
    var el = e.target.closest('button, [type=submit], [role=button], a[href]');
    if (!el) return;

    var label = getLabel(el);
    if (!label) return;

    var isLink = el.tagName === 'A';
    track({
      buttonText: label,
      buttonHref: isLink ? (el.getAttribute('href') || '') : '',
      eventType: isLink ? 'link_click' : 'button_click',
    });
  }, true);

  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;

    var action = form.getAttribute('action') || '';
    if (action && !action.startsWith('/') && !action.startsWith(BASE) && action !== '#') return;

    e.preventDefault();

    var data = { visitorToken: VT };
    var inputs = form.querySelectorAll('input, textarea, select');
    inputs.forEach(function(inp) {
      var fieldName = (inp.name || inp.getAttribute('data-field') || inp.placeholder || '').toLowerCase();
      var val = inp.value ? inp.value.trim() : '';
      if (!fieldName || !val) return;
      if (/^(name|имя|fullname|full_name|ваше имя)$/.test(fieldName)) data.name = val;
      else if (/^(phone|tel|телефон|номер|mobile)$/.test(fieldName)) data.phone = val;
      else if (/^(email|почта|e-mail)$/.test(fieldName)) data.email = val;
      else if (/^(telegram|tg|телеграм)$/.test(fieldName)) data.telegram = val;
      else { if (!data.extra) data.extra = {}; data.extra[fieldName] = val; }
    });

    var submitBtn = form.querySelector('[type=submit]');
    var origText = submitBtn ? (submitBtn.innerText || submitBtn.value) : '';
    if (submitBtn) { submitBtn.disabled = true; if (submitBtn.innerText !== undefined) submitBtn.innerText = '...'; }

    fetch(BASE + '/api/landing/' + SLUG + '/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    .then(function(r) { return r.json(); })
    .then(function() {
      var successEl = form.querySelector('.stud-success, [data-stud-success]')
        || document.querySelector('.stud-success, [data-stud-success], .thank-you, .success-message');
      if (successEl) {
        form.style.display = 'none';
        successEl.style.display = 'block';
      } else if (submitBtn) {
        if (submitBtn.innerText !== undefined) submitBtn.innerText = '✓ Заявка отправлена';
        submitBtn.style.background = '#16a34a';
        submitBtn.style.color = '#fff';
      }
    })
    .catch(function() {
      if (submitBtn) {
        submitBtn.disabled = false;
        if (submitBtn.innerText !== undefined) submitBtn.innerText = origText;
      }
    });
  });

})();
</script>`
}

function notFoundResponse(): Response {
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Страница не найдена</title>
<style>body{font-family:system-ui,sans-serif;background:#f9fafb;color:#111827;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem}.c{text-align:center;max-width:400px}.c h1{font-size:4rem;margin:0;color:#6A55F8}.c p{color:#6b7280}</style>
</head>
<body>
<div class="c">
  <h1>404</h1>
  <p>Такого лендинга нет или он снят с публикации</p>
</div>
</body>
</html>`
  return new Response(html, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: landing } = await supabase
    .from('landings')
    .select('id, html_content, status, name, meta_title, meta_description, is_mini_app, project_id')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (!landing || !landing.html_content) {
    return notFoundResponse()
  }

  const htmlContent = await replaceVideoShortcodes(landing.html_content, supabase)
  const { headInner, bodyInner, bodyAttrs } = extractHtmlParts(htmlContent)

  const cookieStore = await cookies()
  const visitorToken = cookieStore.get('stud_vid')?.value ?? ''

  const title = landing.meta_title || landing.name || 'Лендинг'
  const description = landing.meta_description || ''
  const isMiniApp = Boolean(landing.is_mini_app)

  const trackingScript = buildTrackingScript({
    slug,
    visitorToken,
    baseUrl: BASE_URL,
    isMiniApp,
    projectId: landing.project_id,
  })

  const doc = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
${description ? `<meta name="description" content="${escapeHtml(description)}">` : ''}
${isMiniApp ? `<script src="https://telegram.org/js/telegram-web-app.js" async></script>` : ''}
${headInner}
</head>
<body${bodyAttrs}>
${bodyInner}
${trackingScript}
</body>
</html>`

  return new Response(doc, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
