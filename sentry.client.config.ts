// Sentry на клиенте: ловит JS-ошибки в браузере (лендинги, админка).
// Если SENTRY_DSN не задан в env — SDK не инициализируется, ничего не падает.

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    // Низкая sample rate чтобы не выжрать бесплатный лимит на трафике
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,    // session replay выключен — дорого по storage
    replaysOnErrorSampleRate: 0,
    environment: process.env.NODE_ENV,
    // Игнорируем шум: блокировщики рекламы, расширения браузера и т.п.
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
      // расширения / chrome
      /chrome-extension/,
      /moz-extension/,
    ],
  })
}
