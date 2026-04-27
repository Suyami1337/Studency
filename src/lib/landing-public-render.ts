// Общий рендер публичного лендинга: используется и /s/[slug] (legacy),
// и /_pub/[kind]/[host]/[...path] (новый routing по subdomain/custom_domain).
//
// Принимает уже разрешённый landing (по slug + project) и возвращает Response
// с готовым HTML. Никакого React-runtime — отдаём text/html напрямую, чтобы
// шаблонные <script> работали без React mismatch error #418.

import type { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assembleLandingHtml, type LandingBlock } from '@/lib/landing-blocks'
import { replaceVideoShortcodes } from '@/lib/video-shortcodes'
import { mergeByVisitorToken } from '@/lib/customer-merge'

const VISITOR_COOKIE = 'stud_vid'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 год

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
      videoStates[videoId] = { sessionId: genSessionId(), iframeEl: iframes[i], started: false, completed: false, lastReported: 0, maxPos: 0, watchTime: 0, duration: 0, milestonesFired: {} };
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
  function checkVideoMilestone(videoId) {
    var s = videoStates[videoId]; if (!s || !s.duration) return;
    var pct = (s.maxPos / s.duration) * 100;
    var levels = [25, 50, 75];
    for (var i = 0; i < levels.length; i++) {
      var lvl = levels[i];
      if (pct >= lvl && !s.milestonesFired[lvl]) {
        s.milestonesFired[lvl] = true;
        videoTrack(videoId, 'milestone_' + lvl);
      }
    }
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
      checkVideoMilestone(matchedId);
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

  // Identity stitching: подмена Telegram-ссылок на ?start=vt_<VT>.
  // Если юзер кликает на ссылку t.me/<bot> — Telegram прокинет start-параметр
  // в первое сообщение боту, и webhook сольёт Гость-карточку с tg-карточкой.
  function patchTelegramLinks() {
    if (!VT) return;
    var anchors = document.querySelectorAll('a[href]');
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.getAttribute('href') || '';
      if (!/^https?:\\/\\/(t\\.me|telegram\\.me)\\//i.test(href)) continue;
      try {
        var u = new URL(href);
        if (u.searchParams.has('start')) continue;
        // Не трогаем ссылки на каналы (/<channel> без бота). Но безопасный путь —
        // приклеить start всегда: каналы игнорируют этот параметр.
        u.searchParams.set('start', 'vt_' + VT);
        a.setAttribute('href', u.toString());
      } catch (e) {}
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', patchTelegramLinks);
  else patchTelegramLinks();
  setTimeout(patchTelegramLinks, 1500);

  document.addEventListener('click', function(e) {
    var el = e.target.closest('button, [type=submit], [role=button], a[href]');
    if (!el) return;
    var label = getLabel(el);
    var isLink = el.tagName === 'A';
    var fallback = isLink ? '🔗 ссылка' : '▭ элемент';
    track({ buttonText: label || fallback, buttonHref: isLink ? (el.getAttribute('href') || '') : '', eventType: isLink ? 'link_click' : 'button_click' });
  }, true);

  // ── Page view: фиксируем заход на лендинг (отдельно от landing_visits, для timeline customer_actions)
  track({ buttonText: '', eventType: 'page_view' });

  // ── Скролл-milestones (как в Я.Метрика): сообщаем когда юзер доскроллил до 25/50/75/100
  var scrollFired = {};
  function checkScroll() {
    var doc = document.documentElement;
    var scrollTop = window.pageYOffset || doc.scrollTop;
    var pageHeight = doc.scrollHeight - doc.clientHeight;
    if (pageHeight <= 0) return;
    var pct = (scrollTop / pageHeight) * 100;
    var levels = [25, 50, 75, 100];
    for (var i = 0; i < levels.length; i++) {
      var lvl = levels[i];
      if (pct >= lvl - 1 && !scrollFired[lvl]) {
        scrollFired[lvl] = true;
        track({ buttonText: '', eventType: 'scroll_' + lvl });
      }
    }
  }
  var scrollTimer;
  window.addEventListener('scroll', function() {
    if (scrollTimer) return;
    scrollTimer = setTimeout(function() { scrollTimer = null; checkScroll(); }, 250);
  }, { passive: true });

  // ── Время на сайте (active time): засекаем только когда вкладка видна
  var pageStart = Date.now();
  var visibleSince = pageStart;
  var totalActiveMs = 0;
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      totalActiveMs += Date.now() - visibleSince;
    } else {
      visibleSince = Date.now();
    }
  });
  function sendDuration(reason) {
    var active = totalActiveMs + (document.hidden ? 0 : Date.now() - visibleSince);
    var total = Date.now() - pageStart;
    var payload = {
      landingSlug: SLUG, visitorToken: VT, projectId: PROJECT_ID,
      buttonText: '', eventType: 'page_view_end',
      buttonHref: '',
      duration_active_seconds: Math.round(active / 1000),
      duration_total_seconds: Math.round(total / 1000),
      reason: reason || 'unload',
    };
    var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(BASE + '/api/track', blob);
    } else {
      fetch(BASE + '/api/track', { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(function() {});
    }
  }
  // pagehide / beforeunload — поймать момент закрытия вкладки
  // sendBeacon переживает закрытие вкладки в 99% случаев. Без heartbeat'ов
  // чтобы не плодить customer_actions каждые 30 секунд для активного юзера.
  window.addEventListener('pagehide', function() { sendDuration('pagehide'); });

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

/**
 * Гарантирует наличие visitor_token и customer-карточки для текущего посетителя.
 *
 * Источники привязки (по приоритету):
 *  1. URL `?_sc=<customerId>` — пришёл из бота через /btn-редирект, customer уже известен.
 *     Синхронизируем cookie с visitor_token этого customer'а (или наоборот).
 *  2. cookie stud_vid + поиск customer.visitor_token — возвратный визит.
 *  3. Иначе создаём нового customer типа Гость с visitor_token = cookie.
 *
 * Возвращает customerId, актуальный visitorToken, и флаг — нужно ли установить
 * cookie в Set-Cookie (true когда токен только что выдан или поменялся).
 */
/** Парсит UTM-параметры и referer для атрибуции. */
function extractFirstTouch(request: NextRequest, landing: PublicLanding): {
  first_touch_at: string
  first_touch_kind: 'landing'
  first_touch_landing_id: string
  first_touch_url: string
  first_touch_referrer: string | null
  first_touch_utm: Record<string, string> | null
  first_touch_source: string | null
} {
  const url = new URL(request.url)
  const utm: Record<string, string> = {}
  const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']
  for (const k of utmKeys) {
    const v = url.searchParams.get(k)
    if (v) utm[k] = v
  }
  // Наш собственный ?src=<slug> — поддержка трекинговых ссылок
  const ourSrc = url.searchParams.get('src')
  if (ourSrc) utm.src = ourSrc

  const referrer = request.headers.get('referer') || null
  // first_touch_source: utm_source > наш src > referrer host > 'direct'
  let source: string | null = utm.utm_source || utm.src || null
  if (!source && referrer) {
    try {
      const refHost = new URL(referrer).hostname
      // Если referrer — наш же лендинг, считаем direct
      if (refHost && refHost !== url.hostname) source = refHost
    } catch { /* ignore */ }
  }
  if (!source) source = 'direct'

  return {
    first_touch_at: new Date().toISOString(),
    first_touch_kind: 'landing',
    first_touch_landing_id: landing.id,
    first_touch_url: url.toString(),
    first_touch_referrer: referrer,
    first_touch_utm: Object.keys(utm).length > 0 ? utm : null,
    first_touch_source: source,
  }
}

async function ensureVisitorCustomer(
  supabase: SupabaseClient,
  request: NextRequest | undefined,
  landing: PublicLanding,
): Promise<{ customerId: string | null; visitorToken: string; setCookie: boolean }> {
  if (!request) {
    return { customerId: null, visitorToken: '', setCookie: false }
  }
  const url = new URL(request.url)
  const customerIdFromUrl = url.searchParams.get('_sc')
  let visitorToken = request.cookies.get(VISITOR_COOKIE)?.value ?? ''
  let customerId: string | null = null
  let setCookie = false

  // 1. URL ?_sc=<id> приоритетнее — пришли из бот-кнопки
  if (customerIdFromUrl) {
    const { data: c } = await supabase
      .from('customers')
      .select('id, visitor_token')
      .eq('id', customerIdFromUrl)
      .eq('project_id', landing.project_id)
      .maybeSingle()
    if (c) {
      customerId = c.id as string
      const customerVT = (c as { visitor_token: string | null }).visitor_token

      // Identity stitching: если cookie указывает на Гостя в этом же проекте
      // (а target — telegram-карточка), сливаем Гостя в target.
      if (visitorToken) {
        await mergeByVisitorToken(supabase, visitorToken, landing.project_id, customerId)
      }

      if (customerVT && customerVT !== visitorToken) {
        // Customer уже имеет VT — используем его (склеиваем с cookie)
        visitorToken = customerVT
        setCookie = true
      } else if (!customerVT) {
        // Customer без VT — назначим cookie или новый UUID
        if (!visitorToken) { visitorToken = randomUUID(); setCookie = true }
        await supabase.from('customers').update({ visitor_token: visitorToken }).eq('id', customerId)
      }
    }
  }

  // 2. По cookie ищем существующего customer'а
  if (!customerId && visitorToken) {
    const { data: c } = await supabase
      .from('customers')
      .select('id')
      .eq('visitor_token', visitorToken)
      .eq('project_id', landing.project_id)
      .limit(1)
      .maybeSingle()
    if (c) customerId = c.id as string
  }

  // 3. Cookie не было — генерируем
  if (!visitorToken) {
    visitorToken = randomUUID()
    setCookie = true
  }

  // 4. Customer не определён — создаём гостя c first_touch
  if (!customerId) {
    const ft = extractFirstTouch(request, landing)
    const { data: c } = await supabase
      .from('customers')
      .insert({
        project_id: landing.project_id,
        visitor_token: visitorToken,
        is_blocked: false,
        ...ft,
      })
      .select('id')
      .single()
    if (c) customerId = c.id as string
  } else {
    // Customer уже был — если у него нет first_touch_at, проставим (миграция
    // старых карточек, или гость зашёл с лендинга после прямого /start бота)
    const { data: existing } = await supabase
      .from('customers')
      .select('first_touch_at')
      .eq('id', customerId)
      .maybeSingle()
    if (existing && !(existing as { first_touch_at: string | null }).first_touch_at) {
      const ft = extractFirstTouch(request, landing)
      await supabase.from('customers').update(ft).eq('id', customerId)
    }
  }

  return { customerId, visitorToken, setCookie }
}

function setCookieHeader(value: string, secure: boolean): string {
  const parts = [
    `${VISITOR_COOKIE}=${value}`,
    `Max-Age=${COOKIE_MAX_AGE}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

function clientIp(request: NextRequest | undefined): string {
  if (!request) return 'unknown'
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
  )
}

/** Главная функция: принимает уже разрешённый landing → возвращает Response с HTML. */
export async function renderLandingResponse(
  landing: PublicLanding,
  supabase: SupabaseClient,
  baseUrl: string,
  request?: NextRequest,
): Promise<Response> {
  const { customerId, visitorToken, setCookie } = await ensureVisitorCustomer(supabase, request, landing)
  const title = landing.meta_title || landing.name || 'Лендинг'
  const description = landing.meta_description || ''
  const isMiniApp = Boolean(landing.is_mini_app)

  // Fire-and-forget: записываем визит сайта (попадёт в timeline как landing_view через VIEW)
  if (request) {
    const ip = clientIp(request)
    const ua = request.headers.get('user-agent')
    const ref = request.headers.get('referer')
    void supabase
      .from('landing_visits')
      .insert({
        landing_id: landing.id,
        customer_id: customerId,
        visitor_id: visitorToken || null,
        ip_address: ip,
        user_agent: ua,
        referrer: ref,
      })
      .then(({ error }) => { if (error) console.warn('[landing] visit insert error:', error.message) })
  }

  const trackingScript = buildTrackingScript({
    slug: landing.slug, visitorToken, baseUrl, isMiniApp, projectId: landing.project_id,
  })
  const extraHead = isMiniApp ? `<script src="https://telegram.org/js/telegram-web-app.js" async></script>` : ''

  const baseHeaders: Record<string, string> = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  }
  if (setCookie && visitorToken) {
    baseHeaders['Set-Cookie'] = setCookieHeader(visitorToken, process.env.NODE_ENV === 'production')
  }

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
    return new Response(doc, { status: 200, headers: baseHeaders })
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
  return new Response(doc, { status: 200, headers: baseHeaders })
}
