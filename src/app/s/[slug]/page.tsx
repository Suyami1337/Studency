import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://studency.vercel.app'

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

  // Visitor token из cookie (устанавливается при переходе через /go/[slug] из бота)
  const cookieStore = await cookies()
  const visitorToken = cookieStore.get('stud_vid')?.value ?? ''

  // Универсальный трекинг-скрипт.
  // Не требует никакой ручной разметки в HTML.
  // Автоматически трекает:
  //   • клики по ЛЮБЫМ кнопкам, ссылкам и элементам с role=button
  //   • отправку ЛЮБЫХ форм (name/phone/email/telegram по полю name/placeholder)
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
        <div dangerouslySetInnerHTML={{ __html: landing.html_content }} />
        <div dangerouslySetInnerHTML={{ __html: trackingScript }} />
      </body>
    </html>
  )
}
