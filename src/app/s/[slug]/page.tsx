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

  // Читаем visitor token из cookie (поставлен при переходе через /go/[slug])
  const cookieStore = await cookies()
  const visitorToken = cookieStore.get('stud_vid')?.value ?? ''

  // Инжектируемый трекинг-скрипт:
  // - Трекает клики по кнопкам с атрибутом data-stud-btn="BUTTON_ID"
  // - Обрабатывает формы с атрибутом data-stud-form
  const trackingScript = `
<script>
(function() {
  var SLUG = ${JSON.stringify(slug)};
  var VT   = ${JSON.stringify(visitorToken)};
  var BASE = ${JSON.stringify(BASE_URL)};

  // ── Трекинг кнопок ───────────────────────────────────────────
  document.addEventListener('click', function(e) {
    var el = e.target.closest('[data-stud-btn]');
    if (!el) return;
    var btnId = el.getAttribute('data-stud-btn');
    if (!btnId) return;
    fetch(BASE + '/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buttonId: btnId, landingSlug: SLUG, visitorToken: VT }),
      keepalive: true
    });
  });

  // ── Форма заявки ─────────────────────────────────────────────
  // Ищет form[data-stud-form] или обычные формы на странице
  document.addEventListener('submit', function(e) {
    var form = e.target.closest('[data-stud-form]') || e.target.closest('form[data-stud-lead]');
    if (!form) return;
    e.preventDefault();

    var data = {};
    var inputs = form.querySelectorAll('input, textarea, select');
    inputs.forEach(function(inp) {
      var name = inp.name || inp.getAttribute('data-field') || '';
      var val  = inp.value || '';
      if (!name || !val) return;
      var key = name.toLowerCase();
      if (key === 'name' || key === 'имя' || key === 'fullname') data.name = val;
      else if (key === 'phone' || key === 'tel' || key === 'телефон') data.phone = val;
      else if (key === 'email' || key === 'почта') data.email = val;
      else if (key === 'telegram' || key === 'tg') data.telegram = val;
      else { if (!data.extra) data.extra = {}; data.extra[name] = val; }
    });
    data.visitorToken = VT;

    // Показываем индикатор загрузки если есть [data-stud-submit]
    var btn = form.querySelector('[data-stud-submit]') || form.querySelector('[type=submit]');
    var origText = btn ? btn.textContent : '';
    if (btn) btn.disabled = true;
    if (btn) btn.textContent = '...';

    fetch(BASE + '/api/landing/' + SLUG + '/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    .then(function(r) { return r.json(); })
    .then(function() {
      // Показываем success-блок если есть [data-stud-success]
      var success = form.querySelector('[data-stud-success]') || document.querySelector('[data-stud-success]');
      if (success) {
        form.style.display = 'none';
        success.style.display = 'block';
      } else if (btn) {
        btn.textContent = 'Заявка отправлена!';
        btn.style.background = '#16a34a';
      }
    })
    .catch(function() {
      if (btn) { btn.disabled = false; btn.textContent = origText; }
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
