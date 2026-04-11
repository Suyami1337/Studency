# SQL Migrations для Studency

Порядок применения (сверху вниз):

## Блок 1-2 (фундамент + сайт) — применено ранее
- `phase5-schema.sql`, `phase5-tariff-access.sql`
- `phase6-schema.sql`, `phase7-schema.sql`, `phase7-fix-product-link.sql`
- `traffic-sources-schema.sql`, `crm-tracking-fields.sql`
- `block2-schema.sql` (custom_domain, lead_submissions, RPC)

## Блок 3 (чат-боты pro) — применено
- `block3-followups-fix.sql` — fix followups table schema
- `block3-scenario-tracking.sql` — scenario_id в chatbot_messages
- `block3-followup-queue.sql` — очередь дожимов
- `block3-message-queue.sql` — очередь цепочных сообщений

## Медиа-библиотека
- `APPLY-MEDIA-LIBRARY.sql` ← **запустить**
  После этого создай bucket `chatbot-media` (public) в Storage вручную через UI
- `APPLY-FOLLOWUP-MEDIA.sql` ← **запустить после media-library**
  (добавляет media-поля в message_followups)

## Блок 3 finale — Видеохостинг
- `APPLY-VIDEOS.sql` ← **запустить**
  Требует env var `KINESCOPE_API_TOKEN` в Vercel

## Блок 4 — Events API + email
- `APPLY-EVENTS.sql` ← **запустить**
  - events table
  - scenario_event_triggers table
  - duplicate_to_email flag
  - email column в customers
  Опциональный env var `RESEND_API_KEY` для email-дублирования

## Блок 5 — CRM Pro
- `APPLY-CRM-PRO.sql` ← **запустить**
  - customer_custom_fields table
  - customer_field_values table
  - customer_notes table

## Блок 7 — Рассылки
- `APPLY-BROADCASTS.sql` ← **запустить** (обновлён с channel + email_subject)
  - broadcasts table (+ colums channel, email_subject)
  - broadcast_deliveries table

## Ночная сессия — мастер-аккаунты
- `APPLY-KINESCOPE-FOLDERS.sql` ← **запустить**
  - projects.kinescope_folder_id
  - projects.player_settings (jsonb)
- `APPLY-EMAIL-UNSUBSCRIBES.sql` ← **запустить**
  - email_unsubscribes table (GDPR compliance)
- `APPLY-USAGE-TRACKING.sql` ← **запустить**
  - usage_events table (мониторинг расхода мастер-ресурсов)

## Блок 8 — Продамус
SQL не требуется. Используется существующая таблица orders.
Env vars:
- `PRODAMUS_BASE_URL`
- `PRODAMUS_SECRET_KEY`

## Блок 9 — AI-помощники
SQL не требуется. Только env var:
- `ANTHROPIC_API_KEY`

---

## Список env vars для Vercel

Обязательные:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Для интеграций (опционально):
- `KINESCOPE_API_TOKEN` — мастер-токен Kinescope (все клиенты видео грузят сюда)
- `RESEND_API_KEY` — мастер-ключ Resend для email-рассылок
- `RESEND_MASTER_DOMAIN` — домен отправителя (по умолчанию `studency.app`)
- `RESEND_REPLY_TO` — опциональный Reply-To адрес
- `UNSUBSCRIBE_SECRET` — секрет для HMAC подписи unsubscribe-токенов
- `NEXT_PUBLIC_APP_URL` — базовый URL платформы (для unsubscribe ссылок)
- `PRODAMUS_BASE_URL` — базовый URL формы оплаты
- `PRODAMUS_SECRET_KEY` — секретный ключ для подписи
- `ANTHROPIC_API_KEY` — мастер-ключ Claude для AI-помощников

## Архитектура мастер-аккаунтов

Все "общие" интеграции работают через ОДИН мастер-аккаунт у владельца платформы.
Клиенты даже не знают о существовании этих сервисов.

| Сервис | Изоляция между клиентами |
|---|---|
| Kinescope | Папки per-project (projects.kinescope_folder_id) |
| Resend | Один мастер-домен + friendly fromName из имени проекта |
| Claude AI | Все используют твой ключ, биллинг через usage_events |
| Supabase Storage | Папки per-project ({project_id}/...) в bucket chatbot-media |

Клиенты привязывают свои:
- Telegram-боты (их бренд)
- Prodamus (деньги идут им)

## Сторонние сервисы

- **cron-job.org** — внешний cron каждую минуту → `https://studency.vercel.app/api/cron/followups`
  (Vercel Hobby cron слишком ограничен)
