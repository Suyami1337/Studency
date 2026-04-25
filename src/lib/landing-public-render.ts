// Общий рендер публичного лендинга: используется и /s/[slug] (legacy),
// и /_pub/[kind]/[host]/[...path] (новый routing по subdomain/custom_domain).
//
// Принимает уже разрешённый landing (по slug + project) и возвращает Response
// с готовым HTML. Никакого React-runtime — отдаём text/html напрямую, чтобы
// шаблонные <script> работали без React mismatch error #418.

import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assembleLandingHtml, type LandingBlock } from '@/lib/landing-blocks'
import { replaceVideoShortcodes } from '@/lib/video-shortcodes'

export type PublicLanding = {
  id: string
  slug: string
  status: string | null
  name: string | null
  meta_title: string | null
  meta_description: string | null
  is_mini_app: boolean | null
  project_id: string
  is_blocks_based: boolean | null
  html_content: string | null
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]!))
}

function extractHtmlParts(html: string): { headInner: string; bodyInner: string; bodyAttrs: string } {
  const headMatch = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html)
  const bodyMatch = /<body([^>]*)>([\s\S]*?)<\/body>/i.exec(html)
  const headInner = headMatch ? headMatch[1].replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '') : ''
  const bodyInner = bodyMatch ? bodyMatch[2] : html
  const bodyAttrs = bodyMatch ? (bodyMatch[1] ?? '') : ''
  return { headInner, bodyInner, bodyAttrs }
}

