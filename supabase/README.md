# SQL Migrations для Studency

## Правила нумерации

Все SQL-файлы пронумерованы по порядку применения:
```
01-media-library.sql
02-followup-media.sql
03-videos.sql
...
```

**При создании нового SQL-файла:**
- Взять следующий свободный номер (двузначный с ведущим нулём)
- Краткое имя через дефис на английском
- Формат: `NN-short-description.sql`
- **Регенерировать `00-apply-all.sql`** командой:
  ```bash
  cd supabase && {
    echo "-- APPLY ALL"; echo ""
    for f in 0[1-9]*.sql; do echo "-- $f"; cat "$f"; echo ""; done
  } > 00-apply-all.sql
  ```

**Пример:** следующая новая миграция будет `10-project-quotas.sql`.

---

## Быстрый вариант (один запуск)

**Самый простой способ:** открой [00-apply-all.sql](00-apply-all.sql) — это
объединённый файл со всеми миграциями. Скопируй целиком, вставь в Supabase
SQL Editor, нажми Run. Всё применится за один раз.

Все миграции идемпотентные (`IF NOT EXISTS`) — можно запускать повторно
без страха что-то сломать.

## Порядок применения (если нужно по отдельности)

Если предпочитаешь применять по одной (например для отладки), запускай в
Supabase SQL Editor строго по номеру:

| # | Файл | Что делает |
|---|---|---|
| 01 | `01-media-library.sql` | media_library + media_usages — центральное хранилище файлов проекта |
| 02 | `02-followup-media.sql` | Медиа-поля в message_followups (вложения в дожимах) |
| 03 | `03-videos.sql` | videos + video_views — видеохостинг через Kinescope |
| 04 | `04-kinescope-folders.sql` | projects.kinescope_folder_id + player_settings |
| 05 | `05-events.sql` | events + scenario_event_triggers + email column + duplicate_to_email |
| 06 | `06-crm-pro.sql` | customer_custom_fields + customer_field_values + customer_notes |
| 07 | `07-broadcasts.sql` | broadcasts + broadcast_deliveries + channel + email_subject |
| 08 | `08-email-unsubscribes.sql` | email_unsubscribes (GDPR/152-ФЗ compliance) |
| 09 | `09-usage-tracking.sql` | usage_events — лог расхода мастер-ресурсов |

---

## После применения SQL

### Обязательно вручную:

**Storage bucket для медиа:**
- Supabase Dashboard → Storage → **New bucket**
- Name: `chatbot-media`
- Public bucket: **✅**
- Create bucket

---

## Env vars для Vercel

### Обязательные (уже настроены)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Интеграции (master-account модель — один аккаунт на всех клиентов)

| Name | Назначение |
|---|---|
| `KINESCOPE_API_TOKEN` | Мастер-токен Kinescope — все клиенты грузят видео сюда |
| `ANTHROPIC_API_KEY` | Мастер-ключ Claude для AI-помощников |
| `RESEND_API_KEY` | Мастер-ключ Resend для email |
| `RESEND_MASTER_DOMAIN` | Домен отправителя (например `studency.ru`) |
| `NEXT_PUBLIC_APP_URL` | Базовый URL платформы `https://studency.ru` |
| `UNSUBSCRIBE_SECRET` | Секрет для HMAC подписи unsubscribe-токенов |
| `PRODAMUS_BASE_URL` | Базовый URL формы оплаты (опционально) |
| `PRODAMUS_SECRET_KEY` | Секретный ключ для подписи вебхуков (опционально) |

---

## Архитектура мастер-аккаунтов

Все "общие" интеграции работают через ОДИН мастер-аккаунт у владельца платформы.
Клиенты даже не знают о существовании этих сервисов.

| Сервис | Изоляция между клиентами |
|---|---|
| Kinescope | Папки per-project (`projects.kinescope_folder_id`) |
| Resend | Один мастер-домен + friendly fromName из имени проекта |
| Claude AI | Все используют мастер-ключ, учёт через `usage_events` |
| Supabase Storage | Папки per-project (`{project_id}/...`) в bucket `chatbot-media` |

**Что клиенты привязывают сами:**
- Telegram-боты (их бренд)
- Продамус (их деньги)

---

## Сторонние сервисы

- **cron-job.org** — внешний cron каждую минуту → `https://studency.ru/api/cron/followups`
  (Vercel Hobby cron имеет лимит 1 запуск в сутки)
