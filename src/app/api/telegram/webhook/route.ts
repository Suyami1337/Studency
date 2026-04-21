import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendScenarioMessage } from '@/lib/scenario-sender'
import { evaluateAutoBoards } from '@/lib/crm-automation'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const body = await request.json()

    const botToken = request.nextUrl.searchParams.get('token')
    if (!botToken) return NextResponse.json({ error: 'No token' }, { status: 400 })

    // =============================================
    // HANDLE my_chat_member — подписка/блокировка бота ИЛИ добавление в канал как админа
    // =============================================
    if (body.my_chat_member) {
      const mcm = body.my_chat_member
      const chatType = mcm.chat?.type // 'private' | 'channel' | 'group' | 'supergroup'
      const newStatus = mcm.new_chat_member?.status
      const tgUserId = mcm.from?.id

      const { data: bot } = await supabase.from('telegram_bots').select('id, project_id, channel_id').eq('token', botToken).single()

      if (bot) {
        // ── Бота добавили/удалили как администратора канала ──
        if (chatType === 'channel' || chatType === 'supergroup') {
          const channelChatId = String(mcm.chat?.id ?? '')
          const channelUsername = mcm.chat?.username ?? null

          if (newStatus === 'administrator' || newStatus === 'creator') {
            // Автоматически привязываем канал к боту
            await supabase.from('telegram_bots').update({
              channel_id: channelChatId,
              channel_username: channelUsername ? `@${channelUsername}` : null,
            }).eq('id', bot.id)
            console.log(`Channel auto-linked: ${channelUsername ?? channelChatId} → bot ${bot.id}`)
          } else if (newStatus === 'left' || newStatus === 'kicked') {
            // Бота удалили из администраторов канала — отвязываем
            if (bot.channel_id === channelChatId) {
              await supabase.from('telegram_bots').update({
                channel_id: null, channel_username: null,
              }).eq('id', bot.id)
              console.log(`Channel auto-unlinked from bot ${bot.id}`)
            }
          }
          return NextResponse.json({ ok: true })
        }

        // ── Пользователь подписался/заблокировал бота (private chat) ──
        if (chatType === 'private' && tgUserId && newStatus) {
          const { data: customer } = await supabase.from('customers')
            .select('id').eq('telegram_id', String(tgUserId)).eq('project_id', bot.project_id).maybeSingle()
          if (customer) {
            if (newStatus === 'member') {
              await supabase.from('customers').update({
                bot_subscribed: true, bot_blocked: false,
                bot_subscribed_at: new Date().toISOString(),
              }).eq('id', customer.id)
              await supabase.from('customer_actions').insert({
                customer_id: customer.id, project_id: bot.project_id,
                action: 'bot_subscribed', data: {},
              })
            } else if (newStatus === 'kicked' || newStatus === 'left') {
              await supabase.from('customers').update({
                bot_subscribed: false, bot_blocked: newStatus === 'kicked',
                bot_blocked_at: new Date().toISOString(),
              }).eq('id', customer.id)
              await supabase.from('customer_actions').insert({
                customer_id: customer.id, project_id: bot.project_id,
                action: newStatus === 'kicked' ? 'bot_blocked' : 'bot_unsubscribed', data: {},
              })
            }
          }
        }
      }
      return NextResponse.json({ ok: true })
    }

    // =============================================
    // HANDLE chat_member — подписка/отписка на КАНАЛ
    // Создаёт customer если его нет в БД (человек подписался на канал
    // но никогда не писал боту — всё равно фиксируем).
    // =============================================
    if (body.chat_member) {
      const cm = body.chat_member
      const memberUser = cm.new_chat_member?.user ?? cm.from
      const tgUserId = memberUser?.id
      const tgUsername = memberUser?.username ?? null
      const tgFirstName = memberUser?.first_name ?? null
      const chatId = cm.chat?.id
      const newStatus = cm.new_chat_member?.status
      // Если подписался по именной invite link — Telegram шлёт её в событии
      const inviteLinkName: string | null = cm.invite_link?.name ?? null

      if (tgUserId && chatId && newStatus) {
        const { data: bot } = await supabase.from('telegram_bots')
          .select('project_id, channel_id')
          .eq('token', botToken)
          .single()

        // Ищем social_account для этого канала, чтобы привязать лог подписок
        const { data: socialAccount } = await supabase
          .from('social_accounts')
          .select('id')
          .eq('project_id', bot?.project_id ?? '')
          .eq('platform', 'telegram')
          .eq('external_id', String(chatId))
          .maybeSingle()

        if (bot && (bot.channel_id === String(chatId) || bot.channel_id === cm.chat?.username)) {
          // Находим источник трафика по invite_link.name (если есть)
          let sourceId: string | null = null
          let sourceSlug: string | null = null
          let sourceName: string | null = null
          if (inviteLinkName) {
            const { data: source } = await supabase.from('traffic_sources')
              .select('id, slug, name')
              .eq('project_id', bot.project_id)
              .eq('telegram_invite_name', inviteLinkName)
              .maybeSingle()
            if (source) {
              sourceId = source.id
              sourceSlug = source.slug
              sourceName = source.name
            }
          }

          const { data: customer } = await supabase.from('customers')
            .select('id, source_id').eq('telegram_id', String(tgUserId)).eq('project_id', bot.project_id).maybeSingle()

          if (!customer && (newStatus === 'member' || newStatus === 'creator' || newStatus === 'administrator')) {
            // Новый подписчик канала — создаём customer с источником если он пришёл по invite-link
            const { data: newCustomer } = await supabase.from('customers').insert({
              project_id: bot.project_id,
              telegram_id: String(tgUserId),
              telegram_username: tgUsername,
              full_name: tgFirstName,
              channel_subscribed: true,
              channel_subscribed_at: new Date().toISOString(),
              ...(sourceId ? { source_id: sourceId, source_slug: sourceSlug, source_name: sourceName } : {}),
            }).select('id').single()
            if (newCustomer) {
              await supabase.from('customer_actions').insert({
                customer_id: newCustomer.id, project_id: bot.project_id,
                action: 'channel_subscribed',
                data: { channel_id: String(chatId), auto_created: true, invite_link_name: inviteLinkName, source_id: sourceId },
              })
              // social_subscribers_log
              if (socialAccount) {
                await supabase.from('social_subscribers_log').insert({
                  account_id: socialAccount.id,
                  external_user_id: String(tgUserId),
                  username: tgUsername,
                  first_name: tgFirstName,
                  action: 'join',
                  invite_link_name: inviteLinkName,
                  customer_id: newCustomer.id,
                })
              }
              // Increment counter на source
              if (sourceId) {
                const { data: cur } = await supabase.from('traffic_sources').select('telegram_invite_member_count').eq('id', sourceId).single()
                await supabase.from('traffic_sources').update({
                  telegram_invite_member_count: (cur?.telegram_invite_member_count ?? 0) + 1,
                }).eq('id', sourceId)
              }
            }
          } else if (customer) {
            if (newStatus === 'member' || newStatus === 'creator' || newStatus === 'administrator') {
              await supabase.from('customers').update({
                channel_subscribed: true,
                channel_subscribed_at: new Date().toISOString(),
                ...(tgUsername ? { telegram_username: tgUsername } : {}),
                ...(tgFirstName ? { full_name: tgFirstName } : {}),
                // Привязываем source если его ещё не было
                ...(sourceId && !customer.source_id ? { source_id: sourceId, source_slug: sourceSlug, source_name: sourceName } : {}),
              }).eq('id', customer.id)
              await supabase.from('customer_actions').insert({
                customer_id: customer.id, project_id: bot.project_id,
                action: 'channel_subscribed',
                data: { channel_id: String(chatId), invite_link_name: inviteLinkName, source_id: sourceId },
              })
              if (socialAccount) {
                await supabase.from('social_subscribers_log').insert({
                  account_id: socialAccount.id,
                  external_user_id: String(tgUserId),
                  username: tgUsername,
                  first_name: tgFirstName,
                  action: 'join',
                  invite_link_name: inviteLinkName,
                  customer_id: customer.id,
                })
              }
            } else if (newStatus === 'left' || newStatus === 'kicked') {
              await supabase.from('customers').update({
                channel_subscribed: false,
                channel_left_at: new Date().toISOString(),
              }).eq('id', customer.id)
              await supabase.from('customer_actions').insert({
                customer_id: customer.id, project_id: bot.project_id,
                action: 'channel_unsubscribed', data: { channel_id: String(chatId) },
              })
              if (socialAccount) {
                await supabase.from('social_subscribers_log').insert({
                  account_id: socialAccount.id,
                  external_user_id: String(tgUserId),
                  username: tgUsername,
                  first_name: tgFirstName,
                  action: 'leave',
                  customer_id: customer.id,
                })
              }
            }
          }
        }

        // Проверяем pending_subscription_gates — если клиент ждал подписки
        // на этот канал, продолжаем цепочку со следующего сообщения.
        if (newStatus === 'member' || newStatus === 'creator' || newStatus === 'administrator') {
          const { data: pending } = await supabase
            .from('pending_subscription_gates')
            .select('id, conversation_id, gate_message_id, channel_telegram_id')
            .eq('telegram_user_id', tgUserId)
            .eq('channel_telegram_id', Number(chatId))
            .order('created_at', { ascending: false })

          for (const p of pending ?? []) {
            try {
              // Удаляем pending — используем один раз
              await supabase.from('pending_subscription_gates').delete().eq('id', p.id)

              const { data: gateMsg } = await supabase
                .from('scenario_messages')
                .select('next_message_id, scenario_id, gate_channel_account_id')
                .eq('id', p.gate_message_id)
                .single()

              // Логируем: клиент подписался после gate-приглашения
              if (bot?.project_id) {
                const { data: gateCustomer } = await supabase
                  .from('customers')
                  .select('id')
                  .eq('telegram_id', String(tgUserId))
                  .eq('project_id', bot.project_id)
                  .maybeSingle()
                if (gateCustomer) {
                  await supabase.from('customer_actions').insert({
                    customer_id: gateCustomer.id,
                    project_id: bot.project_id,
                    action: 'gate_subscribed',
                    data: {
                      gate_message_id: p.gate_message_id,
                      channel_account_id: gateMsg?.gate_channel_account_id ?? null,
                      channel_telegram_id: p.channel_telegram_id,
                    },
                  })
                }
              }

              if (!gateMsg?.next_message_id) continue

              const { sendScenarioMessage } = await import('@/lib/scenario-sender')
              await sendScenarioMessage(
                supabase as unknown as Parameters<typeof sendScenarioMessage>[0],
                botToken,
                tgUserId,
                gateMsg.next_message_id,
                p.conversation_id,
                tgUserId,
                gateMsg.scenario_id,
              )
            } catch (err) {
              console.error('resume after subscription gate error:', err)
            }
          }
        }
      }
      return NextResponse.json({ ok: true })
    }

    // =============================================
    // HANDLE message / callback_query (основной flow)
    // =============================================
    const isCallback = !!body.callback_query
    const message = isCallback ? body.callback_query.message : body.message
    if (!message) return NextResponse.json({ ok: true })

    const chatId = message.chat.id
    const userId = isCallback ? body.callback_query.from?.id : message.from?.id
    const username = isCallback ? body.callback_query.from?.username : message.from?.username
    const firstName = isCallback ? body.callback_query.from?.first_name : message.from?.first_name
    const text = isCallback ? '' : (message.text || '')
    const callbackData = isCallback ? body.callback_query.data : null

    // Find bot
    const { data: bot } = await supabase
      .from('telegram_bots')
      .select('*')
      .eq('token', botToken)
      .eq('is_active', true)
      .single()

    if (!bot) return NextResponse.json({ error: 'Bot not found' }, { status: 404 })

    const projectId = bot.project_id

    // Find or create conversation
    const { data: conversation } = await supabase
      .from('chatbot_conversations')
      .upsert({
        telegram_bot_id: bot.id,
        telegram_chat_id: chatId,
        telegram_user_id: userId,
        telegram_username: username,
        telegram_first_name: firstName,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'telegram_bot_id,telegram_chat_id' })
      .select()
      .single()

    if (!conversation) return NextResponse.json({ ok: true })

    // Save incoming
    if (text) {
      await supabase.from('chatbot_messages').insert({
        conversation_id: conversation.id,
        direction: 'incoming',
        content: text,
        telegram_message_id: message.message_id,
      })
    }

    // Cancel pending followups with cancel_on_reply=true on ANY user activity:
    // отправка текста (reply) ИЛИ клик по inline-кнопке (callback_query)
    if (text || isCallback) {
      const { data: pendingFollowups } = await supabase
        .from('followup_queue')
        .select('id, followup_id')
        .eq('conversation_id', conversation.id)
        .eq('status', 'pending')

      if (pendingFollowups && pendingFollowups.length > 0) {
        const followupIds = pendingFollowups.map((q: { followup_id: string }) => q.followup_id)
        const { data: cancelFollowups } = await supabase
          .from('message_followups')
          .select('id')
          .in('id', followupIds)
          .eq('cancel_on_reply', true)

        if (cancelFollowups && cancelFollowups.length > 0) {
          const cancelIds = cancelFollowups.map((f: { id: string }) => f.id)
          const queueIdsToCancel = pendingFollowups
            .filter((q: { followup_id: string }) => cancelIds.includes(q.followup_id))
            .map((q: { id: string }) => q.id)

          if (queueIdsToCancel.length > 0) {
            await supabase
              .from('followup_queue')
              .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
              .in('id', queueIdsToCancel)
          }
        }
      }
    }

    // Извлекаем source slug если пришёл /start src_SLUG
    let sourceSlugFromStart: string | null = null
    if (text.startsWith('/start src_')) {
      sourceSlugFromStart = text.replace('/start src_', '').trim().replace(/_/g, '-') || null
    }

    // Find or create customer (проверяем по telegram_id чтобы не плодить дубликаты)
    let customerId = conversation.customer_id
    if (!customerId) {
      // Сначала ищем existing customer по telegram_id (мог быть создан через подписку на канал)
      const { data: existingByTgId } = await supabase.from('customers')
        .select('id').eq('telegram_id', String(userId)).eq('project_id', projectId).maybeSingle()

      if (existingByTgId) {
        // Customer уже есть — привязываем к conversation, обновляем данные
        customerId = existingByTgId.id
        await supabase.from('chatbot_conversations').update({ customer_id: existingByTgId.id }).eq('id', conversation.id)
        await supabase.from('customers').update({
          telegram_username: username, full_name: firstName,
          bot_subscribed: true, bot_subscribed_at: new Date().toISOString(),
        }).eq('id', existingByTgId.id)
        await supabase.from('customer_actions').insert({
          customer_id: existingByTgId.id, project_id: projectId, action: 'bot_start',
          data: { bot_name: bot.name, telegram_username: username },
        })
        evaluateAutoBoards(supabase, {
          projectId, customerId: existingByTgId.id,
          eventType: 'bot_start',
          eventData: { bot_name: bot.name, bot_id: bot.id },
        }).catch(err => console.error('CRM auto error:', err))
      } else {
        // Новый customer
        const { data: customer } = await supabase
          .from('customers')
          .insert({
            project_id: projectId,
            telegram_id: String(userId),
            telegram_username: username,
            full_name: firstName,
            bot_subscribed: true,
            bot_subscribed_at: new Date().toISOString(),
          })
          .select()
          .single()

        if (customer) {
          customerId = customer.id
          await supabase.from('chatbot_conversations').update({ customer_id: customer.id }).eq('id', conversation.id)
          await supabase.from('customer_actions').insert({
            customer_id: customer.id, project_id: projectId, action: 'bot_start',
            data: { bot_name: bot.name, telegram_username: username },
          })

          evaluateAutoBoards(supabase, {
            projectId, customerId: customer.id,
            eventType: 'bot_start',
            eventData: { bot_name: bot.name, bot_id: bot.id },
          }).catch(err => console.error('CRM auto error:', err))
        }
        if (sourceSlugFromStart && customerId) {
          const { data: source } = await supabase
            .from('traffic_sources')
            .select('id, name, slug')
            .eq('project_id', projectId)
            .eq('slug', sourceSlugFromStart)
            .single()

          if (source) {
            await supabase.from('customers').update({
              source_id: source.id, source_slug: source.slug, source_name: source.name,
            }).eq('id', customer.id)
            await supabase.from('customer_actions').insert({
              customer_id: customer.id, project_id: projectId, action: 'source_linked',
              data: { source_name: source.name, source_slug: source.slug, via: 'bot_start' },
            })
          }
        }
      }
    } else if (sourceSlugFromStart && customerId) {
      const { data: existingCustomer } = await supabase
        .from('customers').select('source_id').eq('id', customerId).single()

      if (existingCustomer && !existingCustomer.source_id) {
        const { data: source } = await supabase
          .from('traffic_sources').select('id, name, slug')
          .eq('project_id', projectId).eq('slug', sourceSlugFromStart).single()

        if (source) {
          await supabase.from('customers').update({
            source_id: source.id, source_slug: source.slug, source_name: source.name,
          }).eq('id', customerId)
          await supabase.from('customer_actions').insert({
            customer_id: customerId, project_id: projectId, action: 'source_linked',
            data: { source_name: source.name, source_slug: source.slug, via: 'bot_start' },
          })
        }
      }
    }

    // Get all scenarios for this bot
    const { data: scenarios } = await supabase
      .from('chatbot_scenarios')
      .select('id')
      .eq('telegram_bot_id', bot.id)

    if (!scenarios || scenarios.length === 0) {
      return NextResponse.json({ ok: true })
    }

    const scenarioIds = scenarios.map(s => s.id)

    // =============================================
    // HANDLE BUTTON CALLBACK
    // =============================================
    if (callbackData && callbackData.startsWith('btn:')) {
      const buttonId = callbackData.replace('btn:', '')
      const { data: btn } = await supabase.from('scenario_buttons').select('*').eq('id', buttonId).single()

      if (btn) {
        if (customerId) {
          await supabase.from('customer_actions').insert({
            customer_id: customerId, project_id: projectId, action: 'bot_button_click',
            data: { button_text: btn.text, action_type: btn.action_type },
          })

          // CRM автоматизация — bot_button_click
          evaluateAutoBoards(supabase, {
            projectId, customerId,
            eventType: 'bot_button_click',
            eventData: { button_text: btn.text, button_id: btn.id, action_type: btn.action_type },
          }).catch(err => console.error('CRM auto error:', err))
        }

        if (btn.action_type === 'goto_message' && btn.action_goto_message_id) {
          await sendScenarioMessage(supabase, botToken, chatId, btn.action_goto_message_id, conversation.id, userId)
        } else if (btn.action_type === 'trigger' && btn.action_trigger_word) {
          const { data: triggerMsgs } = await supabase
            .from('scenario_messages').select('*')
            .in('scenario_id', scenarioIds).eq('is_start', true)
            .eq('trigger_word', btn.action_trigger_word).limit(1)

          if (triggerMsgs && triggerMsgs[0]) {
            await sendScenarioMessage(supabase, botToken, chatId, triggerMsgs[0].id, conversation.id, userId, triggerMsgs[0].scenario_id)
          }
        }
      }

      return NextResponse.json({ ok: true })
    }

    // =============================================
    // HANDLE TEXT MESSAGE — match trigger words
    // =============================================
    const { data: startMessages } = await supabase
      .from('scenario_messages').select('*')
      .in('scenario_id', scenarioIds).eq('is_start', true)

    const normalizedText = text.toLowerCase().trim()
    const matchedStart = (startMessages ?? []).find((m: { trigger_word: string }) =>
      m.trigger_word && normalizedText === m.trigger_word.toLowerCase().trim()
    )

    if (matchedStart) {
      await sendScenarioMessage(supabase, botToken, chatId, matchedStart.id, conversation.id, userId, matchedStart.scenario_id)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
