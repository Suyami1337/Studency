// Шаблон лендинга для селектора при создании сайта.
// Тяжёлые шаблоны (с inline base64 или внешними assets) кладём в public/templates/
// и указываем htmlPath — fetch'нём при создании. Лёгкие держим inline в html.
export type LandingTemplate = {
  id: string
  name: string
  description: string
  icon: string
  html?: string
  htmlPath?: string
}

export const landingTemplates: LandingTemplate[] = [
  {
    id: 'infobiz',
    name: 'Онлайн-курс',
    description: 'Инфобизнес, наставничество, обучение',
    icon: '🎓',
    html: `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#1a1a2e;background:#fff}
.hero{background:linear-gradient(135deg,#6A55F8 0%,#8B7BFA 100%);color:#fff;padding:80px 20px;text-align:center}
.hero h1{font-size:42px;font-weight:800;max-width:700px;margin:0 auto 20px;line-height:1.2}
.hero p{font-size:18px;opacity:.85;max-width:500px;margin:0 auto 30px}
.btn{display:inline-block;background:#fff;color:#6A55F8;padding:16px 40px;border-radius:12px;font-weight:700;font-size:16px;text-decoration:none;transition:transform .2s}
.btn:hover{transform:scale(1.05)}
.section{padding:60px 20px;max-width:800px;margin:0 auto}
.section h2{font-size:28px;font-weight:700;margin-bottom:20px;text-align:center}
.features{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:30px}
.feature{background:#f8f7ff;border-radius:16px;padding:30px 20px;text-align:center}
.feature .icon{font-size:36px;margin-bottom:12px}
.feature h3{font-size:16px;font-weight:600;margin-bottom:8px}
.feature p{font-size:14px;color:#666}
.cta{background:#f5f5f7;padding:60px 20px;text-align:center}
.cta h2{font-size:28px;font-weight:700;margin-bottom:12px}
.cta p{color:#666;margin-bottom:24px}
.btn-primary{display:inline-block;background:#6A55F8;color:#fff;padding:16px 40px;border-radius:12px;font-weight:700;font-size:16px;text-decoration:none}
.price{font-size:36px;font-weight:800;color:#6A55F8;margin:16px 0}
</style></head>
<body>
<div class="hero">
  <h1>Научись зарабатывать на нейросетях за 14 дней</h1>
  <p>Пошаговая программа от практика с 5-летним опытом в маркетинге</p>
  <a href="#" class="btn">Смотреть программу →</a>
</div>
<div class="section">
  <h2>Что ты получишь</h2>
  <div class="features">
    <div class="feature"><div class="icon">🎬</div><h3>12 видеоуроков</h3><p>Пошаговые инструкции с примерами</p></div>
    <div class="feature"><div class="icon">📋</div><h3>Домашние задания</h3><p>Практика на реальных кейсах</p></div>
    <div class="feature"><div class="icon">💬</div><h3>Чат с куратором</h3><p>Обратная связь и поддержка</p></div>
  </div>
</div>
<div class="cta">
  <h2>Начни сейчас</h2>
  <p>Доступ к курсу сразу после оплаты</p>
  <div class="price">2 990 ₽</div>
  <a href="#" class="btn-primary">Купить курс →</a>
</div>
</body></html>`,
  },
  {
    id: 'furniture',
    name: 'Мебель на заказ',
    description: 'Продажа мебели, дизайн интерьеров',
    icon: '🪑',
    html: `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#2d2d2d;background:#fff}
.hero{background:linear-gradient(135deg,#2d2d2d 0%,#4a4a4a 100%);color:#fff;padding:80px 20px;text-align:center}
.hero h1{font-size:40px;font-weight:800;max-width:600px;margin:0 auto 16px}
.hero p{font-size:17px;opacity:.8;max-width:450px;margin:0 auto 28px}
.btn-gold{display:inline-block;background:#C9A96E;color:#fff;padding:16px 40px;border-radius:8px;font-weight:700;text-decoration:none}
.section{padding:60px 20px;max-width:900px;margin:0 auto}
.section h2{font-size:28px;font-weight:700;margin-bottom:24px;text-align:center}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.card{border:1px solid #e5e5e5;border-radius:12px;overflow:hidden}
.card-img{background:#f0ece4;height:200px;display:flex;align-items:center;justify-content:center;font-size:48px}
.card-body{padding:20px}
.card-body h3{font-size:16px;font-weight:600;margin-bottom:6px}
.card-body p{font-size:14px;color:#888;margin-bottom:12px}
.card-price{font-size:20px;font-weight:700;color:#C9A96E}
.form-section{background:#f9f7f4;padding:60px 20px;text-align:center}
.form-section h2{font-size:28px;font-weight:700;margin-bottom:8px}
.form-section p{color:#888;margin-bottom:24px}
.form-box{background:#fff;max-width:400px;margin:0 auto;padding:30px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.08)}
.form-box input{width:100%;padding:12px 16px;margin-bottom:12px;border:1px solid #ddd;border-radius:8px;font-size:14px}
.form-box button{width:100%;padding:14px;background:#C9A96E;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:15px;cursor:pointer}
</style></head>
<body>
<div class="hero">
  <h1>Мебель на заказ по вашему дизайну</h1>
  <p>Кухни, шкафы и гардеробные от производителя. Замер бесплатно.</p>
  <a href="#" class="btn-gold">Рассчитать стоимость →</a>
</div>
<div class="section">
  <h2>Наши работы</h2>
  <div class="grid">
    <div class="card"><div class="card-img">🏠</div><div class="card-body"><h3>Кухня «Модерн»</h3><p>Белый глянец, фурнитура Blum</p><div class="card-price">от 185 000 ₽</div></div></div>
    <div class="card"><div class="card-img">🛏</div><div class="card-body"><h3>Шкаф-купе</h3><p>Зеркальные двери, LED подсветка</p><div class="card-price">от 95 000 ₽</div></div></div>
    <div class="card"><div class="card-img">🪑</div><div class="card-body"><h3>Гардеробная</h3><p>Система хранения под ключ</p><div class="card-price">от 120 000 ₽</div></div></div>
  </div>
</div>
<div class="form-section">
  <h2>Бесплатный замер</h2>
  <p>Оставьте заявку, и мы приедем к вам</p>
  <div class="form-box">
    <input type="text" placeholder="Ваше имя">
    <input type="tel" placeholder="Телефон">
    <button>Заказать замер</button>
  </div>
</div>
</body></html>`,
  },
  {
    id: 'vsl',
    name: 'VSL Landing',
    description: 'Продающее видео + таймер + CTA',
    icon: '🎬',
    html: `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VSL — Новая система заработка</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#060418;font-family:'Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:#fff;min-height:100%;overflow-x:hidden}
.vsl-root{position:relative;width:100%;min-height:100vh;background:radial-gradient(ellipse 80% 60% at 50% 0%,#1a0f3a 0%,#0b0720 45%,#060418 100%);padding:64px 24px 96px;overflow:hidden}
.vsl-glow-tl{position:absolute;top:-200px;left:-200px;width:700px;height:700px;background:radial-gradient(circle,rgba(106,85,248,0.33) 0%,transparent 60%);filter:blur(40px);pointer-events:none}
.vsl-glow-br{position:absolute;bottom:-200px;right:-200px;width:700px;height:700px;background:radial-gradient(circle,rgba(58,42,178,0.53) 0%,transparent 60%);filter:blur(40px);pointer-events:none}
.vsl-smoke-1{position:absolute;top:10%;left:5%;width:400px;height:600px;background:radial-gradient(ellipse,rgba(106,85,248,0.13) 0%,transparent 55%);filter:blur(30px);transform:rotate(-20deg);pointer-events:none}
.vsl-smoke-2{position:absolute;top:40%;right:0;width:500px;height:500px;background:radial-gradient(ellipse,rgba(158,141,255,0.09) 0%,transparent 60%);filter:blur(40px);pointer-events:none}
.vsl-smoke-3{position:absolute;bottom:20%;left:20%;width:600px;height:400px;background:radial-gradient(ellipse,rgba(106,85,248,0.08) 0%,transparent 60%);filter:blur(50px);pointer-events:none}
.vsl-vignette{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 30%,rgba(0,0,0,0.55) 100%);pointer-events:none}
.vsl-main{position:relative;max-width:880px;margin:0 auto;text-align:center;z-index:2}
.vsl-warn-wrap{display:flex;justify-content:center;margin-bottom:44px}
.vsl-warn-badge{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;background:linear-gradient(180deg,rgba(106,85,248,0.8) 0%,rgba(58,42,178,0.8) 100%);border:1px solid rgba(158,141,255,0.33);border-radius:999px;font-size:11px;font-weight:600;letter-spacing:0.5px;color:#fff;box-shadow:0 8px 24px rgba(106,85,248,0.27),inset 0 1px 0 rgba(255,255,255,0.15);animation:vslBlinkSoft 1.6s ease-in-out infinite}
.vsl-warn-dot{width:6px;height:6px;border-radius:50%;background:#fff;box-shadow:0 0 6px rgba(255,255,255,0.8)}
.vsl-h1{font-size:54px;font-weight:900;letter-spacing:0.5px;line-height:1.05;margin:0 0 22px;text-transform:uppercase;text-shadow:0 4px 30px rgba(0,0,0,0.5)}
.vsl-h1-accent{background:linear-gradient(90deg,#9e8dff 0%,#6a55f8 50%,#9e8dff 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.vsl-sub{font-size:15px;font-weight:700;letter-spacing:1.4px;line-height:1.8;color:#d4cff0;text-transform:uppercase;max-width:640px;margin:0 auto 44px}
.vsl-sub b{color:#fff}
.vsl-sub-accent{color:#9e8dff;font-weight:900}
.vsl-player-frame{position:relative;max-width:680px;margin:0 auto}
.vsl-player-glow{position:absolute;inset:-20px;background:radial-gradient(ellipse,rgba(106,85,248,0.27) 0%,transparent 70%);filter:blur(30px);pointer-events:none}
.vsl-player{position:relative;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#0a0814;border:1px solid rgba(106,85,248,0.27);box-shadow:0 20px 60px rgba(0,0,0,0.6),0 0 0 1px rgba(255,255,255,0.04);cursor:pointer}
.vsl-player-thumb{position:absolute;inset:0;background:linear-gradient(180deg,#1a1410 0%,#0d0a08 100%)}
.vsl-thumb-vignette{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 30%,rgba(0,0,0,0.7) 100%)}
.vsl-thumb-person{position:absolute;left:50%;top:50%;transform:translate(-50%,-40%);width:140px;height:180px;background:radial-gradient(ellipse at 50% 30%,#d6b8a0 0%,#8a6e58 55%,transparent 70%);border-radius:40% 40% 30% 30%;filter:blur(1px)}
.vsl-thumb-plant{position:absolute;left:20px;bottom:60px;width:120px;height:160px;background:radial-gradient(ellipse at 50% 80%,#1f3a28 0%,#0b1a12 60%,transparent 80%);filter:blur(6px)}
.vsl-thumb-caption{position:absolute;left:40px;bottom:60px;font-size:22px;font-weight:800;color:#fff;letter-spacing:0.5px;text-shadow:0 2px 6px rgba(0,0,0,0.7)}
.vsl-play-btn{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:86px;height:86px;border-radius:50%;background:rgba(255,255,255,0.18);border:2px solid rgba(255,255,255,0.35);display:flex;align-items:center;justify-content:center;cursor:pointer;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.vsl-play-btn svg{width:38px;height:38px}
.vsl-controls{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:10px;padding:10px 14px;background:linear-gradient(180deg,transparent 0%,rgba(0,0,0,0.8) 100%)}
.vsl-ctrl-btn{background:transparent;border:none;cursor:pointer;padding:4px;color:#fff;display:flex}
.vsl-time-text{font-size:11px;color:#d6d6d6;font-variant-numeric:tabular-nums}
.vsl-progress{flex:1;height:4px;background:rgba(255,255,255,0.18);border-radius:2px;position:relative}
.vsl-progress-fill{position:absolute;left:0;top:0;bottom:0;width:38%;background:#6a55f8;border-radius:2px}
.vsl-progress-knob{position:absolute;left:38%;top:50%;transform:translate(-50%,-50%);width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 0 0 3px rgba(106,85,248,0.4)}
.vsl-wistia{font-size:10px;color:#888;font-weight:700;margin-left:4px;letter-spacing:0.5px}
.vsl-timer-wrap{margin-top:44px;display:flex;flex-direction:column;align-items:center;gap:14px;min-height:170px;justify-content:flex-start}
.vsl-timer-stage{display:flex;flex-direction:column;align-items:center;gap:14px;animation:vslFadeInUp 0.5s ease-out both}
.vsl-timer-card{position:relative;background:#fff;border-radius:10px;padding:16px 64px 14px;box-shadow:0 20px 50px rgba(0,0,0,0.55),0 0 0 1px rgba(255,255,255,0.05),0 0 40px rgba(106,85,248,0.27);min-width:280px}
.vsl-timer-value{font-size:40px;font-weight:900;color:#6a55f8;font-variant-numeric:tabular-nums;letter-spacing:1px;text-align:center;line-height:1;display:flex;align-items:center;justify-content:center;gap:6px}
.vsl-timer-seg{min-width:2ch;display:inline-block;text-align:center}
.vsl-timer-colon{opacity:0.85}
.vsl-timer-labels{margin-top:8px;display:flex;justify-content:center;font-size:10px;letter-spacing:2px;color:#6b6b6b;font-weight:700}
.vsl-timer-lab{min-width:2ch;text-align:center}
.vsl-timer-lab-gap{width:28px}
.vsl-timer-note{font-size:11px;font-weight:700;letter-spacing:1.5px;color:#8b82b3;text-align:center;line-height:1.7}
.vsl-timer-note-accent{color:#b49bff}
.vsl-cta-link{position:relative;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;padding:20px 44px;border-radius:10px;background:linear-gradient(180deg,#6a55f8 0%,#3a2ab2 100%);color:#fff;text-decoration:none;font-weight:800;letter-spacing:1.8px;font-size:15px;box-shadow:0 10px 30px rgba(106,85,248,0.4),0 0 0 1px rgba(158,141,255,0.33) inset;transition:transform 0.25s cubic-bezier(.2,.8,.2,1),box-shadow 0.25s ease,letter-spacing 0.25s ease;animation:vslCtaIn 0.55s cubic-bezier(.2,.8,.2,1) both,vslCtaPulse 2.4s ease-in-out 0.6s infinite;cursor:pointer;text-transform:uppercase}
.vsl-cta-link:hover{transform:translateY(-2px) scale(1.03);letter-spacing:2.4px;box-shadow:0 18px 50px rgba(106,85,248,0.6),0 0 0 1px rgba(158,141,255,0.6) inset,0 0 60px rgba(106,85,248,0.47);animation-play-state:paused,paused}
.vsl-cta-shine{position:absolute;top:0;bottom:0;left:-60%;width:45%;background:linear-gradient(100deg,transparent 0%,rgba(255,255,255,0.55) 50%,transparent 100%);transform:skewX(-20deg);pointer-events:none;animation:vslCtaShine 2.8s ease-in-out infinite}
.vsl-cta-text{position:relative;z-index:1}
.vsl-hidden{display:none !important}
@keyframes vslBlinkSoft{0%,100%{opacity:0.85}50%{opacity:0}}
@keyframes vslFadeInUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes vslCtaIn{0%{opacity:0;transform:translateY(20px) scale(0.85);filter:blur(6px)}60%{opacity:1;transform:translateY(-4px) scale(1.05);filter:blur(0)}100%{opacity:1;transform:translateY(0) scale(1);filter:blur(0)}}
@keyframes vslCtaPulse{0%,100%{box-shadow:0 10px 30px rgba(106,85,248,0.4),0 0 0 1px rgba(158,141,255,0.33) inset}50%{box-shadow:0 14px 40px rgba(106,85,248,0.7),0 0 0 1px rgba(158,141,255,0.6) inset,0 0 40px rgba(106,85,248,0.5)}}
@keyframes vslCtaShine{0%{left:-60%}60%,100%{left:120%}}
@media (max-width:640px){.vsl-h1{font-size:34px}.vsl-sub{font-size:13px;letter-spacing:1px}.vsl-timer-card{padding:14px 36px 12px;min-width:220px}.vsl-timer-value{font-size:32px}.vsl-cta-link{padding:16px 28px;font-size:13px}}
</style>
</head>
<body>
<div class="vsl-root">
  <div class="vsl-glow-tl"></div>
  <div class="vsl-glow-br"></div>
  <div class="vsl-smoke-1"></div>
  <div class="vsl-smoke-2"></div>
  <div class="vsl-smoke-3"></div>
  <div class="vsl-vignette"></div>
  <main class="vsl-main">
    <div class="vsl-warn-wrap">
      <div class="vsl-warn-badge">
        <span class="vsl-warn-dot"></span>
        Не закрывайте эту страницу, иначе видео закончится
      </div>
    </div>
    <h1 class="vsl-h1">НОВАЯ <span class="vsl-h1-accent">СИСТЕМА</span> ЗАРАБОТКА</h1>
    <p class="vsl-sub">
      КАК ОСВОИТЬ <b>AI-МАРКЕТИНГ</b> И НАЧАТЬ ЗАРАБАТЫВАТЬ<br>
      ОТ <span class="vsl-sub-accent">150 000 ₽</span> В МЕСЯЦ, НЕ ИМЕЯ ОПЫТА,<br>
      БОЛЬШОГО БЮДЖЕТА ИЛИ ПРОФИЛЬНОГО ОБРАЗОВАНИЯ
    </p>
    <div class="vsl-player-frame">
      <div class="vsl-player-glow"></div>
      <div class="vsl-player" id="vslPlayer">
        <div class="vsl-player-thumb">
          <div class="vsl-thumb-vignette"></div>
          <div class="vsl-thumb-person"></div>
          <div class="vsl-thumb-plant"></div>
          <div class="vsl-thumb-caption">3. Покажу пошагово</div>
        </div>
        <button class="vsl-play-btn" id="vslPlayBtn" aria-label="play">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none"><path d="M8 5v14l11-7z" fill="#fff"/></svg>
        </button>
        <div class="vsl-controls">
          <button class="vsl-ctrl-btn">
            <svg width="12" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <span class="vsl-time-text">17:50</span>
          <div class="vsl-progress">
            <div class="vsl-progress-fill"></div>
            <div class="vsl-progress-knob"></div>
          </div>
          <span class="vsl-wistia">wistia</span>
        </div>
      </div>
    </div>
    <div class="vsl-timer-wrap">
      <div class="vsl-timer-stage" id="vslTimerStage" data-timer-seconds="60">
        <div class="vsl-timer-card">
          <div class="vsl-timer-value">
            <span class="vsl-timer-seg" id="vslMin">00</span>
            <span class="vsl-timer-colon">:</span>
            <span class="vsl-timer-seg" id="vslSec">60</span>
          </div>
          <div class="vsl-timer-labels">
            <span class="vsl-timer-lab">МИНУТ</span>
            <span class="vsl-timer-lab-gap"></span>
            <span class="vsl-timer-lab">СЕКУНД</span>
          </div>
        </div>
        <div class="vsl-timer-note">
          ПОСЛЕ ТАЙМЕРА ЗДЕСЬ ПОЯВИТСЯ<br><span class="vsl-timer-note-accent">«СЕКРЕТНАЯ ССЫЛКА»</span>
        </div>
      </div>
      <a href="#" class="vsl-cta-link vsl-hidden" id="vslCta">
        <span class="vsl-cta-shine"></span>
        <span class="vsl-cta-text">Следующее видео →</span>
      </a>
    </div>
  </main>
</div>
<script>
(function(){
  var stage=document.getElementById('vslTimerStage');
  var cta=document.getElementById('vslCta');
  var minEl=document.getElementById('vslMin');
  var secEl=document.getElementById('vslSec');
  if(!stage||!cta||!minEl||!secEl) return;
  var total=parseInt(stage.getAttribute('data-timer-seconds')||'60',10);
  var remaining=isNaN(total)?60:total;
  function pad(n){return n<10?'0'+n:''+n}
  function render(){
    var mm=Math.floor(remaining/60);
    var ss=remaining%60;
    minEl.textContent=pad(mm);
    secEl.textContent=pad(ss);
  }
  render();
  var id=setInterval(function(){
    remaining=Math.max(0,remaining-1);
    render();
    if(remaining<=0){
      clearInterval(id);
      stage.classList.add('vsl-hidden');
      cta.classList.remove('vsl-hidden');
    }
  },1000);
  var playBtn=document.getElementById('vslPlayBtn');
  var player=document.getElementById('vslPlayer');
  if(playBtn&&player){
    var togglePlay=function(e){
      if(e) e.stopPropagation();
      playBtn.classList.toggle('vsl-hidden');
    };
    player.addEventListener('click',togglePlay);
  }
})();
</script>
</body>
</html>`,
  },
  {
    id: 'product',
    name: 'Товарный бизнес',
    description: 'Продажа товаров, e-commerce',
    icon: '📦',
    html: `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#1a1a2e;background:#fff}
.hero{background:linear-gradient(135deg,#FF6B35 0%,#FF8F65 100%);color:#fff;padding:60px 20px;text-align:center}
.hero h1{font-size:38px;font-weight:800;max-width:600px;margin:0 auto 12px}
.hero p{font-size:17px;opacity:.9;margin-bottom:8px}
.hero .old-price{font-size:20px;text-decoration:line-through;opacity:.6}
.hero .new-price{font-size:44px;font-weight:800;margin:8px 0 20px}
.btn-white{display:inline-block;background:#fff;color:#FF6B35;padding:16px 40px;border-radius:12px;font-weight:700;font-size:16px;text-decoration:none}
.benefits{padding:50px 20px;max-width:800px;margin:0 auto}
.benefits h2{text-align:center;font-size:26px;font-weight:700;margin-bottom:24px}
.benefit-list{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.benefit{display:flex;align-items:center;gap:12px;padding:16px 20px;background:#fff5f0;border-radius:12px}
.benefit .check{color:#FF6B35;font-size:20px}
.benefit span{font-size:15px}
.reviews{background:#fafafa;padding:50px 20px}
.reviews h2{text-align:center;font-size:26px;font-weight:700;margin-bottom:24px}
.review-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;max-width:900px;margin:0 auto}
.review{background:#fff;border-radius:12px;padding:20px;border:1px solid #eee}
.review .stars{color:#FFB800;margin-bottom:8px}
.review p{font-size:14px;color:#555;margin-bottom:8px}
.review .author{font-size:13px;color:#999}
.final-cta{padding:60px 20px;text-align:center}
.final-cta h2{font-size:28px;font-weight:700;margin-bottom:8px}
.final-cta .price{font-size:40px;font-weight:800;color:#FF6B35;margin:12px 0 20px}
.btn-primary{display:inline-block;background:#FF6B35;color:#fff;padding:16px 48px;border-radius:12px;font-weight:700;font-size:16px;text-decoration:none}
.timer{font-size:14px;color:#999;margin-top:12px}
</style></head>
<body>
<div class="hero">
  <h1>Умная колонка с голосовым помощником</h1>
  <p>Управляй домом голосом. 360° звук, Wi-Fi, Bluetooth 5.0</p>
  <div class="old-price">7 990 ₽</div>
  <div class="new-price">4 990 ₽</div>
  <a href="#" class="btn-white">Заказать со скидкой →</a>
</div>
<div class="benefits">
  <h2>Почему выбирают нас</h2>
  <div class="benefit-list">
    <div class="benefit"><span class="check">✓</span><span>Доставка за 1-2 дня по России</span></div>
    <div class="benefit"><span class="check">✓</span><span>Гарантия 12 месяцев</span></div>
    <div class="benefit"><span class="check">✓</span><span>Возврат в течение 14 дней</span></div>
    <div class="benefit"><span class="check">✓</span><span>Оплата при получении</span></div>
    <div class="benefit"><span class="check">✓</span><span>Более 10 000 довольных клиентов</span></div>
    <div class="benefit"><span class="check">✓</span><span>Официальный дистрибьютор</span></div>
  </div>
</div>
<div class="reviews">
  <h2>Отзывы покупателей</h2>
  <div class="review-grid">
    <div class="review"><div class="stars">★★★★★</div><p>Отличный звук, подключился за минуту. Дети в восторге!</p><div class="author">Анна К.</div></div>
    <div class="review"><div class="stars">★★★★★</div><p>Брал как подарок. Упаковка супер, доставили на следующий день.</p><div class="author">Дмитрий М.</div></div>
    <div class="review"><div class="stars">★★★★☆</div><p>За эту цену — лучший вариант. Рекомендую.</p><div class="author">Елена В.</div></div>
  </div>
</div>
<div class="final-cta">
  <h2>Успей купить со скидкой 37%</h2>
  <div class="price">4 990 ₽</div>
  <a href="#" class="btn-primary">Оформить заказ →</a>
  <div class="timer">⏱ Акция до конца недели</div>
</div>
</body></html>`,
  },
  {
    id: 'grisha-1',
    name: 'Урок 1 — заработок в онлайне',
    description: 'Образовательная страница урока курса',
    icon: '1️⃣',
    htmlPath: '/templates/grisha-1.html',
  },
  {
    id: 'grisha-2',
    name: 'Урок 2 — на чём зарабатывать',
    description: 'Образовательная страница урока курса',
    icon: '2️⃣',
    htmlPath: '/templates/grisha-2.html',
  },
  {
    id: 'grisha-3',
    name: 'Урок 3 — выход на 100-150к',
    description: 'Образовательная страница урока курса',
    icon: '3️⃣',
    htmlPath: '/templates/grisha-3.html',
  },
]
