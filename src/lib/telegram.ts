const TELEGRAM_API = 'https://api.telegram.org/bot'

type InlineButton = { text: string; url?: string; callback_data?: string }

function buildReplyMarkup(buttons?: InlineButton[]) {
  if (!buttons || buttons.length === 0) return undefined
  // Каждая кнопка — в своём ряду (вертикальная раскладка)
  return {
    inline_keyboard: buttons.map(b => {
      if (b.url) return [{ text: b.text, url: b.url }]
      return [{ text: b.text, callback_data: b.callback_data || b.text }]
    }),
  }
}

async function telegramRequest(token: string, method: string, body: Record<string, unknown>) {
  const res = await fetch(`${TELEGRAM_API}${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function sendTelegramMessage(token: string, chatId: number | string, text: string, buttons?: InlineButton[]) {
  return telegramRequest(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: buildReplyMarkup(buttons),
  })
}

export async function sendTelegramPhoto(token: string, chatId: number | string, photoUrl: string, caption?: string, buttons?: InlineButton[]) {
  return telegramRequest(token, 'sendPhoto', {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: caption ? 'HTML' : undefined,
    reply_markup: buildReplyMarkup(buttons),
  })
}

export async function sendTelegramVideo(token: string, chatId: number | string, videoUrl: string, caption?: string, buttons?: InlineButton[]) {
  return telegramRequest(token, 'sendVideo', {
    chat_id: chatId,
    video: videoUrl,
    caption,
    parse_mode: caption ? 'HTML' : undefined,
    reply_markup: buildReplyMarkup(buttons),
  })
}

export async function sendTelegramAnimation(token: string, chatId: number | string, animationUrl: string, caption?: string, buttons?: InlineButton[]) {
  return telegramRequest(token, 'sendAnimation', {
    chat_id: chatId,
    animation: animationUrl,
    caption,
    parse_mode: caption ? 'HTML' : undefined,
    reply_markup: buildReplyMarkup(buttons),
  })
}

export async function sendTelegramVideoNote(token: string, chatId: number | string, videoNoteUrl: string) {
  // video_note не поддерживает caption, buttons, parse_mode
  return telegramRequest(token, 'sendVideoNote', {
    chat_id: chatId,
    video_note: videoNoteUrl,
  })
}

export async function sendTelegramDocument(token: string, chatId: number | string, documentUrl: string, caption?: string, buttons?: InlineButton[]) {
  return telegramRequest(token, 'sendDocument', {
    chat_id: chatId,
    document: documentUrl,
    caption,
    parse_mode: caption ? 'HTML' : undefined,
    reply_markup: buildReplyMarkup(buttons),
  })
}

export async function sendTelegramAudio(token: string, chatId: number | string, audioUrl: string, caption?: string, buttons?: InlineButton[]) {
  return telegramRequest(token, 'sendAudio', {
    chat_id: chatId,
    audio: audioUrl,
    caption,
    parse_mode: caption ? 'HTML' : undefined,
    reply_markup: buildReplyMarkup(buttons),
  })
}

export async function setTelegramWebhook(token: string, webhookUrl: string) {
  return telegramRequest(token, 'setWebhook', {
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query', 'my_chat_member', 'chat_member'],
  })
}

export async function deleteTelegramWebhook(token: string) {
  const res = await fetch(`${TELEGRAM_API}${token}/deleteWebhook`, { method: 'POST' })
  return res.json()
}

export async function createChatInviteLink(token: string, chatId: number | string, params: { name?: string; expire_date?: number; member_limit?: number; creates_join_request?: boolean } = {}) {
  return telegramRequest(token, 'createChatInviteLink', {
    chat_id: chatId,
    ...params,
  })
}

export async function revokeChatInviteLink(token: string, chatId: number | string, inviteLink: string) {
  return telegramRequest(token, 'revokeChatInviteLink', { chat_id: chatId, invite_link: inviteLink })
}

export async function getChat(token: string, chatId: number | string) {
  return telegramRequest(token, 'getChat', { chat_id: chatId })
}

export async function getChatMember(token: string, chatId: number | string, userId: number | string) {
  return telegramRequest(token, 'getChatMember', { chat_id: chatId, user_id: userId })
}

export async function getTelegramBotInfo(token: string) {
  const res = await fetch(`${TELEGRAM_API}${token}/getMe`)
  return res.json()
}
