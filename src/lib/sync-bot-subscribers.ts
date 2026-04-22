import { SupabaseClient } from '@supabase/supabase-js'
import { sendChatAction } from '@/lib/telegram'

/**
 * Telegram-ошибки означающие «клиент недоступен боту навсегда / пока не напишет снова».
 * При таких ошибках помечаем chat_blocked=true и bot_subscribed=false.
 */
function isUnreachable(description: string | undefined | null): boolean {
  if (!description) return false
  const e = description.toLowerCase()
  return e.includes('forbidden')
      || e.includes('chat not found')
      || e.includes('user is deactivated')
      || e.includes("bot can't initiate conversation")
      || e.includes('bot was blocked by the user')
}

export type SubscriberSyncResult = {
  total: number
  checked: number
  blocked: number    // сколько новых пометок chat_blocked в этом заходе
  unblocked: number  // сколько пометок снято
  errors: number     // неожиданные ошибки (не-reachable)
}

/**
 * Проверяет актуальность всех подписчиков бота через sendChatAction(typing).
 * action='typing' не показывает клиенту ничего видимого, но Telegram вернёт
 * 403/400 если бот больше недоступен.
 *
 * Rate limit: Telegram разрешает ~30 req/sec per bot — ставим sleep 40ms между
 * запросами чтобы не упираться в лимит.
 */
export async function syncBotSubscribers(
  supabase: SupabaseClient,
  botId: string,
  botToken: string,
): Promise<SubscriberSyncResult> {
  const { data: convs } = await supabase
    .from('chatbot_conversations')
    .select('id, telegram_chat_id, customer_id, chat_blocked')
    .eq('telegram_bot_id', botId)
    .gt('telegram_chat_id', 0)
    .not('customer_id', 'is', null)

  const rows = (convs ?? []) as Array<{
    id: string
    telegram_chat_id: number
    customer_id: string | null
    chat_blocked: boolean
  }>

  const result: SubscriberSyncResult = {
    total: rows.length, checked: 0, blocked: 0, unblocked: 0, errors: 0,
  }

  for (const conv of rows) {
    try {
      const res = await sendChatAction(botToken, conv.telegram_chat_id, 'typing')
      result.checked++

      if (res?.ok) {
        // Чат доступен — если ранее был заблокирован, снимаем пометку
        if (conv.chat_blocked) {
          await supabase.from('chatbot_conversations')
            .update({ chat_blocked: false }).eq('id', conv.id)
          if (conv.customer_id) {
            await supabase.from('customers').update({
              bot_subscribed: true, bot_blocked: false,
            }).eq('id', conv.customer_id)
          }
          result.unblocked++
        }
      } else if (isUnreachable(res?.description)) {
        // Юзер заблокировал или удалил чат — если ранее не был помечен, помечаем
        if (!conv.chat_blocked) {
          await supabase.from('chatbot_conversations')
            .update({ chat_blocked: true }).eq('id', conv.id)
          if (conv.customer_id) {
            const isForbidden = (res.description || '').toLowerCase().includes('forbidden')
            await supabase.from('customers').update({
              bot_subscribed: false,
              bot_blocked: isForbidden,
              bot_blocked_at: new Date().toISOString(),
              bot_blocked_source: 'sync',
            }).eq('id', conv.customer_id)
          }
          result.blocked++
        }
      } else {
        // 429/500/etc — не наш случай, просто пропускаем
        result.errors++
      }
    } catch (err) {
      console.error('[sync-bot-subscribers] request failed:', err, 'conv:', conv.id)
      result.errors++
    }
    // Rate limit ~25 req/s чтобы не упереться в 30/s Telegram API
    await new Promise(r => setTimeout(r, 40))
  }

  return result
}
