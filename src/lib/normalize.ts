// Канонические формы phone/email — нужны чтобы тот же человек, заполнивший
// форму с разным форматом телефона (8 vs +7), не порождал две карточки.
//
// Используется:
//  1. /api/landing/[slug]/submit — нормализуем перед поиском дубликатов
//  2. cron auto-merge — при группировке по phone/email
//  3. webhook бота — при сравнении telegram-номера

/**
 * Приводит телефон к каноническому виду: только цифры, конвертирует RU-варианты
 * (8XXX, 7XXX, +7XXX) к единому формату 7XXX.
 *
 * Примеры:
 *   "+7 (903) 123-45-67"   → "79031234567"
 *   "8 903 123 45 67"      → "79031234567"
 *   "89031234567"          → "79031234567"
 *   "+38 050 123 4567"     → "380501234567"   (UA, оставляем как есть)
 *   "abc"                  → null
 *   ""                     → null
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null
  const digits = String(input).replace(/\D/g, '')
  if (!digits) return null
  // RU: 8XXXXXXXXXX (11 цифр) или 7XXXXXXXXXX → 7XXXXXXXXXX
  if (digits.length === 11) {
    if (digits.startsWith('8')) return '7' + digits.slice(1)
    if (digits.startsWith('7')) return digits
  }
  // 10 цифр (без кода страны) — добавляем 7 для RU как дефолт
  if (digits.length === 10) return '7' + digits
  // прочие коды стран — оставляем как есть
  if (digits.length >= 7) return digits
  return null
}

/**
 * Email: trim + lowercase. Без gmail-tricks (точки/+tags игнорировать) — это
 * слишком агрессивно и может слепить вместе разных людей.
 */
export function normalizeEmail(input: string | null | undefined): string | null {
  if (!input) return null
  const v = String(input).trim().toLowerCase()
  if (!v) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null
  return v
}

/**
 * Telegram username: убираем @ и lowercase. Для сравнения, в БД храним без @.
 */
export function normalizeTelegramUsername(input: string | null | undefined): string | null {
  if (!input) return null
  const v = String(input).trim().replace(/^@/, '').toLowerCase()
  return v || null
}