export function notFoundResponse(): Response {
  const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>404 — не найдено</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#f5f5f7;color:#1a1a2e;margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}.c{padding:40px 20px}h1{font-size:64px;margin:0 0 8px;color:#6A55F8}p{color:#666;font-size:16px}</style></head><body><div class="c"><h1>404</h1><p>Такого лендинга нет или он снят с публикации</p></div></body></html>`
  return new Response(html, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
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
      wa.ready(); wa.expand();
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
  } catch (e) {}

  function getLabel(el) {
    var t = (el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || el.title || '').trim();
    return t.replace(/\\s+/g, ' ').slice(0, 80);
  }
  function track(payload) {
    fetch(BASE + '/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ landingSlug: SLUG, visitorToken: VT, projectId: PROJECT_ID }, payload)),
      keepalive: true
    }).catch(function() {});
  }

  var videoStates = {};
  function genSessionId() { return 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }
  function initVideoTracking() {
    var iframes = document.querySelectorAll('iframe[data-studency-video-id]');
    for (var i = 0; i < iframes.length; i++) {
      var videoId = iframes[i].getAttribute('data-studency-video-id');
      if (!videoId || videoStates[videoId]) continue;
      videoStates[videoId] = { sessionId: genSessionId(), iframeEl: iframes[i], started: false, completed: false, lastReported: 0, maxPos: 0, watchTime: 0, duration: 0 };
    }
  }
  function videoTrack(videoId, event) {
    var s = videoStates[videoId]; if (!s) return;
    fetch(BASE + '/api/videos/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_id: videoId, session_id: s.sessionId, visitor_token: VT, watch_time_seconds: Math.round(s.watchTime), max_position_seconds: Math.round(s.maxPos), completed: s.completed, event: event }),
      keepalive: true
    }).catch(function() {});
  }
  window.addEventListener('message', function(e) {
    if (!e.origin || e.origin.indexOf('kinescope.io') === -1) return;
    var data = e.data || {};
    var eventType = (data.event || data.type || '').toString().replace(/^kinescope[:.]/, '');
    var payload = data.data || data;
    var ids = Object.keys(videoStates), matchedId = null;
    for (var i = 0; i < ids.length; i++) { if (videoStates[ids[i]].iframeEl.contentWindow === e.source) { matchedId = ids[i]; break; } }
    if (!matchedId && ids.length === 1) matchedId = ids[0];
    if (!matchedId) return;
    var s = videoStates[matchedId];
    if (eventType === 'ready' || eventType === 'play') {
      if (!s.started) { s.started = true; videoTrack(matchedId, 'start'); }
    } else if (eventType === 'timeupdate') {
      var current = Number(payload.currentTime || 0);
      var duration = Number(payload.duration || s.duration || 0);
      if (duration > 0) s.duration = duration;
      if (current > s.maxPos) s.maxPos = current;
      s.watchTime = Math.max(s.watchTime, current);
      if (duration > 0 && current / duration >= 0.9 && !s.completed) { s.completed = true; videoTrack(matchedId, 'complete'); }
      var now = Date.now();
      if (now - s.lastReported > 10000) { s.lastReported = now; videoTrack(matchedId, 'progress'); }
    } else if (eventType === 'ended') {
      s.completed = true;
      if (s.duration > 0) { s.watchTime = s.duration; s.maxPos = s.duration; }
      videoTrack(matchedId, 'complete');
    }
  });
  window.addEventListener('pagehide', function() {
    Object.keys(videoStates).forEach(function(id) { var s = videoStates[id]; if (s.started && !s.completed) videoTrack(id, 'progress'); });
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initVideoTracking);
  else initVideoTracking();
  setTimeout(initVideoTracking, 500); setTimeout(initVideoTracking, 2000);

  document.addEventListener('click', function(e) {
    var el = e.target.closest('button, [type=submit], [role=button], a[href]');
    if (!el) return;
    var label = getLabel(el); if (!label) return;
    var isLink = el.tagName === 'A';
    track({ buttonText: label, buttonHref: isLink ? (el.getAttribute('href') || '') : '', eventType: isLink ? 'link_click' : 'button_click' });
  }, true);

  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    var action = form.getAttribute('action') || '';
    if (action && !action.startsWith('/') && !action.startsWith(BASE) && action !== '#') return;
    e.preventDefault();
    var data = { visitorToken: VT, projectId: PROJECT_ID };
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
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    }).then(function(r) { return r.json(); }).then(function() {
      var successEl = form.querySelector('.stud-success, [data-stud-success]') || document.querySelector('.stud-success, [data-stud-success], .thank-you, .success-message');
      if (successEl) { form.style.display = 'none'; successEl.style.display = 'block'; }
      else if (submitBtn) { if (submitBtn.innerText !== undefined) submitBtn.innerText = '✓ Заявка отправлена'; submitBtn.style.background = '#16a34a'; submitBtn.style.color = '#fff'; }
    }).catch(function() { if (submitBtn) { submitBtn.disabled = false; if (submitBtn.innerText !== undefined) submitBtn.innerText = origText; } });
  });
})();
</script>`
}

/** Главная функция: принимает уже разрешённый landing → возвращает Response с HTML. */
export async function renderLandingResponse(
  landing: PublicLanding,
  supabase: SupabaseClient,
  baseUrl: string,
): Promise<Response> {
  const cookieStore = await cookies()
  const visitorToken = cookieStore.get('stud_vid')?.value ?? ''
  const title = landing.meta_title || landing.name || 'Лендинг'
  const description = landing.meta_description || ''
  const isMiniApp = Boolean(landing.is_mini_app)

  const trackingScript = buildTrackingScript({
    slug: landing.slug, visitorToken, baseUrl, isMiniApp, projectId: landing.project_id,
  })
  const extraHead = isMiniApp ? `<script src="https://telegram.org/js/telegram-web-app.js" async></script>` : ''

  if (landing.is_blocks_based) {
    const { data: blocks } = await supabase
      .from('landing_blocks')
      .select('*')
      .eq('landing_id', landing.id)
      .eq('is_hidden', false)
      .order('order_position', { ascending: true })
    const blockList = (blocks ?? []) as LandingBlock[]
    let doc = assembleLandingHtml(blockList, { title, metaDescription: description, extraHead, extraBodyEnd: trackingScript })
    doc = await replaceVideoShortcodes(doc, supabase)
    return new Response(doc, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
  }

  if (!landing.html_content) return notFoundResponse()
  const htmlContent = await replaceVideoShortcodes(landing.html_content, supabase)
  const { headInner, bodyInner, bodyAttrs } = extractHtmlParts(htmlContent)
  const doc = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
${description ? `<meta name="description" content="${escapeHtml(description)}">` : ''}
${extraHead}
${headInner}
</head>
<body${bodyAttrs}>
${bodyInner}
${trackingScript}
</body>
</html>`
  return new Response(doc, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}
