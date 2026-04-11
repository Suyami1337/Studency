import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://studency.vercel.app'

/**
 * Заменяет шорткоды {{video:UUID}} в HTML на реальные iframe-плееры Kinescope.
 * Делает lookup в БД по UUID → получает kinescope_id и embed_url → строит iframe.
 * Каждый iframe получает data-studency-video-id для клиентского трекинга.
 */
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

  // Батч-запрос всех видео
  const { data: videos } = await supabase
    .from('videos')
    .select('id, kinescope_id, embed_url, title')
    .in('id', Array.from(uuids))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map = new Map<string, any>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const v of (videos ?? []) as any[]) map.set(v.id, v)

  return html.replace(pattern, (match, uuid) => {
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
  allowfullscreen
  title="${(video.title || '').replace(/"/g, '&quot;')}"
></iframe>
</div>`
  })
}

export default async function LandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: landing } = await supabase
    .from('landings')
    .select('id, html_content, status, name, meta_title, meta_description')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (!landing || !landing.html_content) {
    notFound()
  }

  // Подставляем видео по шорткодам {{video:UUID}}
  const htmlContent = await replaceVideoShortcodes(landing.html_content, supabase)

  // Visitor token из cookie (устанавливается при переходе через /go/[slug] из бота)
  const cookieStore = await cookies()
  const visitorToken = cookieStore.get('stud_vid')?.value ?? ''

  // Универсальный трекинг-скрипт.
  // Не требует никакой ручной разметки в HTML.
  // Автоматически трекает:
  //   • клики по ЛЮБЫМ кнопкам, ссылкам и элементам с role=button
  //   • отправку ЛЮБЫХ форм (name/phone/email/telegram по полю name/placeholder)
  //   • просмотры ВСЕХ Kinescope iframe с data-studency-video-id
  const trackingScript = `
<script>
(function() {
  var SLUG = ${JSON.stringify(slug)};
  var VT   = ${JSON.stringify(visitorToken)};
  var BASE = ${JSON.stringify(BASE_URL)};

  // Утилита: получить читаемый текст элемента
  function getLabel(el) {
    var t = (el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || el.title || '').trim();
    // Обрезаем до 80 символов, убираем переносы
    return t.replace(/\\s+/g, ' ').slice(0, 80);
  }

  // Утилита: отправить событие (fire-and-forget)
  function track(payload) {
    fetch(BASE + '/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ landingSlug: SLUG, visitorToken: VT }, payload)),
      keepalive: true
    }).catch(function() {});
  }

  // ── Видео-трекинг ────────────────────────────────────────────
  // Для каждого iframe с data-studency-video-id слушаем postMessage от Kinescope
  // и шлём в /api/videos/track с visitor_token.
  var videoStates = {}; // videoId → { sessionId, started, completed, lastReported, maxPos, watchTime, duration, iframeEl }

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

  // Слушаем postMessage от Kinescope iframes
  window.addEventListener('message', function(e) {
    if (!e.origin || e.origin.indexOf('kinescope.io') === -1) return;
    var data = e.data || {};
    var eventType = (data.event || data.type || '').toString().replace(/^kinescope[:.]/, '');
    var payload = data.data || data;

    // Находим какому iframe принадлежит событие (по source)
    var ids = Object.keys(videoStates);
    var matchedId = null;
    for (var i = 0; i < ids.length; i++) {
      if (videoStates[ids[i]].iframeEl.contentWindow === e.source) {
        matchedId = ids[i];
        break;
      }
    }
    // Fallback: если не нашли по source — берём первый не-completed
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

  // На выгрузке — финальный репорт для всех смотренных видео
  window.addEventListener('pagehide', function() {
    Object.keys(videoStates).forEach(function(id) {
      var s = videoStates[id];
      if (s.started && !s.completed) videoTrack(id, 'progress');
    });
  });

  // Инициализация после DOM ready + повтор через 500ms на случай ленивой загрузки
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVideoTracking);
  } else {
    initVideoTracking();
  }
  setTimeout(initVideoTracking, 500);
  setTimeout(initVideoTracking, 2000);

  // ── 1. Авто-трекинг ВСЕХ кнопок и ссылок ─────────────────────
  document.addEventListener('click', function(e) {
    var el = e.target.closest('button, [type=submit], [role=button], a[href]');
    if (!el) return;

    var label = getLabel(el);
    if (!label) return; // пустые кнопки не трекаем

    var isLink = el.tagName === 'A';
    track({
      buttonText: label,
      buttonHref: isLink ? (el.getAttribute('href') || '') : '',
      eventType: isLink ? 'link_click' : 'button_click',
    });
  }, true); // capture=true: ловим до обработчиков страницы

  // ── 2. Авто-обработка форм ────────────────────────────────────
  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;

    // Не перехватываем формы, у которых есть свой action на другой домен
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

    // UX: блокируем кнопку отправки
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
      // Ищем блок с классом success / thank-you / stud-success
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
</script>
`

  const title = landing.meta_title || landing.name
  const description = landing.meta_description || ''

  return (
    <html>
      <head>
        <title>{title}</title>
        {description && <meta name="description" content={description} />}
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body>
        <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
        <div dangerouslySetInnerHTML={{ __html: trackingScript }} />
      </body>
    </html>
  )
}
