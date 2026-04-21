import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /btn/<token>
 *
 * Прокси-редирект для URL-кнопок бота/лендинга.
 * Token — это `scenario_buttons.id` (или любой UUID с destination_url в БД).
 *
 * Ищем кнопку в scenario_buttons. Если это url-кнопка — логируем клик
 * (customer_id через query param ?c=UUID) и редиректим на action_url.
 *
 * Задержка ~30-80мс — отправляем 302 моментально, лог идёт fire-and-forget.
 */
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const url = new URL(request.url)
  const customerParam = url.searchParams.get('c') || null

  const supabase = getSupabase()
  // Простой запрос — без nested join, который раньше молча падал и ронял весь redirect
  const { data: btn, error: btnErr } = await supabase
    .from('scenario_buttons')
    .select('id, action_url, action_type, message_id')
    .eq('id', token)
    .maybeSingle()

  if (btnErr) console.error('[btn] lookup error:', btnErr.code, btnErr.message)
  if (!btn) console.warn(`[btn] not found token=${token}`)
  if (btn && !btn.action_url) console.warn(`[btn] found but action_url is empty id=${btn.id} type=${btn.action_type}`)

  if (!btn || !btn.action_url) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Если пользователь сохранил URL без схемы (например "t.me/channel") — Next.js
  // трактует это как относительный путь и редиректит на корень. Добавляем https://.
  let destination = btn.action_url.trim()
  if (!/^https?:\/\//i.test(destination) && !destination.startsWith('tg:')) {
    destination = 'https://' + destination.replace(/^\/+/, '')
  }

  // Fire-and-forget лог (не ждём) — projectId достаём отдельной цепочкой,
  // не блокируем редирект
  void (async () => {
    try {
      let projectId: string | undefined
      if (btn.message_id) {
        const { data: msg } = await supabase
          .from('scenario_messages')
          .select('scenario_id, chatbot_scenarios!inner(telegram_bot_id, telegram_bots!inner(project_id))')
          .eq('id', btn.message_id)
          .maybeSingle()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        projectId = (msg as any)?.chatbot_scenarios?.telegram_bots?.project_id
      }
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
      const ipHash = createHash('sha256').update(ip + (projectId ?? '')).digest('hex').slice(0, 16)
      await supabase.from('button_clicks').insert({
        project_id: projectId,
        button_id: btn.id,
        customer_id: customerParam,
        destination_url: destination,
        user_agent: request.headers.get('user-agent') || null,
        ip_hash: ipHash,
        referrer: request.headers.get('referer') || null,
      })
      if (customerParam && projectId) {
        await supabase.from('customer_actions').insert({
          customer_id: customerParam,
          project_id: projectId,
          action: 'button_click',
          data: { button_id: btn.id, destination_url: destination },
        })
      }
    } catch (err) {
      console.error('btn redirect log error:', err)
    }
  })()

  // 302 сразу, без ожидания лога
  return NextResponse.redirect(destination, { status: 302 })
}
