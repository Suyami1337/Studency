import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

// Sentry оборачивает next.config только если DSN задан.
// Иначе экспортим обычный config — нет лишних webpack-преобразований.
const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN);

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      // Скрываем source-maps от публичного доступа в проде
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Производительность: не загружаем source-maps если SENTRY_AUTH_TOKEN не задан
      sourcemaps: {
        disable: !process.env.SENTRY_AUTH_TOKEN,
      },
      tunnelRoute: '/monitoring/error',  // обходит блокировщики рекламы
    })
  : nextConfig;
