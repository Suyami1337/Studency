export const landingTemplates = [
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
]
