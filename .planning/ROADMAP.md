# Roadmap: Studency

## Milestone 1: MVP (v1.0)

### Phase 1: Design Prototype (HTML mockup)
**Status:** Pending
**Scope:** Полный визуальный прототип всех экранов с фейковыми данными. Без бэкенда.
**Covers:** Визуал всех модулей — вход, проекты, воронки, CRM, боты, лендинги, обучение, аналитика, заказы, настройки
**Done:** Все экраны согласованы с пользователем

### Phase 2: Auth + Project Structure
**Status:** Pending
**Scope:** Регистрация, вход, создание проектов, навигация
**Covers:** AUTH-01..04, PROJ-01..04
**Depends on:** Phase 1 (согласованный дизайн)
**Done:** Пользователь может зарегистрироваться, создать проект, видеть боковую навигацию

### Phase 3: CRM + Funnels
**Status:** Pending
**Scope:** Карточка клиента, CRM-доска, воронки с этапами
**Covers:** CRM-01..06, FUNL-01..05
**Depends on:** Phase 2
**Done:** Можно создать воронку, видеть клиентов на доске, открывать карточки

### Phase 4: Chatbot (Telegram)
**Status:** Pending
**Scope:** Telegram-бот через AI, диалоги, воронка, рассылки, дожимы
**Covers:** BOT-01..07
**Depends on:** Phase 3 (CRM для записи клиентов)
**Done:** Бот работает в Telegram, клиенты появляются в CRM, можно делать рассылки

### Phase 5: Landings
**Status:** Pending
**Scope:** AI-генерация лендингов, хостинг, трекинг, кнопка оплаты
**Covers:** LAND-01..04
**Depends on:** Phase 3 (CRM для трекинга)
**Done:** Можно сгенерировать лендинг, он доступен по URL, посещения пишутся в CRM

### Phase 6: Learning Platform
**Status:** Pending
**Scope:** Курсы, уроки, видео, доступ после оплаты, прогресс
**Covers:** EDU-01..04
**Depends on:** Phase 3 (CRM для прогресса)
**Done:** Можно создать курс с уроками, доступ открывается после оплаты

### Phase 7: Payments (Prodamus)
**Status:** Pending
**Scope:** Интеграция Продамус, заказы, вебхуки, автооткрытие доступа
**Covers:** PAY-01..05
**Depends on:** Phase 6 (продукты для оплаты)
**Done:** Клиент может оплатить, заказ меняет статус, доступ к курсу открывается

### Phase 8: Analytics
**Status:** Pending
**Scope:** Сквозная аналитика по воронке + отдельная по модулям
**Covers:** ANLT-01..05
**Depends on:** Phase 3..7 (данные из всех модулей)
**Done:** Дашборд показывает конверсии по воронке, можно кликнуть на клиента

---
*Roadmap created: 2026-04-06*
*Last updated: 2026-04-06 after initial definition*
