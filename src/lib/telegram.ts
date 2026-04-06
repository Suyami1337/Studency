const TELEGRAM_API = 'https://api.telegram.org/bot'

export async function sendTelegramMessage(token: string, chatId: number | string, text: string, buttons?: { text: string; url?: string; callback_data?: string }[]) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
  }

  if (buttons && buttons.length > 0) {
    body.reply_markup = {
      inline_keyboard: [buttons.map(b => {
        if (b.url) return { text: b.text, url: b.url }
        return { text: b.text, callback_data: b.callback_data || b.text }
      })],
    }
  }

  const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  return res.json()
}

export async function setTelegramWebhook(token: string, webhookUrl: string) {
  const res = await fetch(`${TELEGRAM_API}${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl }),
  })

  return res.json()
}

export async function deleteTelegramWebhook(token: string) {
  const res = await fetch(`${TELEGRAM_API}${token}/deleteWebhook`, {
    method: 'POST',
  })

  return res.json()
}

export async function getTelegramBotInfo(token: string) {
  const res = await fetch(`${TELEGRAM_API}${token}/getMe`)
  return res.json()
}
