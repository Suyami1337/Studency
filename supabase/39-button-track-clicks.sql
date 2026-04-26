-- Опциональный трекинг кликов на URL-кнопках чат-бота.
-- Если track_clicks=true (по умолчанию) — Telegram получает обёртку
-- studency.ru/btn/<id>?c=<customer> которая логирует клик и редиректит на action_url.
-- Если track_clicks=false — Telegram получает action_url напрямую (без аналитики кликов).

ALTER TABLE scenario_buttons
  ADD COLUMN IF NOT EXISTS track_clicks boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN scenario_buttons.track_clicks IS
  'Трекать клики через прокси /btn/<id>. По умолчанию true. Если false — прямая ссылка в Telegram inline keyboard, без аналитики.';
