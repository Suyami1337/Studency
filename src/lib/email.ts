// Simple email sender via Resend (free tier: 3000 emails/month, 100/day)
// Docs: https://resend.com/docs
//
// Required env var: RESEND_API_KEY
// Optional: RESEND_FROM_EMAIL (default: 'noreply@studency.app')

const RESEND_API = 'https://api.resend.com/emails'

export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html?: string
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — email not sent')
    return { ok: false, error: 'RESEND_API_KEY not configured' }
  }

  const from = process.env.RESEND_FROM_EMAIL ?? 'Studency <noreply@studency.app>'

  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        html: html ?? text,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('resend error:', res.status, errText)
      return { ok: false, error: errText }
    }

    return { ok: true }
  } catch (err) {
    console.error('email send error:', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown' }
  }
}
