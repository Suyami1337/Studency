// Helpers для системы приглашений в проекты.
//
// Поток:
// 1. Менеджер вызывает POST /api/team/invite (project_id, email, role_id)
// 2. Генерируется токен (256 бит), создаётся запись в invitations
// 3. На email уходит письмо со ссылкой <school>/invite/<token>
// 4. Получатель открывает страницу /invite/[token] (на домене школы)
// 5. POST /api/auth/accept-invitation создаёт user (если новый) или логинит,
//    создаёт project_members, помечает invitation как использованное

import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ROOT_DOMAIN } from './subdomain'

export const INVITATION_TTL_DAYS = 7

/** Генерирует криптостойкий токен для одноразовой ссылки. */
export function generateInvitationToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

/** Считает дату истечения приглашения. */
export function getInvitationExpiresAt(): Date {
  return new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000)
}

/** Строит ссылку-приглашение на домене школы (custom domain или subdomain). */
export async function buildInvitationUrl(
  supabase: SupabaseClient,
  projectId: string,
  token: string,
): Promise<string> {
  const { data: proj } = await supabase
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .maybeSingle()

  if (!proj?.owner_id) {
    return `https://${ROOT_DOMAIN}/invite/${token}`
  }

  const { data: dom } = await supabase
    .from('account_domains')
    .select('subdomain, custom_domain, custom_domain_status')
    .eq('user_id', proj.owner_id)
    .maybeSingle()

  if (dom?.custom_domain && dom.custom_domain_status === 'verified') {
    return `https://${dom.custom_domain}/invite/${token}`
  }
  if (dom?.subdomain) {
    return `https://${dom.subdomain}.${ROOT_DOMAIN}/invite/${token}`
  }
  return `https://${ROOT_DOMAIN}/invite/${token}`
}

/** Email шаблон: HTML и plain-text версия письма-приглашения. */
export function renderInvitationEmail(opts: {
  schoolName: string
  roleLabel: string
  inviteUrl: string
  inviterName?: string
  isExistingUser: boolean
}): { subject: string; text: string; html: string } {
  const { schoolName, roleLabel, inviteUrl, inviterName, isExistingUser } = opts

  const subject = isExistingUser
    ? `Вам открыли доступ к школе ${schoolName}`
    : `Приглашение в школу ${schoolName}`

  const inviterPart = inviterName ? `${inviterName} из школы ` : 'Школа '

  const text = isExistingUser
    ? `Здравствуйте!

${inviterPart}«${schoolName}» открыла вам доступ как «${roleLabel}».

У вас уже есть аккаунт на платформе Studency. Откройте ссылку ниже и войдите своим паролем — школа сразу появится в списке доступных:

${inviteUrl}

Если вы забыли пароль — на странице входа есть кнопка «Забыли пароль?».

Ссылка действует 7 дней.`
    : `Здравствуйте!

${inviterPart}«${schoolName}» приглашает вас на платформу как «${roleLabel}».

Чтобы принять приглашение, перейдите по ссылке и завершите регистрацию (введите имя и придумайте пароль):

${inviteUrl}

Ссылка одноразовая и действует 7 дней.`

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8F7FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,#6A55F8,#8B7BFA);color:white;font-weight:700;font-size:24px;line-height:56px;">S</div>
    </div>
    <div style="background:white;border-radius:16px;padding:32px;border:1px solid #eee;">
      <h1 style="margin:0 0 16px 0;font-size:20px;font-weight:600;">${isExistingUser ? 'Открыт доступ к школе' : 'Приглашение в школу'} «${escapeHtml(schoolName)}»</h1>
      <p style="margin:0 0 16px 0;color:#555;line-height:1.5;">
        ${escapeHtml(inviterPart)}«<strong>${escapeHtml(schoolName)}</strong>» ${isExistingUser ? 'открыла вам доступ' : 'приглашает вас на платформу'} как «<strong>${escapeHtml(roleLabel)}</strong>».
      </p>
      <p style="margin:0 0 24px 0;color:#555;line-height:1.5;">
        ${isExistingUser
          ? 'У вас уже есть аккаунт на Studency — войдите своим паролем, и школа появится в списке доступных.'
          : 'Перейдите по кнопке ниже и завершите регистрацию (укажите имя и придумайте пароль).'}
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${inviteUrl}" style="display:inline-block;padding:12px 32px;background:#6A55F8;color:white;text-decoration:none;border-radius:10px;font-weight:500;">
          ${isExistingUser ? 'Войти в школу' : 'Принять приглашение'}
        </a>
      </div>
      <p style="margin:0;color:#999;font-size:13px;line-height:1.5;">
        Ссылка одноразовая и действует 7 дней. Если кнопка не работает, скопируйте ссылку:<br>
        <a href="${inviteUrl}" style="color:#6A55F8;word-break:break-all;">${inviteUrl}</a>
      </p>
    </div>
  </div>
</body>
</html>`

  return { subject, text, html }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
