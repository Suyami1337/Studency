// Email sender via Resend — мастер-домен модель
// Docs: https://resend.com/docs
//
// Required env var: RESEND_API_KEY
// Optional env var: RESEND_MASTER_DOMAIN (default: 'studency.app')
// Optional env var: UNSUBSCRIBE_SECRET (for unsubscribe token HMAC)
// Optional env var: NEXT_PUBLIC_APP_URL (base URL for unsubscribe links)
//
// Архитектура:
// Все клиенты шлют с одного мастер-домена, но каждый проект имеет свой
// "friendly name" как отправитель. Почтовый клиент видит:
//   От: Школа Ивана <noreply@studency.app>
//
// Это избавляет клиентов от необходимости настраивать свои DNS/DKIM.
// Для тех кому нужна полная брендированность — есть возможность
// привязать свой домен (будет реализовано отдельно).

import crypto from 'crypto'
import { SupabaseClient } from '@supabase/supabase-js'

const RESEND_API = 'https://api.resend.com/emails'

function getMasterDomain(): string {
  return process.env.RESEND_MASTER_DOMAIN ?? 'studency.app'
}

function getFromAddress(): string {
  return `noreply@${getMasterDomain()}`
}

function getReplyToDefault(): string | null {
  return process.env.RESEND_REPLY_TO ?? null
}

/**
 * Sanitize sender name to avoid breaking RFC 5322 headers.
 * Strip characters that would require quoting and limit length.
 */
function sanitizeFromName(name: string): string {
  return name
    .replace(/["'<>()\\,;:[\]]/g, '')
    .trim()
    .slice(0, 70) || 'Studency'
}

export type SendEmailOptions = {
  to: string
  subject: string
  text: string
  html?: string
  /** Friendly sender name — отображается получателю в поле From.
   *  Рекомендуется указывать имя проекта / школы / бренда клиента. */
  fromName?: string
  /** Reply-To — если клиент хочет чтобы ответы уходили на его почту */
  replyTo?: string
  /** URL для unsubscribe (обязательно для массовых рассылок по закону) */
  unsubscribeUrl?: string
  /** Добавить ли футер с unsubscribe и от кого (по умолчанию true) */
  addFooter?: boolean
  /** Base URL платформы (например https://studency.app) — для построения unsubscribe ссылок */
  platformUrl?: string
}

/**
 * Send a transactional/marketing email via Resend.
 * Uses the master domain with a friendly From-name per project.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<{ ok: boolean; error?: string; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — email not sent')
    return { ok: false, error: 'RESEND_API_KEY not configured' }
  }

  const fromName = opts.fromName ? sanitizeFromName(opts.fromName) : 'Studency'
  const fromAddr = getFromAddress()
  const from = `${fromName} <${fromAddr}>`
  const replyTo = opts.replyTo ?? getReplyToDefault() ?? undefined

  const addFooter = opts.addFooter !== false
  let finalText = opts.text
  let finalHtml = opts.html ?? opts.text.replace(/\n/g, '<br>')

  if (addFooter) {
    const footerText = `\n\n—\nОтправлено через Studency${opts.unsubscribeUrl ? `\nОтписаться: ${opts.unsubscribeUrl}` : ''}`
    const footerHtml = `<hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;"><p style="color: #999; font-size: 12px;">Отправлено через <a href="https://${getMasterDomain()}" style="color: #6A55F8;">Studency</a>${opts.unsubscribeUrl ? ` · <a href="${opts.unsubscribeUrl}" style="color: #999;">Отписаться</a>` : ''}</p>`
    finalText += footerText
    finalHtml += footerHtml
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = {
    from,
    to: [opts.to],
    subject: opts.subject,
    text: finalText,
    html: finalHtml,
  }
  if (replyTo) body.reply_to = replyTo

  // List-Unsubscribe header — стандарт для email клиентов (Gmail, Mail.ru показывают кнопку)
  if (opts.unsubscribeUrl) {
    body.headers = {
      'List-Unsubscribe': `<${opts.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    }
  }

  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('resend error:', res.status, errText)
      return { ok: false, error: errText }
    }

    const json = await res.json() as { id?: string }
    return { ok: true, id: json.id }
  } catch (err) {
    console.error('email send error:', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown' }
  }
}

/**
 * Backward-compat shim for the old signature sendEmail(to, subject, text, html).
 * Used internally by some paths.
 */
export async function sendSimpleEmail(
  to: string, subject: string, text: string, html?: string
): Promise<{ ok: boolean; error?: string }> {
  return sendEmail({ to, subject, text, html })
}

// ============================================================================
// Unsubscribe token helpers
// ============================================================================

function hmacSign(data: string): string {
  const secret = process.env.UNSUBSCRIBE_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'fallback'
  return crypto.createHmac('sha256', secret).update(data).digest('hex').slice(0, 32)
}

export function buildUnsubscribeToken(projectId: string, email: string): string {
  const payload = JSON.stringify({ p: projectId, e: email })
  const base = Buffer.from(payload).toString('base64url')
  const sig = hmacSign(base)
  return `${base}.${sig}`
}

export function buildUnsubscribeUrl(projectId: string, email: string, baseUrl?: string): string {
  const token = buildUnsubscribeToken(projectId, email)
  const base = baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://studency.vercel.app'
  return `${base}/api/email/unsubscribe?token=${encodeURIComponent(token)}`
}

// ============================================================================
// sendProjectEmail — главный публичный helper для отправки
// ============================================================================

export type SendProjectEmailOptions = {
  projectId: string
  to: string
  subject: string
  text: string
  html?: string
  fromName?: string
  replyTo?: string
}

/**
 * Send an email on behalf of a project.
 * - Проверяет что email не в списке отписавшихся
 * - Генерирует подписанный unsubscribe-токен
 * - Добавляет List-Unsubscribe заголовок и футер
 * - Использует имя проекта как fromName если не указано
 *
 * Возвращает { ok: false, error: 'unsubscribed' } если клиент отписался.
 */
export async function sendProjectEmail(
  supabase: SupabaseClient,
  opts: SendProjectEmailOptions
): Promise<{ ok: boolean; error?: string; id?: string; unsubscribed?: boolean }> {
  // 1. Проверка отписки
  const { data: unsub } = await supabase
    .from('email_unsubscribes')
    .select('id')
    .eq('project_id', opts.projectId)
    .eq('email', opts.to.toLowerCase())
    .maybeSingle()

  if (unsub) {
    return { ok: false, error: 'recipient unsubscribed', unsubscribed: true }
  }

  // 2. Fetch project name if fromName not provided
  let fromName = opts.fromName
  if (!fromName) {
    const { data: proj } = await supabase
      .from('projects').select('name').eq('id', opts.projectId).single()
    fromName = proj?.name ?? 'Studency'
  }

  // 3. Build unsubscribe URL
  const unsubscribeUrl = buildUnsubscribeUrl(opts.projectId, opts.to)

  // 4. Send
  return sendEmail({
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    fromName,
    replyTo: opts.replyTo,
    unsubscribeUrl,
    addFooter: true,
  })
}
