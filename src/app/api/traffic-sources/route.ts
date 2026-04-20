import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createChatInviteLink, getChat, getChatMember } from '@/lib/telegram'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** Парсит telegram-ссылку. Возвращает { kind, identifier } или null.
 *   kind='channel' → identifier = @username или +joinhash (joinlink)
 *   kind='bot' → identifier = @botusername
 *   null → не telegram
 */
function parseTelegramUrl(url: string): { kind: 'channel' | 'bot'; identifier: string } | null {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    if (!/^(t\.me|telegram\.me)$/i.test(u.hostname)) return null
    const path = u.pathname.replace(/^\//, '').replace(/\/$/, '')
    if (!path) return null
    // Join link: t.me/+ABC...
    if (path.startsWith('+')) return { kind: 'channel', identifier: path }
    // Bot: t.me/botname (оканчивается на _bot) — грубая эвристика
    if (path.toLowerCase().endsWith('bot')) return { kind: 'bot', identifier: '@' + path }
    // Public channel: t.me/channelname
    return { kind: 'channel', identifier: '@' + path }
  } catch {
    return null
  }
}

/** Делает invite-name в формате требуемом Telegram (до 32 симв., ASCII).
 *  Проверяет уникальность в пределах проекта, при коллизии добавляет суффикс. */
async function buildInviteName(supabase: ReturnType<typeof getSupabase>, projectId: string, slug: string): Promise<string> {
  const clean = `src_${slug}`.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 28)
  const candidate = clean || `src_${Date.now().toString(36)}`

  // Проверяем уникальность
  for (let attempt = 0; attempt < 5; attempt++) {
    const name = attempt === 0 ? candidate : `${candidate.slice(0, 24)}_${Math.random().toString(36).slice(2, 6)}`
    const { data } = await supabase
      .from('traffic_sources')
      .select('id')
      .eq('project_id', projectId)
      .eq('telegram_invite_name', name)
      .maybeSingle()
    if (!data) return name.slice(0, 32)
  }
  return `src_${Date.now().toString(36)}`
}

// GET /api/traffic-sources?projectId=...
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('traffic_sources')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/traffic-sources
export async function POST(request: NextRequest) {
  try {
    const { projectId, name, slug, destinationUrl, description } = await request.json()

    if (!projectId || !name || !slug || !destinationUrl) {
      return NextResponse.json({ error: 'projectId, name, slug, destinationUrl обязательны' }, { status: 400 })
    }

    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
    const supabase = getSupabase()

    // Авто-детект: если ссылка ведёт в Telegram-канал, пробуем сгенерить invite-link
    // через бот-админ этого проекта. Не нашли бот-админа — падаем на обычный режим.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extra: Record<string, any> = {}
    const parsed = parseTelegramUrl(destinationUrl)
    if (parsed && parsed.kind === 'channel') {
      // Берём первого активного бота проекта
      const { data: bots } = await supabase
        .from('telegram_bots')
        .select('id, token, bot_username')
        .eq('project_id', projectId)
        .eq('is_active', true)
        .limit(5)

      // Находим бот который админ этого канала
      for (const bot of bots ?? []) {
        try {
          const chat = await getChat(bot.token, parsed.identifier)
          if (!chat.ok) continue
          const chatId = chat.result.id
          // Проверяем что бот — админ
          const me = await fetch(`https://api.telegram.org/bot${bot.token}/getMe`).then(r => r.json())
          if (!me.ok) continue
          const member = await getChatMember(bot.token, chatId, me.result.id)
          const status = member?.result?.status
          const canInvite = member?.result?.can_invite_users ?? (status === 'administrator' || status === 'creator')
          if (!canInvite) continue

          // Генерим invite link
          const inviteName = await buildInviteName(supabase, projectId, cleanSlug)
          const invite = await createChatInviteLink(bot.token, chatId, { name: inviteName })
          if (!invite.ok) continue

          extra.telegram_bot_id = bot.id
          extra.telegram_channel_id = chatId
          extra.telegram_channel_title = chat.result.title ?? null
          extra.telegram_invite_link = invite.result.invite_link
          extra.telegram_invite_name = inviteName
          break
        } catch {
          // next bot
        }
      }
    }

    const { data, error } = await supabase
      .from('traffic_sources')
      .insert({
        project_id: projectId,
        name,
        slug: cleanSlug,
        destination_url: destinationUrl,
        description: description || null,
        ...extra,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Ссылка с таким slug уже существует' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      ...data,
      _invite_created: Boolean(extra.telegram_invite_link),
    })
  } catch (err) {
    console.error('traffic-sources POST error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
