'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { AiAssistantButton, AiAssistantOverlay } from '@/components/ui/AiAssistant'
import { SkeletonList } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import RichTextEditor from '@/components/RichTextEditor'
import { MediaUpload } from '@/components/MediaUpload'

type Scenario = { id: string; name: string; status: string; telegram_bot_id: string | null; created_at: string }
type TelegramBot = { id: string; name: string; bot_username: string; is_active?: boolean }
type Message = {
  id: string; scenario_id: string; order_position: number; text: string | null
  is_start: boolean; trigger_word: string | null; is_followup: boolean
  delay_minutes: number; delay_unit: string; followup_condition: string | null
  next_message_id: string | null; parent_message_id: string | null
  media_type?: string | null; media_url?: string | null; media_file_name?: string | null
  media_id?: string | null
  is_subscription_gate?: boolean
  gate_channel_account_id?: string | null
  gate_button_label?: string | null
}
type Button = {
  id: string; message_id: string; order_position: number; text: string
  action_type: string; action_url: string | null; action_trigger_word: string | null
  action_goto_message_id: string | null
}
type Followup = {
  id: string; scenario_message_id: string; order_index: number
  delay_value: number; delay_unit: string
  text: string; channel: 'telegram' | 'email' | 'both'
  cancel_on_reply: boolean; is_active: boolean
  duplicate_to_email?: boolean
  media_id?: string | null; media_type?: string | null
  media_url?: string | null; media_file_name?: string | null
  created_at?: string
}


// =============================================
// FOLLOWUP CARD — чистый controlled-компонент, без своего черновика
// =============================================
function FollowupCard({ projectId, followup, index, onEdit, onDelete, allMessages }: {
  projectId: string
  followup: Followup; index: number
  onEdit: (id: string, data: Partial<Followup>) => void
  onDelete: (id: string) => void
  allMessages: Message[]
}) {
  const supabase = createClient()
  const [cardExpanded, setCardExpanded] = useState(true)
  const [buttons, setButtons] = useState<Button[]>([])
  const unitLabel = (u: string) => u === 'sec' ? 'сек' : u === 'min' ? 'мин' : u === 'hour' ? 'ч' : 'дн'

  const isTemp = followup.id.startsWith('temp-')

  useEffect(() => {
    if (isTemp) { setButtons([]); return }
    supabase.from('scenario_buttons').select('*').eq('followup_id', followup.id).order('order_position')
      .then(({ data }) => setButtons((data ?? []) as Button[]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followup.id])

  async function addFollowupButton() {
    if (isTemp) return
    const { data } = await supabase.from('scenario_buttons').insert({
      followup_id: followup.id,
      message_id: null,
      order_position: buttons.length,
      text: 'Кнопка',
      action_type: 'url',
    }).select().single()
    if (data) setButtons(prev => [...prev, data as Button])
  }

  async function updateFollowupButton(id: string, data: Partial<Button>) {
    setButtons(prev => prev.map(b => b.id === id ? { ...b, ...data } : b))
    await supabase.from('scenario_buttons').update(data).eq('id', id)
  }

  async function deleteFollowupButton(id: string) {
    setButtons(prev => prev.filter(b => b.id !== id))
    await supabase.from('scenario_buttons').delete().eq('id', id)
  }

  return (
    <div className={`rounded-lg border transition-colors ${followup.is_active ? 'bg-[#F8F7FF] border-[#6A55F8]/15' : 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Тоггл активности — через черновик, сохраняется кнопкой */}
        <button onClick={() => onEdit(followup.id, { is_active: !followup.is_active })}
          className={`w-7 h-4 rounded-full transition-colors relative flex-shrink-0 ${followup.is_active ? 'bg-[#6A55F8]' : 'bg-gray-300'}`}>
          <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${followup.is_active ? 'translate-x-3' : 'translate-x-0.5'}`} />
        </button>
        <span className={`text-xs font-semibold flex-1 min-w-0 ${followup.is_active ? 'text-[#6A55F8]' : 'text-gray-400'}`}>
          Дожим {index + 1}
          <span className="ml-1.5 font-normal text-gray-400">через {followup.delay_value} {unitLabel(followup.delay_unit)}</span>
          {!followup.is_active && <span className="ml-1.5 text-gray-400">(выкл.)</span>}
        </span>
        <button onClick={() => setCardExpanded(!cardExpanded)} className="text-gray-400 hover:text-gray-600 text-xs px-1">
          {cardExpanded ? '▲' : '▼'}
        </button>
        <button onClick={() => onDelete(followup.id)} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
      </div>

      {cardExpanded && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-[#6A55F8]/10">
          <div className="flex items-center gap-2 mt-2.5">
            <span className="text-xs text-gray-600 w-10 flex-shrink-0">Через</span>
            <input type="number" min="1" value={followup.delay_value}
              onChange={ev => onEdit(followup.id, { delay_value: parseInt(ev.target.value) || 1 })}
              className="w-16 px-2 py-1.5 rounded border border-gray-200 text-sm text-center focus:outline-none focus:border-[#6A55F8]" />
            <select value={followup.delay_unit} onChange={ev => onEdit(followup.id, { delay_unit: ev.target.value })}
              className="px-2 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:border-[#6A55F8]">
              <option value="sec">сек</option>
              <option value="min">мин</option>
              <option value="hour">час</option>
              <option value="day">дней</option>
            </select>
          </div>
          <RichTextEditor
            value={followup.text}
            onChange={(v) => onEdit(followup.id, { text: v })}
            placeholder={`Текст дожима ${index + 1}...`}
            rows={3}
          />
          {/* Медиа-вложение для дожима */}
          <MediaUpload
            projectId={projectId}
            mediaId={followup.media_id ?? null}
            mediaType={followup.media_type ?? null}
            mediaUrl={followup.media_url ?? null}
            mediaFileName={followup.media_file_name ?? null}
            onChange={(mid, mt, mu, mfn) => onEdit(followup.id, {
              media_id: mid, media_type: mt, media_url: mu, media_file_name: mfn,
            })}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 flex-shrink-0">Канал:</span>
            <div className="flex gap-1">
              {(['telegram', 'email', 'both'] as const).map(ch => (
                <button key={ch} onClick={() => onEdit(followup.id, { channel: ch })}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    followup.channel === ch ? 'bg-[#6A55F8] text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-[#6A55F8]/40'
                  }`}>
                  {ch === 'telegram' ? 'Telegram' : ch === 'email' ? 'Email' : 'Оба'}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={followup.cancel_on_reply}
              onChange={ev => onEdit(followup.id, { cancel_on_reply: ev.target.checked })}
              className="rounded border-gray-300 text-[#6A55F8] focus:ring-[#6A55F8]" />
            <span className="text-xs text-gray-600">Отменить, если пользователь ответит</span>
          </label>
          {!followup.cancel_on_reply && (
            <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-amber-50 border border-amber-200">
              <span className="text-amber-600 text-xs leading-tight">⚠️</span>
              <span className="text-[11px] text-amber-800 leading-tight">
                Дожим отправится даже если клиент уже ответил, нажал кнопку или перешёл дальше по сценарию
              </span>
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={followup.duplicate_to_email ?? false}
              onChange={ev => onEdit(followup.id, { duplicate_to_email: ev.target.checked })}
              className="rounded border-gray-300 text-[#6A55F8] focus:ring-[#6A55F8]" />
            <span className="text-xs text-gray-600">✉️ Дублировать на email клиента</span>
          </label>

          {/* Кнопки дожима — immediate save, как у обычного сообщения */}
          <div className="pt-2 border-t border-[#6A55F8]/10">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-700">Кнопки</label>
              {isTemp ? (
                <span className="text-[10px] text-gray-400">Сохрани дожим чтобы добавить кнопки</span>
              ) : (
                <button onClick={addFollowupButton} className="text-xs text-[#6A55F8] font-medium hover:underline">+ Добавить кнопку</button>
              )}
            </div>
            {!isTemp && buttons.length === 0 && (
              <p className="text-[11px] text-gray-400 py-1">Нет кнопок</p>
            )}
            {buttons.length > 0 && (
              <div className="space-y-2">
                {buttons.map(btn => (
                  <div key={btn.id} className="bg-white rounded-lg p-2.5 space-y-2 border border-gray-200">
                    <div className="flex items-center gap-2">
                      <input type="text" value={btn.text} onChange={ev => updateFollowupButton(btn.id, { text: ev.target.value })}
                        placeholder="Текст кнопки" className="flex-1 px-2 py-1.5 rounded border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
                      <button onClick={() => deleteFollowupButton(btn.id)} className="text-xs text-gray-400 hover:text-red-500">✕</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <select value={btn.action_type} onChange={ev => updateFollowupButton(btn.id, { action_type: ev.target.value })}
                        className="px-2 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:border-[#6A55F8]">
                        <option value="url">Ссылка</option>
                        <option value="trigger">Запустить кодовое слово</option>
                        <option value="goto_message">Перейти к сообщению</option>
                      </select>
                      {btn.action_type === 'url' && (
                        <input type="text" value={btn.action_url || ''} onChange={ev => updateFollowupButton(btn.id, { action_url: ev.target.value })}
                          placeholder="https://..." className="flex-1 px-2 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:border-[#6A55F8]" />
                      )}
                      {btn.action_type === 'trigger' && (
                        <input type="text" value={btn.action_trigger_word || ''} onChange={ev => updateFollowupButton(btn.id, { action_trigger_word: ev.target.value })}
                          placeholder="Кодовое слово..." className="flex-1 px-2 py-1.5 rounded border border-gray-200 text-xs font-mono focus:outline-none focus:border-[#6A55F8]" />
                      )}
                      {btn.action_type === 'goto_message' && (
                        <select value={btn.action_goto_message_id || ''} onChange={ev => updateFollowupButton(btn.id, { action_goto_message_id: ev.target.value || null })}
                          className="flex-1 px-2 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:border-[#6A55F8]">
                          <option value="">Выберите сообщение...</option>
                          {allMessages.map(m => (
                            <option key={m.id} value={m.id}>#{m.order_position + 1}: {(m.text || '').slice(0, 40)}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================
// FOLLOWUP SECTION — ref handle для сохранения из MessageCard
// =============================================
type FollowupSectionHandle = {
  save: () => Promise<void>
  discard: () => void
}

const FollowupSection = React.forwardRef<FollowupSectionHandle, {
  projectId: string
  messageId: string
  allMessages: Message[]
  onDirtyChange: (dirty: boolean) => void
}>(function FollowupSection({ projectId, messageId, allMessages, onDirtyChange }, ref) {
  const supabase = createClient()
  const [followups, setFollowups] = useState<Followup[]>([])
  const [savedFollowups, setSavedFollowups] = useState<Followup[]>([])
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [savedEnabled, setSavedEnabled] = useState(false)
  const [sectionCollapsed, setSectionCollapsed] = useState(true)

  useEffect(() => {
    supabase.from('message_followups').select('*').eq('scenario_message_id', messageId).order('order_index')
      .then(({ data }) => {
        const items = (data ?? []) as Followup[]
        setFollowups(items)
        setSavedFollowups(items)
        const hasFollowups = items.length > 0
        setEnabled(hasFollowups)
        setSavedEnabled(hasFollowups)
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId])

  function notifyDirty(ids: Set<string>, currentEnabled: boolean, currentSavedEnabled: boolean) {
    onDirtyChange(ids.size > 0 || currentEnabled !== currentSavedEnabled)
  }

  React.useImperativeHandle(ref, () => ({
    save: async () => {
      let currentFollowups = followups
      const { trackUsage, untrackUsage } = await import('@/lib/media-library')

      // Вставляем новые (temp) записи
      const tempIds = [...dirtyIds].filter(id => id.startsWith('temp-'))
      const realDirtyIds = [...dirtyIds].filter(id => !id.startsWith('temp-'))

      for (const tempId of tempIds) {
        const f = currentFollowups.find(f => f.id === tempId)
        if (!f) continue
        const { data, error } = await supabase.from('message_followups')
          .insert({
            scenario_message_id: f.scenario_message_id,
            order_index: f.order_index,
            delay_value: f.delay_value, delay_unit: f.delay_unit,
            text: f.text, channel: f.channel,
            cancel_on_reply: f.cancel_on_reply, is_active: f.is_active,
            duplicate_to_email: f.duplicate_to_email ?? false,
            media_id: f.media_id ?? null, media_type: f.media_type ?? null,
            media_url: f.media_url ?? null, media_file_name: f.media_file_name ?? null,
          })
          .select().single()
        if (error) console.error('insert followup error:', error)
        if (data) {
          currentFollowups = currentFollowups.map(cf => cf.id === tempId ? data as Followup : cf)
          // Трекаем media usage если есть
          if (f.media_id) {
            await trackUsage(supabase, f.media_id, 'followup', (data as Followup).id)
          }
        }
      }

      // Обновляем изменённые (real) записи
      for (const id of realDirtyIds) {
        const f = currentFollowups.find(f => f.id === id)
        if (!f) continue
        const prevMediaId = savedFollowups.find(sf => sf.id === id)?.media_id ?? null
        const newMediaId = f.media_id ?? null

        await supabase.from('message_followups').update({
          delay_value: f.delay_value, delay_unit: f.delay_unit,
          text: f.text, channel: f.channel, cancel_on_reply: f.cancel_on_reply, is_active: f.is_active,
          duplicate_to_email: f.duplicate_to_email ?? false,
          media_id: newMediaId, media_type: f.media_type ?? null,
          media_url: f.media_url ?? null, media_file_name: f.media_file_name ?? null,
        }).eq('id', id)

        // Обновляем media usages
        if (prevMediaId !== newMediaId) {
          if (prevMediaId) await untrackUsage(supabase, prevMediaId, 'followup', id)
          if (newMediaId) await trackUsage(supabase, newMediaId, 'followup', id)
        }
      }

      setFollowups(currentFollowups)
      setSavedFollowups(currentFollowups)
      setSavedEnabled(enabled)
      setDirtyIds(new Set())
      onDirtyChange(false)
    },
    discard: () => {
      setFollowups([...savedFollowups])
      setEnabled(savedEnabled)
      setDirtyIds(new Set())
      onDirtyChange(false)
    },
  }), [followups, dirtyIds, savedFollowups, enabled, savedEnabled, onDirtyChange])

  function editFollowup(id: string, updates: Partial<Followup>) {
    setFollowups(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f))
    setDirtyIds(prev => {
      const next = new Set(prev); next.add(id)
      notifyDirty(next, enabled, savedEnabled)
      return next
    })
  }

  function toggleEnabled() {
    const newEnabled = !enabled
    setEnabled(newEnabled)
    setSectionCollapsed(false)

    // Включаем и нет followup-ов — создаём temp-запись локально
    if (newEnabled && followups.length === 0) {
      const tempId = `temp-${Date.now()}`
      const tempFollowup: Followup = {
        id: tempId, scenario_message_id: messageId, order_index: 0,
        delay_value: 1, delay_unit: 'hour', text: '', channel: 'telegram',
        cancel_on_reply: true, is_active: true, created_at: new Date().toISOString(),
      }
      setFollowups([tempFollowup])
      setDirtyIds(prev => { const next = new Set(prev); next.add(tempId); return next })
    }

    notifyDirty(dirtyIds, newEnabled, savedEnabled)
  }

  function addFollowup() {
    if (followups.length >= 5) return
    const tempId = `temp-${Date.now()}`
    const tempFollowup: Followup = {
      id: tempId, scenario_message_id: messageId, order_index: followups.length,
      delay_value: 1, delay_unit: 'hour', text: '', channel: 'telegram',
      cancel_on_reply: true, is_active: true, created_at: new Date().toISOString(),
    }
    setFollowups(prev => [...prev, tempFollowup])
    setDirtyIds(prev => { const next = new Set(prev); next.add(tempId); return next })
    setSectionCollapsed(false) // раскрываем чтобы пользователь увидел новую запись
    onDirtyChange(true)
  }

  async function deleteFollowup(id: string) {
    const remaining = followups.filter(f => f.id !== id)
    setFollowups(remaining)
    const newDirty = new Set(dirtyIds); newDirty.delete(id)
    setDirtyIds(newDirty)

    if (!id.startsWith('temp-')) {
      setSavedFollowups(prev => prev.filter(f => f.id !== id))
      // Очищаем media usages для этого дожима
      const { untrackAllUsages } = await import('@/lib/media-library')
      await untrackAllUsages(supabase, 'followup', id)
      await supabase.from('message_followups').delete().eq('id', id)
    }

    if (remaining.length === 0) {
      setEnabled(false)
      notifyDirty(newDirty, false, savedEnabled)
    } else {
      notifyDirty(newDirty, enabled, savedEnabled)
    }
  }

  if (loading) return null

  const activeCount = followups.filter(f => f.is_active).length

  return (
    <div className="border-t border-gray-100 pt-4">
      <div className="flex items-center justify-between mb-2">
        <button onClick={toggleEnabled} className="flex items-center gap-2">
          <div className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 relative ${enabled ? 'bg-[#6A55F8]' : 'bg-gray-200'}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-xs font-semibold text-gray-700">🔔 Дожимы</span>
          {enabled && followups.length > 0 && (
            <span className="text-xs text-gray-400">{activeCount}/{followups.length} активных</span>
          )}
        </button>
        {enabled && (
          <div className="flex items-center gap-2">
            {followups.length < 5 && (
              <button onClick={addFollowup} className="text-xs text-[#6A55F8] font-medium hover:underline">+ Добавить</button>
            )}
            {followups.length > 0 && (
              <button onClick={() => setSectionCollapsed(!sectionCollapsed)}
                className="text-xs text-gray-400 hover:text-gray-600 px-1">
                {sectionCollapsed ? '▼ Показать' : '▲ Скрыть'}
              </button>
            )}
          </div>
        )}
      </div>
      {enabled && !sectionCollapsed && followups.length > 0 && (
        <div className="space-y-2">
          {followups.map((f, i) => (
            <FollowupCard key={f.id} projectId={projectId} followup={f} index={i}
              allMessages={allMessages}
              onEdit={editFollowup} onDelete={deleteFollowup} />
          ))}
        </div>
      )}
    </div>
  )
})

// Убирает HTML-теги из текста для компактного превью в списке/заголовке
function stripHtml(s: string): string {
  return s.replace(/<\/?[a-z][^>]*>/gi, '').replace(/\s+/g, ' ').trim()
}

// =============================================
// MESSAGE EDITOR (карточка сообщения)
// =============================================
function MessageCard({
  projectId, msg, buttons, allMessages, onUpdate, onDelete, onAddButton, onDeleteButton, onUpdateButton,
  initialExpanded = false,
  hideFollowups = false,
  displayNumber,
  onMoveUp, onMoveDown, canMoveUp = false, canMoveDown = false,
  isOrphan = false,
  // Модальный режим — раскрытое состояние выносится в overlay-модалку.
  // Используется из главного списка сценария (там же — пагинация prev/next).
  useModal = false,
  modalOpen,
  onOpenModal,
  onCloseModal,
  onModalPrev,
  onModalNext,
  canModalPrev = false,
  canModalNext = false,
  modalPositionLabel,
}: {
  projectId: string
  msg: Message; buttons: Button[]; allMessages: Message[]
  onUpdate: (id: string, data: Partial<Message>) => void
  onDelete: (id: string) => void
  onAddButton: (messageId: string) => void
  onDeleteButton: (id: string) => void
  onUpdateButton: (id: string, data: Partial<Button>) => void
  initialExpanded?: boolean
  hideFollowups?: boolean
  displayNumber?: number
  onMoveUp?: (id: string) => void
  onMoveDown?: (id: string) => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  isOrphan?: boolean
  useModal?: boolean
  modalOpen?: boolean
  onOpenModal?: () => void
  onCloseModal?: () => void
  onModalPrev?: () => void
  onModalNext?: () => void
  canModalPrev?: boolean
  canModalNext?: boolean
  modalPositionLabel?: string
}) {
  const supabase = createClient()
  const [localExpanded, setLocalExpanded] = useState(initialExpanded)
  // В modal-режиме состояние открытия контролируется родителем
  const expanded = useModal ? !!modalOpen : localExpanded
  const [draft, setDraft] = useState<Partial<Message>>({})
  const [followupsDirty, setFollowupsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const followupRef = React.useRef<FollowupSectionHandle>(null)
  // Локальный draft для кнопок — НИЧЕГО не пишется в БД до клика «Сохранить».
  const [buttonDraft, setButtonDraft] = useState<Record<string, Partial<Button>>>({})
  const [newButtons, setNewButtons] = useState<Array<{ tempId: string; data: Partial<Button> }>>([])
  const [deletedButtonIds, setDeletedButtonIds] = useState<Set<string>>(new Set())

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _suppress = { onAddButton, onDeleteButton, onUpdateButton } // оставлено для обратной совместимости — не используется внутри карточки

  // Когда props.buttons обновятся (после reload родителя), автоматически чистим
  // draft от полей, чьи значения уже совпадают с saved. Это устраняет race
  // condition при котором сразу после save UI мог моргнуть старым значением.
  React.useEffect(() => {
    setButtonDraft(prev => {
      let changed = false
      const next: typeof prev = {}
      for (const [id, data] of Object.entries(prev)) {
        const saved = buttons.find(b => b.id === id)
        if (!saved) { changed = true; continue }
        const filtered: Partial<Button> = {}
        let hasDiff = false
        for (const [k, v] of Object.entries(data)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((saved as any)[k] !== v) { (filtered as any)[k] = v; hasDiff = true }
        }
        if (hasDiff) next[id] = filtered
        else changed = true
      }
      return changed ? next : prev
    })
  }, [buttons])

  // Считаем что draft "грязный" только если хоть одно поле реально отличается
  // от saved. Это защищает от ложных isDirty=true когда save прошёл, но draft
  // ещё не успел очиститься useEffect'ом.
  const buttonDraftDirty = Object.entries(buttonDraft).some(([id, data]) => {
    const saved = buttons.find(b => b.id === id)
    if (!saved) return false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return Object.entries(data).some(([k, v]) => (saved as any)[k] !== v)
  })
  const buttonsDirty = buttonDraftDirty || newButtons.length > 0 || deletedButtonIds.size > 0
  const isDirty = Object.keys(draft).length > 0 || followupsDirty || buttonsDirty
  const e = { ...msg, ...draft } // effective message values

  // Effective список кнопок: saved минус удалённые + draft изменения + новые pending
  const effectiveButtons: Button[] = [
    ...buttons
      .filter(b => !deletedButtonIds.has(b.id))
      .map(b => ({ ...b, ...(buttonDraft[b.id] || {}) })),
    ...newButtons.map(nb => ({
      id: nb.tempId,
      message_id: msg.id,
      text: '',
      action_type: 'url' as const,
      action_url: null,
      action_trigger_word: null,
      action_goto_message_id: null,
      order_position: 0,
      ...(nb.data as Partial<Button>),
    } as Button)),
  ]

  function toggleExpanded() {
    if (useModal) {
      if (expanded) {
        if (isDirty && !confirm('Есть несохранённые изменения. Закрыть без сохранения?')) return
        handleDiscard()
        onCloseModal?.()
      } else {
        onOpenModal?.()
      }
    } else {
      // Закрытие inline-режима — тоже проверяем dirty
      if (expanded && isDirty && !confirm('Есть несохранённые изменения. Закрыть без сохранения?')) return
      if (expanded && isDirty) handleDiscard()
      setLocalExpanded(v => !v)
    }
  }

  // Предупреждение при попытке закрыть вкладку браузера с несохранёнными изменениями
  React.useEffect(() => {
    if (!isDirty) return
    function handler(ev: BeforeUnloadEvent) {
      ev.preventDefault()
      ev.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  function set(data: Partial<Message>) {
    setDraft(prev => ({ ...prev, ...data }))
  }

  // Локальные операции с кнопками — пишут только в локальный state, БД не трогают
  function localUpdateButton(id: string, data: Partial<Button>) {
    if (id.startsWith('temp-btn-')) {
      setNewButtons(prev => prev.map(nb => nb.tempId === id ? { ...nb, data: { ...nb.data, ...data } } : nb))
    } else {
      setButtonDraft(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...data } }))
    }
  }
  function localAddButton(_messageId?: string) {
    const tempId = `temp-btn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setNewButtons(prev => [...prev, {
      tempId,
      data: { text: '', action_type: 'url', action_url: '' },
    }])
  }
  function localDeleteButton(id: string) {
    if (id.startsWith('temp-btn-')) {
      setNewButtons(prev => prev.filter(nb => nb.tempId !== id))
    } else {
      setDeletedButtonIds(prev => {
        const next = new Set(prev)
        next.add(id)
        return next
      })
      // также чистим любые draft изменения для этой кнопки
      setButtonDraft(prev => {
        if (!prev[id]) return prev
        const c = { ...prev }
        delete c[id]
        return c
      })
    }
  }

  async function handleSave() {
    if (!isDirty) return
    setSaving(true)

    // 1. Message updates
    if (Object.keys(draft).length > 0) {
      const updates = {
        text: e.text, is_start: e.is_start, trigger_word: e.trigger_word,
        next_message_id: e.next_message_id, delay_minutes: e.delay_minutes, delay_unit: e.delay_unit,
        media_type: e.media_type ?? null, media_url: e.media_url ?? null,
        media_file_name: e.media_file_name ?? null, media_id: e.media_id ?? null,
        is_subscription_gate: !!e.is_subscription_gate,
        gate_channel_account_id: e.gate_channel_account_id ?? null,
        gate_button_label: e.gate_button_label ?? null,
      }
      if (!msg.id.startsWith('temp-')) {
        await supabase.from('scenario_messages').update(updates).eq('id', msg.id)

        // Media library usage tracking
        const prevMediaId = msg.media_id ?? null
        const newMediaId = e.media_id ?? null
        if (prevMediaId !== newMediaId) {
          const { untrackUsage, trackUsage } = await import('@/lib/media-library')
          if (prevMediaId) await untrackUsage(supabase, prevMediaId, 'scenario_message', msg.id)
          if (newMediaId) await trackUsage(supabase, newMediaId, 'scenario_message', msg.id)
        }
      }
      onUpdate(msg.id, updates)
      setDraft({})
    }

    // 2. Buttons — insert новых, update изменённых, delete удалённых (только если msg уже в БД)
    if (buttonsDirty && !msg.id.startsWith('temp-')) {
      // delete первыми чтобы не было constraint conflicts если пересоздаются с тем же текстом
      for (const id of deletedButtonIds) {
        await supabase.from('scenario_buttons').delete().eq('id', id)
      }
      for (const [id, data] of Object.entries(buttonDraft)) {
        if (Object.keys(data).length === 0) continue
        await supabase.from('scenario_buttons').update(data).eq('id', id)
      }
      // insert новых — берём максимальный order_position у оставшихся как стартовый offset
      const maxPos = effectiveButtons
        .filter(b => !b.id.startsWith('temp-btn-'))
        .reduce((m, b) => Math.max(m, b.order_position ?? 0), -1)
      let pos = maxPos + 1
      for (const nb of newButtons) {
        const text = (nb.data.text ?? '').toString().trim()
        if (!text) { pos++; continue } // пустые кнопки не сохраняем
        await supabase.from('scenario_buttons').insert({
          message_id: msg.id,
          text,
          action_type: nb.data.action_type ?? 'url',
          action_url: nb.data.action_url ?? null,
          action_trigger_word: nb.data.action_trigger_word ?? null,
          action_goto_message_id: nb.data.action_goto_message_id ?? null,
          order_position: pos,
        })
        pos++
      }
      // newButtons и deletedButtonIds сразу чистим — они не имеют смысла после save.
      // buttonDraft НЕ чистим — useEffect почистит сам когда parent.load() вернёт
      // обновлённые buttons. Это исключает race condition с моргающим UI.
      setNewButtons([])
      setDeletedButtonIds(new Set())
      // триггерим reload родителя — новые кнопки получат реальные id
      onUpdate(msg.id, {})
    }

    // 3. Followups
    if (followupsDirty) {
      await followupRef.current?.save()
    }

    setSaving(false)
  }

  function handleDiscard() {
    setDraft({})
    setButtonDraft({})
    setNewButtons([])
    setDeletedButtonIds(new Set())
    followupRef.current?.discard()
  }

  async function handleSaveAndClose() {
    await handleSave()
    onCloseModal?.()
  }

  const typeLabel = e.is_start ? '⭐ Стартовое' : '💬 Сообщение'
  const typeColor = e.is_start ? 'bg-green-100 text-green-700 border-green-200' : 'bg-blue-100 text-blue-700 border-blue-200'

  // В модальном режиме граница карточки подсвечивается открытым только если modalOpen
  const borderClass = isOrphan ? 'border-red-300'
    : (expanded && !useModal) ? 'border-[#6A55F8]/40 shadow-sm'
    : isDirty ? 'border-amber-300' : 'border-gray-100'

  return (
    <div className={`bg-white rounded-xl border ${borderClass} transition-all`}>
      {/* Header — always visible */}
      <div className="flex items-center gap-3 px-5 py-4 cursor-pointer" onClick={toggleExpanded}>
        {(onMoveUp || onMoveDown) && (
          <div className="flex flex-col items-center -my-2" onClick={ev => ev.stopPropagation()}>
            <button
              type="button"
              onClick={() => canMoveUp && onMoveUp?.(msg.id)}
              disabled={!canMoveUp}
              title="Переместить вверх"
              className="w-6 h-5 flex items-center justify-center text-gray-400 hover:text-[#6A55F8] hover:bg-[#F0EDFF] rounded disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-gray-400 disabled:cursor-not-allowed text-[10px]"
            >▲</button>
            <button
              type="button"
              onClick={() => canMoveDown && onMoveDown?.(msg.id)}
              disabled={!canMoveDown}
              title="Переместить вниз"
              className="w-6 h-5 flex items-center justify-center text-gray-400 hover:text-[#6A55F8] hover:bg-[#F0EDFF] rounded disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-gray-400 disabled:cursor-not-allowed text-[10px]"
            >▼</button>
          </div>
        )}
        <div className="w-8 h-8 rounded-lg bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8]">
          {displayNumber ?? msg.order_position + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${typeColor}`}>{typeLabel}</span>
            {isOrphan && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200">
                ⚠️ никто не ведёт
              </span>
            )}
            {msg.is_subscription_gate && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${msg.gate_channel_account_id ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                🚪 {msg.gate_channel_account_id ? 'Gate (сохранено в БД)' : 'Gate — канал не выбран!'}
              </span>
            )}
            {!msg.is_subscription_gate && e.is_subscription_gate && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                🚪 Gate включён, но не сохранён!
              </span>
            )}
            {e.trigger_word && <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-mono">{e.trigger_word}</span>}
            {e.delay_minutes > 0 && <span className="text-xs text-gray-400">⏱ {e.delay_minutes} {e.delay_unit === 'sec' ? 'сек' : e.delay_unit === 'hour' ? 'ч' : e.delay_unit === 'day' ? 'дн' : 'мин'}</span>}
            {isDirty && <span className="text-xs text-amber-600 font-medium">● Не сохранено</span>}
          </div>
          <p className="text-sm text-gray-700 truncate">{e.text ? stripHtml(e.text) : 'Пустое сообщение'}</p>
        </div>
        <div className="flex items-center gap-2">
          {buttons.length > 0 && <span className="text-xs text-gray-400">{buttons.length} кнопок</span>}
          <span className="text-gray-400 text-sm">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded editor — inline ИЛИ модалка */}
      {expanded && !useModal && (
        <ExpandedEditor
          projectId={projectId}
          msg={msg}
          e={e}
          set={set}
          buttons={effectiveButtons}
          allMessages={allMessages}
          onAddButton={localAddButton}
          onDeleteButton={localDeleteButton}
          onUpdateButton={localUpdateButton}
          hideFollowups={hideFollowups}
          followupRef={followupRef}
          setFollowupsDirty={setFollowupsDirty}
          isDirty={isDirty}
          saving={saving}
          onSave={handleSave}
          onDiscard={handleDiscard}
          onDelete={() => {
            if (confirm('Удалить это сообщение? Все кнопки и дожимы, привязанные к нему, тоже удалятся. Действие необратимо.')) {
              onDelete(msg.id)
            }
          }}
        />
      )}
      {expanded && useModal && (
        <MessageEditorModal
          title={`${typeLabel} #${displayNumber ?? msg.order_position + 1}`}
          positionLabel={modalPositionLabel}
          onClose={() => {
            if (isDirty && !confirm('Есть несохранённые изменения. Закрыть без сохранения?')) return
            handleDiscard()
            onCloseModal?.()
          }}
          onPrev={() => {
            if (isDirty && !confirm('Есть несохранённые изменения. Перейти к другому сообщению без сохранения?')) return
            handleDiscard()
            onModalPrev?.()
          }}
          onNext={() => {
            if (isDirty && !confirm('Есть несохранённые изменения. Перейти к другому сообщению без сохранения?')) return
            handleDiscard()
            onModalNext?.()
          }}
          canPrev={canModalPrev}
          canNext={canModalNext}
          isDirty={isDirty}
          saving={saving}
          onSave={handleSaveAndClose}
        >
          <ExpandedEditor
            projectId={projectId}
            msg={msg}
            e={e}
            set={set}
            buttons={effectiveButtons}
            allMessages={allMessages}
            onAddButton={localAddButton}
            onDeleteButton={localDeleteButton}
            onUpdateButton={localUpdateButton}
            hideFollowups={hideFollowups}
            followupRef={followupRef}
            setFollowupsDirty={setFollowupsDirty}
            isDirty={isDirty}
            saving={saving}
            onSave={handleSave}
            onDiscard={handleDiscard}
            onDelete={() => {
              if (confirm('Удалить это сообщение? Все кнопки и дожимы, привязанные к нему, тоже удалятся. Действие необратимо.')) {
                onDelete(msg.id)
                onCloseModal?.()
              }
            }}
            hideFooter
          />
        </MessageEditorModal>
      )}
    </div>
  )
}

// =============================================
// MESSAGE EDITOR MODAL — обёртка для раскрытого редактора сообщения
// =============================================
function MessageEditorModal({ title, positionLabel, onClose, onPrev, onNext, canPrev, canNext, isDirty, saving, onSave, children }: {
  title: string
  positionLabel?: string
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  canPrev: boolean
  canNext: boolean
  isDirty: boolean
  saving: boolean
  onSave: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[92vh] overflow-hidden flex flex-col" onClick={ev => ev.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button type="button" onClick={onPrev} disabled={!canPrev}
              title="Предыдущее сообщение"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent">◀</button>
            <button type="button" onClick={onNext} disabled={!canNext}
              title="Следующее сообщение"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent">▶</button>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-gray-900 truncate">{title}</h3>
            {positionLabel && <p className="text-[11px] text-gray-400 mt-0.5">{positionLabel}</p>}
          </div>
          {isDirty && (
            <button type="button" onClick={onSave} disabled={saving}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#6A55F8] text-white hover:bg-[#5A45E8] disabled:opacity-50">
              {saving ? 'Сохраняю…' : 'Сохранить'}
            </button>
          )}
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </div>
  )
}

// =============================================
// EXPANDED EDITOR — вынесенный контент редактора (inline / modal)
// =============================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ExpandedEditor({ projectId, msg, e, set, buttons, allMessages, onAddButton, onDeleteButton, onUpdateButton, hideFollowups, followupRef, setFollowupsDirty, isDirty, saving, onSave, onDiscard, onDelete, hideFooter = false }: {
  projectId: string
  msg: Message
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  e: any
  set: (data: Partial<Message>) => void
  buttons: Button[]
  allMessages: Message[]
  onAddButton: (messageId: string) => void
  onDeleteButton: (id: string) => void
  onUpdateButton: (id: string, data: Partial<Button>) => void
  hideFollowups: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  followupRef: React.RefObject<any>
  setFollowupsDirty: (v: boolean) => void
  isDirty: boolean
  saving: boolean
  onSave: () => void
  onDiscard: () => void
  onDelete: () => void
  hideFooter?: boolean
}) {
  return (
    <div className={`${hideFooter ? '' : 'px-5 pb-5 border-t border-gray-100 pt-4'} space-y-4`}>
      {/* Text */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Текст сообщения</label>
        <RichTextEditor
          value={e.text || ''}
          onChange={(v) => set({ text: v })}
          placeholder="Введите текст сообщения..."
          rows={5}
        />
      </div>

          {/* Media attachment */}
          <MediaUpload
            projectId={projectId}
            mediaId={e.media_id ?? null}
            mediaType={e.media_type ?? null}
            mediaUrl={e.media_url ?? null}
            mediaFileName={e.media_file_name ?? null}
            onChange={(mid, mt, mu, mfn) => set({ media_id: mid, media_type: mt, media_url: mu, media_file_name: mfn })}
          />

          {/* Type settings */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={e.is_start} onChange={ev => set({ is_start: ev.target.checked })}
                className="rounded border-gray-300 text-[#6A55F8] focus:ring-[#6A55F8]" />
              <span className="text-xs font-medium text-gray-700">⭐ Стартовое сообщение</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={!!e.is_subscription_gate} onChange={ev => set({ is_subscription_gate: ev.target.checked })}
                className="rounded border-gray-300 text-[#6A55F8] focus:ring-[#6A55F8]" />
              <span className="text-xs font-medium text-gray-700">🚪 Проверка подписки на канал</span>
            </label>
          </div>

          {/* Gate: выбор канала */}
          {e.is_subscription_gate && (
            <div className="space-y-2">
              <GateChannelSelect projectId={projectId} value={e.gate_channel_account_id ?? null} onChange={v => set({ gate_channel_account_id: v })} />
              {e.gate_channel_account_id && !e.next_message_id && (
                <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-2.5">
                  ⚠️ Укажи «↓ Следующее сообщение» — туда бот отправит клиента после подписки.
                </div>
              )}
            </div>
          )}

          {/* Trigger word (if start) */}
          {e.is_start && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Кодовое слово (триггер)</label>
              <input type="text" value={e.trigger_word || ''} onChange={ev => set({ trigger_word: ev.target.value })}
                placeholder="/start, привет, любое слово..."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:border-[#6A55F8]" />
            </div>
          )}

          {/* Buttons — immediate save (add/delete/edit) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">Кнопки</label>
              <button onClick={() => onAddButton(msg.id)} className="text-xs text-[#6A55F8] font-medium hover:underline">+ Добавить кнопку</button>
            </div>
            {/* Gate: захардкоженная кнопка "Подписаться" — нельзя удалить или поменять URL */}
            {e.is_subscription_gate && e.gate_channel_account_id && (
              <div className="bg-purple-50 rounded-lg p-3 border border-purple-200 mb-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs">🔒</span>
                  <input type="text" value={e.gate_button_label ?? 'Подписаться'}
                    onChange={ev => set({ gate_button_label: ev.target.value })}
                    placeholder="Подписаться"
                    className="flex-1 px-2 py-1.5 rounded border border-purple-200 text-sm focus:outline-none focus:border-[#6A55F8] bg-white" />
                </div>
                <p className="text-[11px] text-purple-700">
                  Автоматическая кнопка подписки. Меняется только текст — ссылка собирается сама из выбранного канала.
                </p>
              </div>
            )}
            {buttons.length === 0 && !(e.is_subscription_gate && e.gate_channel_account_id) ? (
              <p className="text-xs text-gray-400 py-2">Нет кнопок</p>
            ) : buttons.length === 0 ? null : (
              <div className="space-y-2">
                {buttons.map(btn => (
                  <div key={btn.id} className="bg-gray-50 rounded-lg p-3 space-y-2 border border-gray-100">
                    <div className="flex items-center gap-2">
                      <input type="text" value={btn.text} onChange={ev => onUpdateButton(btn.id, { text: ev.target.value })}
                        placeholder="Текст кнопки" className="flex-1 px-2 py-1.5 rounded border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
                      <button onClick={() => onDeleteButton(btn.id)} className="text-xs text-gray-400 hover:text-red-500">✕</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <select value={btn.action_type} onChange={ev => onUpdateButton(btn.id, { action_type: ev.target.value })}
                        className="px-2 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:border-[#6A55F8]">
                        <option value="url">Ссылка</option>
                        <option value="trigger">Запустить кодовое слово</option>
                        <option value="goto_message">Перейти к сообщению</option>
                      </select>
                      {btn.action_type === 'url' && (
                        <input type="text" value={btn.action_url || ''} onChange={ev => onUpdateButton(btn.id, { action_url: ev.target.value })}
                          placeholder="https://..." className="flex-1 px-2 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:border-[#6A55F8]" />
                      )}
                      {btn.action_type === 'trigger' && (
                        <input type="text" value={btn.action_trigger_word || ''} onChange={ev => onUpdateButton(btn.id, { action_trigger_word: ev.target.value })}
                          placeholder="Кодовое слово..." className="flex-1 px-2 py-1.5 rounded border border-gray-200 text-xs font-mono focus:outline-none focus:border-[#6A55F8]" />
                      )}
                      {btn.action_type === 'goto_message' && (
                        <select value={btn.action_goto_message_id || ''} onChange={ev => onUpdateButton(btn.id, { action_goto_message_id: ev.target.value || null })}
                          className="flex-1 px-2 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:border-[#6A55F8]">
                          <option value="">Выберите сообщение...</option>
                          {allMessages.filter(m => m.id !== msg.id).map(m => (
                            <option key={m.id} value={m.id}>#{m.order_position + 1}: {(m.text || '').slice(0, 40)}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Next message link */}
          <div className="bg-[#F8F7FF] rounded-lg p-3 border border-[#6A55F8]/10">
            <label className="block text-xs font-medium text-[#6A55F8] mb-2">↓ Следующее сообщение</label>
            <div className="flex items-center gap-3">
              <select
                value={e.next_message_id || ''}
                onChange={ev => set({ next_message_id: ev.target.value || null })}
                className="flex-1 px-2 py-1.5 rounded border border-[#6A55F8]/20 text-sm focus:outline-none focus:border-[#6A55F8] bg-white"
              >
                <option value="">Нет (конец цепочки)</option>
                {allMessages.filter(m => m.id !== msg.id).map(m => (
                  <option key={m.id} value={m.id}>
                    #{m.order_position + 1}: {m.is_start ? '⭐' : '💬'} {(m.text || 'Пустое').slice(0, 50)}
                  </option>
                ))}
              </select>
              {e.next_message_id && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-gray-500">через</span>
                  <input type="number" min="0"
                    value={e.delay_minutes}
                    onChange={ev => set({ delay_minutes: parseInt(ev.target.value) || 0 })}
                    className="w-16 px-2 py-1.5 rounded border border-gray-200 text-sm text-center focus:outline-none focus:border-[#6A55F8]"
                  />
                  <select value={e.delay_unit || 'min'} onChange={ev => set({ delay_unit: ev.target.value })}
                    className="px-2 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:border-[#6A55F8]">
                    <option value="sec">сек</option>
                    <option value="min">мин</option>
                    <option value="hour">час</option>
                    <option value="day">дней</option>
                  </select>
                </div>
              )}
            </div>
            {!e.next_message_id && buttons.length > 0 && (
              <p className="text-[10px] text-gray-400 mt-1.5">Кнопки уже настраивают переходы. Следующее сообщение нужно только для линейной цепочки.</p>
            )}
          </div>

          {/* Followups */}
          {!hideFollowups && (
            <FollowupSection ref={followupRef} projectId={projectId} messageId={msg.id} allMessages={allMessages} onDirtyChange={setFollowupsDirty} />
          )}

          {/* Save / Discard / Delete */}
          {!hideFooter && (
            <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
              <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600 hover:underline">
                Удалить сообщение
              </button>
              {isDirty && (
                <div className="flex items-center gap-2">
                  <button onClick={onDiscard} className="px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100">Отменить</button>
                  <button onClick={onSave} disabled={saving}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#6A55F8] text-white hover:bg-[#5A45E8] disabled:opacity-50">
                    {saving ? 'Сохраняю...' : 'Сохранить'}
                  </button>
                </div>
              )}
            </div>
          )}
          {hideFooter && (
            <div className="pt-3 border-t border-gray-100">
              <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600 hover:underline">
                Удалить сообщение
              </button>
            </div>
          )}
    </div>
  )
}

// =============================================
// EVENT TRIGGERS TAB — триггер = событие + immediate + дожимы
// =============================================
type EventTrigger = {
  id: string
  event_type: string
  event_name: string | null
  source: string | null
  start_message_id: string
  is_negative: boolean
  enabled: boolean
  wait_minutes: number
  wait_value: number
  wait_unit: string
  event_params: Record<string, unknown>
  cancel_on_event_type: string | null
  cancel_on_event_name: string | null
  label: string | null
  group_id: string | null
  sort_in_group: number
}

type TargetKind = 'video' | 'landing' | 'product' | 'channel' | 'form' | null

type EventTypeDef = {
  key: string
  label: string
  emoji: string
  targetKind: TargetKind
  cancelOnEventType?: string
  extraParams?: Array<{ key: string; label: string; suffix?: string; default?: number }>
}

const EVENT_TYPE_DEFS: EventTypeDef[] = [
  { key: 'video_start',    label: 'Начал смотреть видео',     emoji: '▶️', targetKind: 'video',   cancelOnEventType: 'video_complete' },
  { key: 'video_progress', label: 'Досмотрел видео до X%',     emoji: '📊', targetKind: 'video',   cancelOnEventType: 'video_complete', extraParams: [{ key: 'minPercent', label: 'Процент', suffix: '%', default: 50 }] },
  { key: 'video_complete', label: 'Досмотрел видео до конца',   emoji: '✅', targetKind: 'video' },
  { key: 'landing_visit',  label: 'Зашёл на сайт',              emoji: '🌐', targetKind: 'landing', cancelOnEventType: 'order_created' },
  { key: 'form_submit',    label: 'Отправил форму',             emoji: '📝', targetKind: 'form' },
  { key: 'channel_joined', label: 'Подписался на канал',        emoji: '📣', targetKind: 'channel' },
  { key: 'order_created',  label: 'Создал заказ',               emoji: '🛒', targetKind: 'product', cancelOnEventType: 'order_paid' },
  { key: 'order_paid',     label: 'Оплатил заказ',              emoji: '💰', targetKind: 'product' },
]

// legacy, keep for agent compatibility
const TRIGGER_PRESETS: Array<{ key: string; label: string; emoji: string; isNegative: boolean; eventType: string; targetKind: TargetKind; defaultWaitMinutes?: number; extraParams?: Array<{ key: string; label: string; suffix?: string; default?: number }>; cancelOnEventType?: string; description: string }> = [
  // ПОЗИТИВНЫЕ
  { key: 'video_start',    label: 'Начал смотреть видео',       emoji: '▶️', isNegative: false, eventType: 'video_start',    targetKind: 'video',   description: 'Клиент запустил видео' },
  { key: 'video_percent',  label: 'Досмотрел видео до X%',       emoji: '📊', isNegative: false, eventType: 'video_progress', targetKind: 'video',   extraParams: [{ key: 'minPercent', label: 'Процент', suffix: '%', default: 50 }], description: 'Дошёл до заданного процента' },
  { key: 'video_complete', label: 'Досмотрел видео до конца',    emoji: '✅', isNegative: false, eventType: 'video_complete', targetKind: 'video',   description: 'Видео просмотрено полностью' },
  { key: 'landing_visit',  label: 'Зашёл на сайт',               emoji: '🌐', isNegative: false, eventType: 'landing_visit',  targetKind: 'landing', description: 'Открыл лендинг' },
  { key: 'form_submit',    label: 'Отправил форму',              emoji: '📝', isNegative: false, eventType: 'form_submit',    targetKind: 'form',    description: 'Заполнил форму' },
  { key: 'channel_joined', label: 'Подписался на канал',         emoji: '📣', isNegative: false, eventType: 'channel_joined', targetKind: 'channel', description: 'Вступил в Telegram-канал' },
  { key: 'order_created',  label: 'Создал заказ',                emoji: '🛒', isNegative: false, eventType: 'order_created',  targetKind: 'product', description: 'Оформил заказ (не факт что оплатил)' },
  { key: 'order_paid',     label: 'Оплатил заказ',               emoji: '💰', isNegative: false, eventType: 'order_paid',     targetKind: 'product', description: 'Заказ успешно оплачен' },
  // НЕГАТИВНЫЕ
  { key: 'video_started_not_completed', label: 'Начал видео, но НЕ досмотрел', emoji: '⏸️', isNegative: true, eventType: 'video_start', cancelOnEventType: 'video_complete', targetKind: 'video', defaultWaitMinutes: 180, description: 'Через N минут после старта, если видео не досмотрено до конца' },
  { key: 'landing_not_ordered',         label: 'Зашёл на сайт, но НЕ создал заказ', emoji: '🚪', isNegative: true, eventType: 'landing_visit', cancelOnEventType: 'order_created', targetKind: 'landing', defaultWaitMinutes: 360, description: 'Через N минут после визита, если не оформил заказ' },
  { key: 'order_not_paid',              label: 'Создал заказ, но НЕ оплатил',        emoji: '💸', isNegative: true, eventType: 'order_created', cancelOnEventType: 'order_paid', targetKind: 'product', defaultWaitMinutes: 30, description: 'Через N минут после создания заказа, если не оплачен' },
]

type VideoOpt = { id: string; title: string }
type LandingOpt = { id: string; name: string; slug: string }
type ProductOpt = { id: string; name: string }

type TriggerGroup = {
  id: string
  label: string
  eventType: string
  targetId: string
  extraParams: Record<string, unknown>
  triggers: EventTrigger[]
  messages: Message[]
}

function EventTriggersTab({ scenarioId, projectId }: { scenarioId: string; messages: Message[]; projectId: string }) {
  const supabase = createClient()
  const [groups, setGroups] = useState<TriggerGroup[]>([])
  const [allButtons, setAllButtons] = useState<Button[]>([])
  const [loading, setLoading] = useState(true)
  const [videos, setVideos] = useState<VideoOpt[]>([])
  const [landings, setLandings] = useState<LandingOpt[]>([])
  const [products, setProducts] = useState<ProductOpt[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // New group creation form — упрощённая: только имя+тип+источник+галочки,
  // тексты/медиа/кнопки/тайминги задаются после создания в полноценных карточках
  const [creating, setCreating] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newEventType, setNewEventType] = useState('video_start')
  const [newTargetId, setNewTargetId] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [newExtra, setNewExtra] = useState<Record<string, any>>({})
  const [newHasImmediate, setNewHasImmediate] = useState(true)
  const [newHasFollowups, setNewHasFollowups] = useState(false)
  const [newFollowupsCount, setNewFollowupsCount] = useState(2)

  const newEventDef = EVENT_TYPE_DEFS.find(e => e.key === newEventType)!

  async function load() {
    setLoading(true)
    const { data: trs } = await supabase.from('scenario_event_triggers')
      .select('*').eq('scenario_id', scenarioId).order('sort_in_group')
    const all = (trs ?? []) as EventTrigger[]
    const groupIds = [...new Set(all.filter(t => t.group_id).map(t => t.group_id as string))]
    let msgList: (Message & { parent_trigger_group_id: string | null })[] = []
    let btnList: Button[] = []
    if (groupIds.length > 0) {
      const { data: msgs } = await supabase
        .from('scenario_messages')
        .select('*')
        .in('parent_trigger_group_id', groupIds)
        .order('order_position')
      msgList = (msgs ?? []) as typeof msgList
      const msgIds = msgList.map(m => m.id)
      if (msgIds.length > 0) {
        const { data: btns } = await supabase.from('scenario_buttons').select('*').in('message_id', msgIds).order('order_position')
        btnList = (btns ?? []) as Button[]
      }
    }
    setAllButtons(btnList)

    const byGroup = new Map<string, EventTrigger[]>()
    for (const t of all) {
      if (!t.group_id) continue
      const arr = byGroup.get(t.group_id) ?? []
      arr.push(t)
      byGroup.set(t.group_id, arr)
    }

    const result: TriggerGroup[] = []
    for (const [gid, trs] of byGroup) {
      const first = trs[0]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const params = (first.event_params ?? {}) as Record<string, any>
      const targetId = params.videoId || params.landingSlug || params.productId || params.formSlug || params.channelId || ''
      const extra: Record<string, unknown> = {}
      if (params.minPercent) extra.minPercent = params.minPercent
      result.push({
        id: gid,
        label: first.label ?? 'Без имени',
        eventType: first.event_type,
        targetId,
        extraParams: extra,
        triggers: trs,
        messages: msgList.filter(m => m.parent_trigger_group_id === gid) as Message[],
      })
    }

    setGroups(result)
    setLoading(false)
  }

  async function loadTargets() {
    const [vids, lands, prods] = await Promise.all([
      supabase.from('videos').select('id, title').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('landings').select('id, name, slug').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('products').select('id, name').eq('project_id', projectId).order('created_at', { ascending: false }),
    ])
    setVideos((vids.data ?? []) as VideoOpt[])
    setLandings((lands.data ?? []) as LandingOpt[])
    setProducts((prods.data ?? []) as ProductOpt[])
  }

  useEffect(() => { load(); loadTargets(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [scenarioId, projectId])

  useEffect(() => {
    setNewTargetId('')
    const ext: Record<string, number> = {}
    for (const p of newEventDef.extraParams ?? []) ext[p.key] = p.default ?? 0
    setNewExtra(ext)
    if (!newEventDef.cancelOnEventType) setNewHasFollowups(false)
  }, [newEventType]) // eslint-disable-line react-hooks/exhaustive-deps

  function buildEventParams(eventType: string, targetId: string, extra: Record<string, unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: Record<string, any> = { ...extra }
    const def = EVENT_TYPE_DEFS.find(e => e.key === eventType)
    if (!def?.targetKind) return params
    if (def.targetKind === 'video') params.videoId = targetId
    else if (def.targetKind === 'landing') {
      const l = landings.find(x => x.id === targetId)
      params.landingSlug = l?.slug ?? targetId
    }
    else if (def.targetKind === 'product') params.productId = targetId
    else if (def.targetKind === 'form') params.formSlug = targetId
    else if (def.targetKind === 'channel') params.channelId = targetId
    return params
  }

  async function createGroup() {
    if (!newLabel.trim()) { alert('Введи имя триггера'); return }
    if (newEventDef.targetKind && !newTargetId) { alert('Выбери объект (видео / сайт / продукт)'); return }

    const event_params = buildEventParams(newEventType, newTargetId, newExtra)
    const groupId = crypto.randomUUID()
    let sort = 0

    // Всегда создаём immediate-сообщение. enabled зависит от галочки.
    {
      const { data: m } = await supabase.from('scenario_messages').insert({
        scenario_id: scenarioId,
        parent_trigger_group_id: groupId,
        text: '',
        is_start: false,
        order_position: sort,
      }).select('id').single()
      if (m) {
        await supabase.from('scenario_event_triggers').insert({
          scenario_id: scenarioId,
          start_message_id: m.id,
          event_type: newEventType,
          event_params,
          is_negative: false,
          enabled: newHasImmediate,
          wait_value: 0,
          wait_unit: 'min',
          label: newLabel,
          group_id: groupId,
          sort_in_group: sort,
        })
        sort++
      }
    }

    // Дожимы создаём только если для этого события есть отменяющее.
    if (newEventDef.cancelOnEventType) {
      const defaultWaits = [30, 60, 180, 360, 720, 1440]
      const count = newHasFollowups ? newFollowupsCount : 1
      for (let i = 0; i < count; i++) {
        const { data: m } = await supabase.from('scenario_messages').insert({
          scenario_id: scenarioId,
          parent_trigger_group_id: groupId,
          text: '',
          is_start: false,
          order_position: sort,
        }).select('id').single()
        if (!m) continue
        await supabase.from('scenario_event_triggers').insert({
          scenario_id: scenarioId,
          start_message_id: m.id,
          event_type: newEventType,
          event_params,
          is_negative: true,
          enabled: newHasFollowups,
          wait_value: defaultWaits[i] ?? 60,
          wait_unit: 'min',
          cancel_on_event_type: newEventDef.cancelOnEventType,
          label: newLabel,
          group_id: groupId,
          sort_in_group: sort,
        })
        sort++
      }
    }

    setNewLabel('')
    setNewFollowupsCount(2)
    setNewHasFollowups(false)
    setNewHasImmediate(true)
    setNewTargetId('')
    setCreating(false)
    setExpandedId(groupId)
    await load()
  }

  async function deleteGroup(groupId: string) {
    if (!confirm('Удалить триггер со всеми его сообщениями?')) return
    await supabase.from('scenario_event_triggers').delete().eq('scenario_id', scenarioId).eq('group_id', groupId)
    await supabase.from('scenario_messages').delete().eq('scenario_id', scenarioId).eq('parent_trigger_group_id', groupId)
    await load()
  }

  async function updateMessage(msgId: string, text: string) {
    await supabase.from('scenario_messages').update({ text }).eq('id', msgId)
  }
  async function updateFollowupWait(triggerId: string, minutes: number) {
    await supabase.from('scenario_event_triggers').update({ wait_minutes: Math.max(1, minutes) }).eq('id', triggerId)
  }
  async function addFollowupToGroup(g: TriggerGroup) {
    const def = EVENT_TYPE_DEFS.find(e => e.key === g.eventType)
    if (!def?.cancelOnEventType) { alert('Для этого события дожимы не предусмотрены'); return }
    const first = g.triggers[0]
    const lastSort = Math.max(0, ...g.triggers.map(t => t.sort_in_group))
    const { data: m } = await supabase.from('scenario_messages').insert({
      scenario_id: scenarioId,
      parent_trigger_group_id: g.id,
      text: '',
      is_start: false,
      order_position: lastSort + 1,
    }).select('id').single()
    if (!m) return
    await supabase.from('scenario_event_triggers').insert({
      scenario_id: scenarioId,
      start_message_id: m.id,
      event_type: first.event_type,
      event_params: first.event_params,
      is_negative: true,
      wait_minutes: 60,
      cancel_on_event_type: def.cancelOnEventType,
      label: g.label,
      group_id: g.id,
      sort_in_group: lastSort + 1,
    })
    await load()
  }
  async function addImmediateToGroup(g: TriggerGroup) {
    const first = g.triggers[0]
    const { data: m } = await supabase.from('scenario_messages').insert({
      scenario_id: scenarioId,
      parent_trigger_group_id: g.id,
      text: '',
      is_start: false,
      order_position: 0,
    }).select('id').single()
    if (!m) return
    // Shift existing sorts
    for (const t of g.triggers) {
      await supabase.from('scenario_event_triggers').update({ sort_in_group: t.sort_in_group + 1 }).eq('id', t.id)
    }
    await supabase.from('scenario_event_triggers').insert({
      scenario_id: scenarioId,
      start_message_id: m.id,
      event_type: first.event_type,
      event_params: first.event_params,
      is_negative: false,
      wait_minutes: 0,
      label: g.label,
      group_id: g.id,
      sort_in_group: 0,
    })
    await load()
  }
  async function removeMessageFromGroup(msgId: string) {
    if (!confirm('Удалить это сообщение из триггера?')) return
    await supabase.from('scenario_event_triggers').delete().eq('start_message_id', msgId)
    await supabase.from('scenario_messages').delete().eq('id', msgId)
    await load()
  }
  async function removeMessageFromGroupSilent(msgId: string) {
    await supabase.from('scenario_event_triggers').delete().eq('start_message_id', msgId)
    await supabase.from('scenario_messages').delete().eq('id', msgId)
  }

  function describeTarget(g: TriggerGroup): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (g.triggers[0]?.event_params ?? {}) as Record<string, any>
    if (p.videoId) { const v = videos.find(x => x.id === p.videoId); return v ? `видео «${v.title}»` : `video:${String(p.videoId).slice(0, 6)}` }
    if (p.landingSlug) { const l = landings.find(x => x.slug === p.landingSlug); return l ? `сайт «${l.name}»` : `сайт ${p.landingSlug}` }
    if (p.productId) { const prod = products.find(x => x.id === p.productId); return prod ? `продукт «${prod.name}»` : `product:${String(p.productId).slice(0, 6)}` }
    if (p.formSlug) return `форма ${p.formSlug}`
    if (p.channelId) return `канал ${p.channelId}`
    return ''
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Триггеры событий</h2>
          <p className="text-xs text-gray-500">Один триггер = событие + сообщение сразу + дожимы если событие не произошло</p>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)} className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium">
            + Новый триггер
          </button>
        )}
      </div>

      <Modal
        isOpen={creating}
        onClose={() => { setCreating(false); setNewLabel('') }}
        title="Новый триггер"
        subtitle="Событие + сообщение сразу + дожимы"
        maxWidth="2xl"
        footer={
          <>
            <button onClick={() => { setCreating(false); setNewLabel('') }}
              className="px-3 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100">
              Отмена
            </button>
            <button onClick={createGroup}
              className="px-4 py-2 text-sm font-semibold bg-[#6A55F8] text-white rounded-lg hover:bg-[#5845e0]">
              Создать триггер
            </button>
          </>
        }
      >
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Имя триггера</label>
            <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
              placeholder="Например: Недосмотр видео про оффер"
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Тип события</label>
            <select value={newEventType} onChange={e => setNewEventType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
              {EVENT_TYPE_DEFS.map(e => <option key={e.key} value={e.key}>{e.emoji} {e.label}</option>)}
            </select>
          </div>

          {newEventDef.targetKind && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {newEventDef.targetKind === 'video' && 'Какое видео *'}
                {newEventDef.targetKind === 'landing' && 'Какой сайт *'}
                {newEventDef.targetKind === 'product' && 'Какой продукт *'}
                {newEventDef.targetKind === 'form' && 'Какая форма (slug) *'}
                {newEventDef.targetKind === 'channel' && 'Какой канал (id) *'}
              </label>
              {newEventDef.targetKind === 'video' && (
                <select value={newTargetId} onChange={e => setNewTargetId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
                  <option value="">— Выбери видео —</option>
                  {videos.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}
                </select>
              )}
              {newEventDef.targetKind === 'landing' && (
                <select value={newTargetId} onChange={e => setNewTargetId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
                  <option value="">— Выбери сайт —</option>
                  {landings.map(l => <option key={l.id} value={l.id}>{l.name} ({l.slug})</option>)}
                </select>
              )}
              {newEventDef.targetKind === 'product' && (
                <select value={newTargetId} onChange={e => setNewTargetId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
                  <option value="">— Выбери продукт —</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              {(newEventDef.targetKind === 'form' || newEventDef.targetKind === 'channel') && (
                <input value={newTargetId} onChange={e => setNewTargetId(e.target.value)} placeholder="slug / id"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
              )}
            </div>
          )}

          {newEventDef.extraParams && newEventDef.extraParams.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {newEventDef.extraParams.map(p => (
                <div key={p.key}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{p.label}{p.suffix ? ` (${p.suffix})` : ''}</label>
                  <input type="number" value={newExtra[p.key] ?? ''} onChange={e => setNewExtra(v => ({ ...v, [p.key]: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
                </div>
              ))}
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer border border-gray-200 rounded-lg p-3">
            <input type="checkbox" checked={newHasImmediate} onChange={e => setNewHasImmediate(e.target.checked)} />
            <div>
              <div className="text-sm font-medium text-gray-900">Отправить сообщение сразу при событии</div>
              <div className="text-xs text-gray-500">Сообщение, медиа, кнопки настроишь после создания</div>
            </div>
          </label>

          {newEventDef.cancelOnEventType ? (
            <div className="border border-gray-200 rounded-lg p-3 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={newHasFollowups} onChange={e => setNewHasFollowups(e.target.checked)} />
                <div>
                  <div className="text-sm font-medium text-gray-900">Отправить дожимы если событие НЕ произошло</div>
                  <div className="text-xs text-gray-500">Тексты и тайминги настроишь после создания. Если клиент {newEventDef.cancelOnEventType === 'video_complete' ? 'досмотрит видео' : newEventDef.cancelOnEventType === 'order_created' ? 'создаст заказ' : newEventDef.cancelOnEventType === 'order_paid' ? 'оплатит' : 'совершит отменяющее действие'} — дожимы отменятся</div>
                </div>
              </label>
              {newHasFollowups && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600">Сколько дожимов создать:</span>
                  <input type="number" min={1} max={10} value={newFollowupsCount}
                    onChange={e => setNewFollowupsCount(Math.max(1, Math.min(10, Number(e.target.value))))}
                    className="w-20 px-2 py-1 rounded border border-gray-200 text-sm" />
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-gray-400">Для события «{newEventDef.label}» дожимы не предусмотрены — оно финальное</div>
          )}
        </div>
      </Modal>

      {loading ? (
        <div className="text-center py-8 text-sm text-gray-400">Загрузка…</div>
      ) : groups.length === 0 && !creating ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-2">⚡</div>
          <p className="text-sm text-gray-500">Нет триггеров</p>
          <p className="text-xs text-gray-400 mt-1">Нажми «Новый триггер» чтобы настроить дожим на какое-то событие</p>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map(g => {
            const def = EVENT_TYPE_DEFS.find(e => e.key === g.eventType)
            const isExpanded = expandedId === g.id
            const immediateTriggers = g.triggers.filter(t => !t.is_negative)
            const followupTriggers = g.triggers.filter(t => t.is_negative).sort((a, b) => a.wait_minutes - b.wait_minutes)
            const target = describeTarget(g)
            return (
              <div key={g.id} className={`bg-white rounded-xl border ${isExpanded ? 'border-[#6A55F8]/40 shadow-sm' : 'border-gray-100'}`}>
                <div className="flex items-center px-5 py-3 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : g.id)}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{def?.emoji} {g.label}</p>
                    <p className="text-xs text-gray-500">
                      {def?.label ?? g.eventType}{target ? ` · ${target}` : ''}
                      {immediateTriggers.length > 0 && <span className="ml-2">· сразу</span>}
                      {followupTriggers.length > 0 && <span className="ml-2">· {followupTriggers.length} дожимов</span>}
                    </p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); deleteGroup(g.id) }} className="text-xs text-gray-400 hover:text-red-500 mr-3">
                    Удалить
                  </button>
                  <span className="text-gray-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                    {/* Immediate */}
                    <TriggerSection
                      title="Если событие случилось → отправить сообщение"
                      enabled={immediateTriggers.some(t => t.enabled)}
                      onToggle={async checked => {
                        for (const t of immediateTriggers) {
                          await supabase.from('scenario_event_triggers').update({ enabled: checked }).eq('id', t.id)
                        }
                        setGroups(prev => prev.map(gr => gr.id === g.id ? { ...gr, triggers: gr.triggers.map(tr => !tr.is_negative ? { ...tr, enabled: checked } : tr) } : gr))
                      }}
                    >
                      {immediateTriggers.map(t => {
                        const msg = g.messages.find(m => m.id === t.start_message_id)
                        if (!msg) return null
                        const msgButtons = allButtons.filter(b => b.message_id === msg.id)
                        return (
                          <MessageCard key={msg.id} projectId={projectId} msg={msg} buttons={msgButtons} allMessages={g.messages}
                            hideFollowups
                            onUpdate={() => { void load() }}
                            onDelete={() => removeMessageFromGroup(msg.id)}
                            onAddButton={async () => {
                              await supabase.from('scenario_buttons').insert({ message_id: msg.id, order_position: msgButtons.length, text: 'Кнопка', action_type: 'url' })
                              await load()
                            }}
                            onDeleteButton={async id => { await supabase.from('scenario_buttons').delete().eq('id', id); await load() }}
                            onUpdateButton={async (id, data) => { await supabase.from('scenario_buttons').update(data).eq('id', id); await load() }}
                          />
                        )
                      })}
                    </TriggerSection>

                    {/* Followups */}
                    {def?.cancelOnEventType && (
                      <TriggerSection
                        title="Дожимы если событие НЕ случилось за время"
                        enabled={followupTriggers.some(t => t.enabled)}
                        onToggle={async checked => {
                          for (const t of followupTriggers) {
                            await supabase.from('scenario_event_triggers').update({ enabled: checked }).eq('id', t.id)
                          }
                          setGroups(prev => prev.map(gr => gr.id === g.id ? { ...gr, triggers: gr.triggers.map(tr => tr.is_negative ? { ...tr, enabled: checked } : tr) } : gr))
                        }}
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs text-gray-600">Сколько дожимов:</span>
                          <input type="number" min={1} max={10} value={followupTriggers.length}
                            onChange={async e => {
                              const target = Math.max(1, Math.min(10, Number(e.target.value)))
                              const current = followupTriggers.length
                              if (target > current) {
                                for (let i = current; i < target; i++) await addFollowupToGroup(g)
                              } else if (target < current) {
                                const toRemove = followupTriggers.slice(target)
                                for (const t of toRemove) await removeMessageFromGroupSilent(t.start_message_id)
                                await load()
                              }
                            }}
                            className="w-20 px-2 py-1 rounded border border-gray-200 text-sm" />
                        </div>
                        <div className="space-y-3">
                          {followupTriggers.map((t, idx) => {
                            const msg = g.messages.find(m => m.id === t.start_message_id)
                            if (!msg) return null
                            const msgButtons = allButtons.filter(b => b.message_id === msg.id)
                            return (
                              <div key={msg.id} className="space-y-1">
                                <TriggerWaitEditor trigger={t} onChange={() => load()} />
                                <MessageCard projectId={projectId} msg={msg} buttons={msgButtons} allMessages={g.messages}
                                  hideFollowups
                                  displayNumber={idx + 1}
                                  onUpdate={() => { void load() }}
                                  onDelete={() => removeMessageFromGroup(msg.id)}
                                  onAddButton={async () => {
                                    await supabase.from('scenario_buttons').insert({ message_id: msg.id, order_position: msgButtons.length, text: 'Кнопка', action_type: 'url' })
                                    await load()
                                  }}
                                  onDeleteButton={async id => { await supabase.from('scenario_buttons').delete().eq('id', id); await load() }}
                                  onUpdateButton={async (id, data) => { await supabase.from('scenario_buttons').update(data).eq('id', id); await load() }}
                                />
                              </div>
                            )
                          })}
                        </div>
                      </TriggerSection>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TriggerSection({ title, enabled, onToggle, children }: {
  title: string
  enabled: boolean
  onToggle: (checked: boolean) => void | Promise<void>
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-200 rounded-lg">
      <div className="flex items-center justify-between px-3 py-2.5">
        <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
          <input type="checkbox" checked={enabled} onChange={e => onToggle(e.target.checked)} />
          <span className={`text-sm font-medium ${enabled ? 'text-gray-900' : 'text-gray-400'}`}>{title}</span>
        </label>
        <button onClick={() => setOpen(o => !o)} className="text-xs text-[#6A55F8] hover:underline ml-3">
          {open ? '▲ Свернуть' : '▼ Настроить сообщения'}
        </button>
      </div>
      {open && (
        <div className="px-3 pb-3 border-t border-gray-100 pt-3 space-y-3">
          {children}
        </div>
      )}
    </div>
  )
}

function TriggerWaitEditor({ trigger, onChange }: {
  trigger: EventTrigger
  onChange: () => void
}) {
  const supabase = createClient()
  const initValue = trigger.wait_value > 0 ? trigger.wait_value : trigger.wait_minutes
  const initUnit = trigger.wait_value > 0 ? trigger.wait_unit : 'min'
  const [value, setValue] = useState(initValue)
  const [unit, setUnit] = useState(initUnit)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const minutesEquiv = unit === 'sec' ? Math.max(1, Math.round(value / 60)) : unit === 'hour' ? value * 60 : unit === 'day' ? value * 1440 : value
    await supabase.from('scenario_event_triggers').update({
      wait_value: value,
      wait_unit: unit,
      wait_minutes: Math.max(1, minutesEquiv),
    }).eq('id', trigger.id)
    setSaving(false)
    onChange()
  }

  return (
    <div className="flex items-center gap-2 bg-[#F0EDFF] rounded-lg px-3 py-2 text-xs">
      <span className="text-gray-700 font-medium">⏱ Отправить через</span>
      <input type="number" min={1} value={value} onChange={e => setValue(Number(e.target.value))}
        onBlur={save} disabled={saving}
        className="w-16 px-2 py-1 rounded border border-gray-200 text-sm" />
      <select value={unit} onChange={e => { setUnit(e.target.value); setTimeout(save, 0) }}
        disabled={saving}
        className="px-2 py-1 rounded border border-gray-200 text-sm">
        <option value="sec">секунд</option>
        <option value="min">минут</option>
        <option value="hour">часов</option>
        <option value="day">дней</option>
      </select>
      <span className="text-gray-500">после события</span>
    </div>
  )
}

// =============================================
// SCENARIO DETAIL
// =============================================
function SettingsTab({ scenario, supabase, onBack, onDeleted, onDuplicated }: {
  scenario: Scenario; supabase: ReturnType<typeof createClient>; onBack: () => void
  onDeleted?: (id: string) => void; onDuplicated?: (s: Scenario) => void
}) {
  const params = useParams()
  const projectId = params.id as string
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [bots, setBots] = useState<TelegramBot[]>([])

  // Controlled state для всех полей
  const [name, setName] = useState(scenario.name)
  const [status, setStatus] = useState(scenario.status)
  const [selectedBotId, setSelectedBotId] = useState(scenario.telegram_bot_id || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('telegram_bots').select('id, name, bot_username').eq('project_id', projectId).then(({ data }) => setBots((data ?? []) as TelegramBot[]))
  }, [projectId, supabase])

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setSaved(false)
    await supabase.from('chatbot_scenarios').update({
      name: name.trim(),
      status,
      telegram_bot_id: selectedBotId || null,
    }).eq('id', scenario.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }
  async function deleteScenario() {
    // FK cascade настроен: сценарии → сообщения → кнопки + триггеры + followups
    const { error } = await supabase.from('chatbot_scenarios').delete().eq('id', scenario.id)
    if (error) {
      alert('Не удалось удалить сценарий: ' + error.message)
      return
    }
    if (onDeleted) onDeleted(scenario.id)
    onBack()
  }
  async function duplicateScenario() {
    if (duplicating) return
    setDuplicating(true)

    // Создаём новый сценарий без привязки к боту (чистая копия)
    const { data: newS } = await supabase.from('chatbot_scenarios').insert({
      project_id: projectId,
      name: `${scenario.name} (копия)`,
      telegram_bot_id: null,
      status: 'draft',
    }).select().single()

    if (newS) {
      // Копируем сообщения
      const { data: msgs } = await supabase.from('scenario_messages').select('*').eq('scenario_id', scenario.id)

      if (msgs && msgs.length > 0) {
        // Проход 1: вставляем сообщения без перекрёстных ссылок, строим карту oldId → newId
        const idMap: Record<string, string> = {}
        await Promise.all(
          msgs.map(async (m: Record<string, unknown>) => {
            const { id: oldId, next_message_id: _n, parent_message_id: _p, ...rest } = m
            const { data: newMsg } = await supabase.from('scenario_messages').insert({
              ...rest,
              scenario_id: newS.id,
              next_message_id: null,
              parent_message_id: null,
            }).select('id').single()
            if (newMsg) idMap[oldId as string] = newMsg.id
          })
        )

        // Проход 2: восстанавливаем next_message_id / parent_message_id через карту
        await Promise.all(
          msgs.map(async (m: Record<string, unknown>) => {
            const newId = idMap[m.id as string]
            if (!newId) return
            const updates: Record<string, string | null> = {}
            if (m.next_message_id && idMap[m.next_message_id as string]) updates.next_message_id = idMap[m.next_message_id as string]
            if (m.parent_message_id && idMap[m.parent_message_id as string]) updates.parent_message_id = idMap[m.parent_message_id as string]
            if (Object.keys(updates).length > 0) {
              await supabase.from('scenario_messages').update(updates).eq('id', newId)
            }
          })
        )

        // Копируем кнопки с перепривязкой message_id и action_goto_message_id
        const oldMsgIds = msgs.map((m: Record<string, unknown>) => m.id as string)
        const { data: btns } = await supabase.from('scenario_buttons').select('*').in('message_id', oldMsgIds)
        if (btns && btns.length > 0) {
          await supabase.from('scenario_buttons').insert(
            btns.map((b: Record<string, unknown>) => {
              const { id: _id, message_id, action_goto_message_id, ...brest } = b
              return {
                ...brest,
                message_id: idMap[message_id as string] ?? message_id,
                action_goto_message_id: action_goto_message_id && idMap[action_goto_message_id as string]
                  ? idMap[action_goto_message_id as string]
                  : action_goto_message_id,
              }
            })
          )
        }
      }

      if (onDuplicated) onDuplicated(newS as Scenario)
    }

    setDuplicating(false)
    onBack()
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Основные</h3>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Название сценария</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Статус</label>
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
            <option value="draft">Черновик</option>
            <option value="active">Активен</option>
            <option value="paused">Пауза</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Привязка к Telegram-боту</label>
          <select value={selectedBotId} onChange={e => setSelectedBotId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
            <option value="">Не привязан</option>
            {bots.map(b => <option key={b.id} value={b.id}>@{b.bot_username} — {b.name}</option>)}
          </select>
          {bots.length === 0 && <p className="text-xs text-amber-600 mt-1">Подключите бота в Настройки → Интеграции</p>}
        </div>
        <button onClick={handleSave} disabled={saving || !name.trim()}
          className="w-full py-2 rounded-lg text-sm font-medium bg-[#6A55F8] text-white hover:bg-[#5A45E8] disabled:opacity-50 transition-colors">
          {saving ? 'Сохраняю...' : saved ? '✓ Сохранено' : 'Сохранить'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Дублировать сценарий</h3>
        <p className="text-xs text-gray-500 mb-3">Создаст копию со всеми сообщениями.</p>
        <button onClick={duplicateScenario} disabled={duplicating}
          className="px-4 py-2 rounded-lg text-sm font-medium text-[#6A55F8] border border-[#6A55F8]/30 hover:bg-[#F0EDFF] disabled:opacity-50">
          {duplicating ? 'Дублирую...' : '📋 Дублировать сценарий'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-red-100 p-5">
        <h3 className="text-sm font-semibold text-red-600 mb-2">Опасная зона</h3>
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-700">Удалить сценарий и все сообщения</p>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="px-3 py-1.5 rounded-lg border border-red-300 text-sm text-red-600 hover:bg-red-50">Удалить</button>
          ) : (
            <div className="flex gap-2">
              <button onClick={deleteScenario} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">Да, удалить</button>
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-50">Отмена</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

type BotConversation = {
  id: string
  telegram_bot_id: string | null
  telegram_first_name: string | null
  telegram_username: string | null
  telegram_user_id: number | null
  telegram_chat_id?: number | null
  updated_at: string
  chat_blocked?: boolean
  customers: {
    id: string
    full_name: string | null
    source_name: string | null
    source_slug?: string | null
    bot_blocked_at?: string | null
    bot_blocked_source?: string | null
  } | null
}

function ScenarioDetail({ scenario, onBack, onDeleted, onDuplicated }: { scenario: Scenario; onBack: () => void; onDeleted?: (id: string) => void; onDuplicated?: (s: Scenario) => void }) {
  const params = useParams()
  const projectId = params.id as string
  const [activeTab, setActiveTab] = useState<'scenario' | 'users' | 'analytics' | 'triggers' | 'settings'>('scenario')
  const [showAI, setShowAI] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [buttons, setButtons] = useState<Button[]>([])
  const [loading, setLoading] = useState(true)
  const [botUsers, setBotUsers] = useState<BotConversation[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [analytics, setAnalytics] = useState<{
    totalReach: number; totalReplies: number; totalBtnClicks: number
    msgReach: { id: string; text: string | null; is_start: boolean; order_position: number; reach: number; is_gate?: boolean; gateClicks?: number; gateSubscribed?: number }[]
    btnCounts: [string, number][]
  } | null>(null)
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)
  // ID сообщения открытого в модалке (в главном списке сценария). null = модалка закрыта.
  const [modalMessageId, setModalMessageId] = useState<string | null>(null)
  const supabase = createClient()

  // ESC закрывает модалку
  useEffect(() => {
    if (!modalMessageId) return
    const handler = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setModalMessageId(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [modalMessageId])

  async function loadData() {
    const [msgsRes, btnsRes] = await Promise.all([
      // Только сообщения основного сценария — триггер-owned (parent_trigger_group_id != null)
      // скрыты отсюда и редактируются во вкладке Триггеры
      supabase.from('scenario_messages').select('*').eq('scenario_id', scenario.id).is('parent_trigger_group_id', null).order('order_position'),
      supabase.from('scenario_buttons').select('*').order('order_position'),
    ])
    const msgs = (msgsRes.data ?? []) as Message[]
    setMessages(msgs)
    const msgIds = msgs.map(m => m.id)
    const allBtns = (btnsRes.data ?? []) as Button[]
    setButtons(allBtns.filter(b => msgIds.includes(b.message_id)))
    setLoading(false)
  }

  async function loadUsers() {
    setLoadingUsers(true)
    // Находим только разговоры, в которых есть исходящие сообщения именно этого сценария
    const { data: msgRows } = await supabase
      .from('chatbot_messages')
      .select('conversation_id')
      .eq('scenario_id', scenario.id)
      .eq('direction', 'outgoing')
    const convIds = [...new Set((msgRows ?? []).map((r: { conversation_id: string }) => r.conversation_id))]
    if (convIds.length === 0) { setBotUsers([]); setLoadingUsers(false); return }
    const { data } = await supabase
      .from('chatbot_conversations')
      .select('id, telegram_first_name, telegram_username, telegram_user_id, updated_at, customers(id, full_name, source_name)')
      .in('id', convIds)
      .order('updated_at', { ascending: false })
      .limit(100)
    setBotUsers((data ?? []) as unknown as BotConversation[])
    setLoadingUsers(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData() }, [scenario.id])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab === 'users') loadUsers() }, [activeTab])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab === 'analytics') loadAnalytics() }, [activeTab, messages])

  async function loadAnalytics() {
    if (!scenario.telegram_bot_id) { setAnalytics(null); return }
    setLoadingAnalytics(true)

    // Все разговоры этого бота
    const { data: convs } = await supabase
      .from('chatbot_conversations')
      .select('id, customer_id')
      .eq('telegram_bot_id', scenario.telegram_bot_id)

    if (!convs || convs.length === 0) { setAnalytics({ totalReach: 0, totalReplies: 0, totalBtnClicks: 0, msgReach: [], btnCounts: [] }); setLoadingAnalytics(false); return }

    const convIds = convs.map((c: { id: string }) => c.id)
    const customerIds = convs.map((c: { customer_id: string | null }) => c.customer_id).filter(Boolean) as string[]

    // Все исходящие сообщения из этих разговоров
    const { data: outMsgs } = await supabase
      .from('chatbot_messages')
      .select('conversation_id, content')
      .in('conversation_id', convIds)
      .eq('direction', 'outgoing')

    // Считаем охват по каждому сообщению сценария (сопоставление по тексту)
    const convsByMsg: Record<string, Set<string>> = {}
    for (const m of messages) {
      if (!m.text) continue
      convsByMsg[m.id] = new Set()
      const trimmed = m.text.trim()
      for (const om of (outMsgs ?? [])) {
        if (om.content?.trim() === trimmed) convsByMsg[m.id].add(om.conversation_id)
      }
    }

    // Все разговоры, получившие хоть одно сообщение этого сценария
    const reachedConvIds = new Set<string>()
    for (const s of Object.values(convsByMsg)) for (const id of s) reachedConvIds.add(id)

    // Входящие сообщения от пользователей в этих разговорах
    let totalReplies = 0
    if (reachedConvIds.size > 0) {
      const { count } = await supabase
        .from('chatbot_messages')
        .select('id', { count: 'exact', head: true })
        .in('conversation_id', [...reachedConvIds])
        .eq('direction', 'incoming')
      totalReplies = count ?? 0
    }

    // Клики по кнопкам
    const { data: btnActions } = customerIds.length > 0
      ? await supabase.from('customer_actions').select('data').in('customer_id', customerIds).eq('action', 'bot_button_click')
      : { data: [] }

    const btnCounts: Record<string, number> = {}
    for (const a of (btnActions ?? [])) {
      const t = (a.data as Record<string, string>)?.button_text ?? 'Кнопка'
      btnCounts[t] = (btnCounts[t] ?? 0) + 1
    }

    // Метрики gate-сообщений: клики на "Подписаться" и реальные подписки
    const gateMsgIds = messages.filter(m => m.is_subscription_gate).map(m => m.id)
    const gateClicksByMsg: Record<string, number> = {}
    const gateSubsByMsg: Record<string, number> = {}
    if (gateMsgIds.length > 0 && customerIds.length > 0) {
      const { data: gateActions } = await supabase
        .from('customer_actions')
        .select('action, data')
        .in('customer_id', customerIds)
        .in('action', ['gate_subscribe_click', 'gate_subscribed'])
      for (const a of (gateActions ?? [])) {
        const mid = (a.data as Record<string, string>)?.gate_message_id
        if (!mid) continue
        if (a.action === 'gate_subscribe_click') gateClicksByMsg[mid] = (gateClicksByMsg[mid] ?? 0) + 1
        else if (a.action === 'gate_subscribed') gateSubsByMsg[mid] = (gateSubsByMsg[mid] ?? 0) + 1
      }
    }

    setAnalytics({
      totalReach: reachedConvIds.size,
      totalReplies,
      totalBtnClicks: btnActions?.length ?? 0,
      msgReach: messages.map(m => ({
        id: m.id, text: m.text, is_start: m.is_start,
        order_position: m.order_position,
        reach: convsByMsg[m.id]?.size ?? 0,
        is_gate: !!m.is_subscription_gate,
        gateClicks: gateClicksByMsg[m.id] ?? 0,
        gateSubscribed: gateSubsByMsg[m.id] ?? 0,
      })),
      btnCounts: Object.entries(btnCounts).sort((a, b) => b[1] - a[1]),
    })
    setLoadingAnalytics(false)
  }

  async function addMessage() {
    const tempMsg: Message = {
      id: 'temp-' + Date.now(),
      scenario_id: scenario.id,
      order_position: messages.length,
      text: '',
      is_start: messages.length === 0,
      trigger_word: messages.length === 0 ? '/start' : null,
      is_followup: false,
      delay_minutes: 0,
      delay_unit: 'min',
      followup_condition: null,
      next_message_id: null,
      parent_message_id: null,
    }
    setMessages(prev => [...prev, tempMsg])
    const { data } = await supabase.from('scenario_messages').insert({
      scenario_id: scenario.id,
      order_position: tempMsg.order_position,
      text: '',
      is_start: tempMsg.is_start,
      trigger_word: tempMsg.trigger_word,
    }).select().single()
    if (data) {
      setMessages(prev => prev.map(m => m.id === tempMsg.id ? data as Message : m))
    }
  }

  // Только локальное обновление — DB-запись делает сам MessageCard при Save
  function updateMessage(id: string, data: Partial<Message>) {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...data } : m))
  }

  async function moveMessage(id: string, direction: 'up' | 'down') {
    const idx = messages.findIndex(m => m.id === id)
    if (idx === -1) return
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= messages.length) return

    const a = messages[idx]
    const b = messages[targetIdx]
    const posA = a.order_position
    const posB = b.order_position

    setMessages(prev => {
      const i = prev.findIndex(m => m.id === id)
      if (i === -1) return prev
      const t = direction === 'up' ? i - 1 : i + 1
      if (t < 0 || t >= prev.length) return prev
      const next = [...prev]
      next[i] = { ...prev[t], order_position: prev[i].order_position }
      next[t] = { ...prev[i], order_position: prev[t].order_position }
      return next
    })

    if (a.id.startsWith('temp-') || b.id.startsWith('temp-')) return
    // Swap через sideline (-1) — переживёт возможный unique constraint на (scenario_id, order_position)
    await supabase.from('scenario_messages').update({ order_position: -1 }).eq('id', b.id)
    await supabase.from('scenario_messages').update({ order_position: posB }).eq('id', a.id)
    await supabase.from('scenario_messages').update({ order_position: posA }).eq('id', b.id)
  }

  async function deleteMessage(id: string) {
    const remaining = messages.filter(m => m.id !== id)
    setMessages(remaining)

    // Очищаем media usages + удаляем осиротевшие файлы из библиотеки/Storage
    if (!id.startsWith('temp-')) {
      const { untrackAllUsages } = await import('@/lib/media-library')
      await untrackAllUsages(supabase, 'scenario_message', id)
    }

    await supabase.from('scenario_messages').delete().eq('id', id)
    // Reorder remaining messages in background
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].order_position !== i) {
        await supabase.from('scenario_messages').update({ order_position: i }).eq('id', remaining[i].id)
      }
    }
  }

  async function addButton(messageId: string) {
    const msgButtons = buttons.filter(b => b.message_id === messageId)
    const { data } = await supabase.from('scenario_buttons').insert({
      message_id: messageId,
      order_position: msgButtons.length,
      text: 'Кнопка',
      action_type: 'url',
    }).select().single()
    if (data) setButtons(prev => [...prev, data as Button])
  }

  async function deleteButton(id: string) {
    setButtons(prev => prev.filter(b => b.id !== id))
    await supabase.from('scenario_buttons').delete().eq('id', id)
  }

  async function updateButton(id: string, data: Partial<Button>) {
    setButtons(prev => prev.map(b => b.id === id ? { ...b, ...data } : b))
    await supabase.from('scenario_buttons').update(data).eq('id', id)
  }

  const tabs = [
    { id: 'scenario' as const, label: 'Сценарий' },
    { id: 'triggers' as const, label: 'Триггеры' },
    { id: 'users' as const, label: 'Пользователи' },
    { id: 'analytics' as const, label: 'Аналитика' },
    { id: 'settings' as const, label: 'Настройки' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">← Назад</button>
          <div className="w-9 h-9 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-lg">🤖</div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{scenario.name}</h1>
            <p className="text-xs text-gray-500">{messages.length} сообщений</p>
          </div>
        </div>
        <AiAssistantButton isOpen={showAI} onClick={() => setShowAI(!showAI)} />
      </div>

      <div className="flex items-center gap-1 border-b border-gray-100">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${
              activeTab === tab.id ? 'border-[#6A55F8] text-[#6A55F8]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>{tab.label}</button>
        ))}
      </div>

      {activeTab === 'scenario' && (
        <div className="space-y-3">
          {loading ? (
            <SkeletonList count={3} />
          ) : messages.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
              <div className="text-3xl mb-3">💬</div>
              <p className="text-gray-500 text-sm mb-4">Добавьте первое сообщение для запуска бота</p>
              <button onClick={addMessage} className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium">
                + Добавить стартовое сообщение
              </button>
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => {
                const msgButtons = buttons.filter(b => b.message_id === msg.id)
                // Find which messages link TO this one
                const linkedFrom = messages.find(m => m.next_message_id === msg.id)
                const buttonLinkedFrom = buttons.find(b => b.action_goto_message_id === msg.id)
                const hasIncomingLink = !!linkedFrom || !!buttonLinkedFrom
                const isOrphan = !hasIncomingLink && !msg.is_start

                return (
                  <div key={msg.id}>
                    {/* Connection line */}
                    {idx > 0 && (
                      <div className="flex items-center gap-2 py-1.5 pl-4">
                        <div className="flex flex-col items-center">
                          <div className={`w-px h-2 ${isOrphan ? 'bg-red-200' : 'bg-[#6A55F8]/30'}`} />
                          <div className={`text-xs ${isOrphan ? 'text-red-300' : 'text-[#6A55F8]'}`}>↓</div>
                          <div className={`w-px h-2 ${isOrphan ? 'bg-red-200' : 'bg-[#6A55F8]/30'}`} />
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {linkedFrom && (
                            <span className="text-[10px] bg-[#F0EDFF] text-[#6A55F8] px-1.5 py-0.5 rounded font-medium">
                              от #{linkedFrom.order_position + 1}
                            </span>
                          )}
                          {buttonLinkedFrom && (
                            <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                              от кнопки
                            </span>
                          )}
                          {msg.delay_minutes > 0 && (
                            <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded font-medium">
                              ⏱ {msg.delay_minutes} {msg.delay_unit === 'sec' ? 'сек' : msg.delay_unit === 'hour' ? 'ч' : msg.delay_unit === 'day' ? 'дн' : 'мин'}
                            </span>
                          )}
                          {msg.is_followup && (
                            <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-medium">
                              дожим
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {isOrphan && (
                      <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-1 text-xs text-red-700 flex items-start gap-2">
                        <span className="text-sm">⚠️</span>
                        <div>
                          <b>В это сообщение никто не ведёт</b> — бот его не отправит никому.
                          Чтобы задействовать, укажи его в поле «↓ Следующее сообщение» у предыдущего сообщения,
                          или сделай кнопку с действием «Перейти к сообщению» → это.
                        </div>
                      </div>
                    )}
                    <MessageCard
                      projectId={projectId}
                      msg={msg}
                      buttons={msgButtons}
                      allMessages={messages}
                      onUpdate={updateMessage}
                      onDelete={deleteMessage}
                      onAddButton={addButton}
                      onDeleteButton={deleteButton}
                      onUpdateButton={updateButton}
                      onMoveUp={id => moveMessage(id, 'up')}
                      onMoveDown={id => moveMessage(id, 'down')}
                      canMoveUp={idx > 0}
                      canMoveDown={idx < messages.length - 1}
                      isOrphan={isOrphan}
                      useModal
                      modalOpen={modalMessageId === msg.id}
                      onOpenModal={() => setModalMessageId(msg.id)}
                      onCloseModal={() => setModalMessageId(null)}
                      onModalPrev={() => {
                        const prev = messages[idx - 1]
                        if (prev) setModalMessageId(prev.id)
                      }}
                      onModalNext={() => {
                        const next = messages[idx + 1]
                        if (next) setModalMessageId(next.id)
                      }}
                      canModalPrev={idx > 0}
                      canModalNext={idx < messages.length - 1}
                      modalPositionLabel={`${idx + 1} из ${messages.length}`}
                    />
                  </div>
                )
              })}
              <button onClick={addMessage}
                className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-[#6A55F8] hover:text-[#6A55F8] transition-colors">
                + Добавить сообщение
              </button>
            </>
          )}
        </div>
      )}

      {activeTab === 'users' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Пользователи бота</h3>
              {!scenario.telegram_bot_id && (
                <p className="text-xs text-amber-500 mt-0.5">Бот не подключён к сценарию</p>
              )}
            </div>
            <span className="text-sm text-gray-400">{botUsers.length} чел.</span>
          </div>

          {loadingUsers ? (
            <SkeletonList count={4} />
          ) : botUsers.length === 0 ? (
            <div className="py-14 text-center">
              <div className="text-4xl mb-3">🤖</div>
              <p className="text-sm text-gray-500 font-medium">Пользователей пока нет</p>
              <p className="text-xs text-gray-400 mt-1">Здесь появятся все кто написал боту</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left border-b border-gray-100">
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Пользователь</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Telegram</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Источник</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Последняя активность</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {botUsers.map(conv => {
                  const name = conv.customers?.full_name || conv.telegram_first_name || 'Без имени'
                  const source = conv.customers?.source_name
                  return (
                    <tr key={conv.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8] flex-shrink-0">
                            {name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-800">{name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-500">
                        {conv.telegram_username ? `@${conv.telegram_username}` : conv.telegram_user_id ? `ID: ${conv.telegram_user_id}` : '—'}
                      </td>
                      <td className="px-5 py-3">
                        {source ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#F0EDFF] text-[#6A55F8]">
                            📍 {source}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs">
                        {new Date(conv.updated_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="space-y-4">
          {loadingAnalytics ? (
            <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-sm text-gray-400">Загружаю...</div>
          ) : !analytics || !scenario.telegram_bot_id ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400 text-sm">
              Привяжите бота к сценарию чтобы видеть аналитику
            </div>
          ) : (
            <>
              {/* Карточки-метрики */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Охват', value: analytics.totalReach, icon: '👥', hint: 'Уникальных пользователей' },
                  { label: 'Ответов', value: analytics.totalReplies, icon: '💬', hint: 'Сообщений от пользователей' },
                  { label: 'Кликов', value: analytics.totalBtnClicks, icon: '👆', hint: 'Нажатий на кнопки' },
                ].map(({ label, value, icon, hint }) => (
                  <div key={label} className="bg-white rounded-xl border border-gray-100 p-5">
                    <div className="text-2xl mb-2">{icon}</div>
                    <div className="text-2xl font-bold text-gray-900">{value}</div>
                    <div className="text-sm font-medium text-gray-700 mt-0.5">{label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{hint}</div>
                  </div>
                ))}
              </div>

              {/* Воронка по сообщениям */}
              {analytics.msgReach.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Воронка сообщений</h3>
                  <div className="space-y-3">
                    {analytics.msgReach.map((m, i) => {
                      const maxReach = Math.max(...analytics.msgReach.map(x => x.reach), 1)
                      const pct = Math.round((m.reach / maxReach) * 100)
                      const label = m.is_start ? '⭐ Стартовое' : m.is_gate ? '🚪 Gate' : `💬 Сообщение ${i + 1}`
                      const labelColor = m.is_start ? 'bg-green-100 text-green-700' : m.is_gate ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-600'
                      const text = m.text ? (m.text.length > 60 ? m.text.slice(0, 60) + '…' : m.text) : '(без текста)'
                      const convRate = m.is_gate && (m.gateClicks ?? 0) > 0
                        ? Math.round(((m.gateSubscribed ?? 0) / (m.gateClicks ?? 1)) * 100)
                        : null
                      return (
                        <div key={m.id} className="space-y-1">
                          <div className="flex items-center gap-3">
                            <div className="w-28 flex-shrink-0">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${labelColor}`}>{label}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-gray-500 mb-1 truncate">{text}</div>
                              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-[#6A55F8] rounded-full transition-all" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                            <div className="w-16 text-right flex-shrink-0">
                              <span className="text-sm font-semibold text-gray-800">{m.reach}</span>
                              <span className="text-xs text-gray-400 ml-1">чел.</span>
                            </div>
                          </div>
                          {m.is_gate && (
                            <div className="pl-[7.25rem] flex items-center gap-4 text-[11px] text-gray-600">
                              <span>👆 Клик «Подписаться»: <b className="text-gray-800">{m.gateClicks ?? 0}</b></span>
                              <span>✅ Подписались: <b className="text-gray-800">{m.gateSubscribed ?? 0}</b></span>
                              {convRate !== null && <span className="text-gray-400">конверсия {convRate}%</span>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Клики по кнопкам */}
              {analytics.btnCounts.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Клики по кнопкам</h3>
                  <div className="space-y-2.5">
                    {analytics.btnCounts.map(([btnText, count]) => {
                      const maxCount = analytics.btnCounts[0][1]
                      const pct = Math.round((count / maxCount) * 100)
                      return (
                        <div key={btnText} className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-700 mb-1 truncate">{btnText}</div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-[#6A55F8]/60 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                          <div className="w-16 text-right flex-shrink-0">
                            <span className="text-sm font-semibold text-gray-800">{count}</span>
                            <span className="text-xs text-gray-400 ml-1">раз</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {analytics.totalReach === 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
                  Бот ещё не отправил ни одного сообщения этого сценария
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'triggers' && (
        <EventTriggersTab scenarioId={scenario.id} messages={messages} projectId={projectId} />
      )}

      {activeTab === 'settings' && (
        <SettingsTab scenario={scenario} supabase={supabase} onBack={onBack} onDeleted={onDeleted} onDuplicated={onDuplicated} />
      )}

      <AiAssistantOverlay
        isOpen={showAI}
        onClose={() => setShowAI(false)}
        title={`AI-агент · ${scenario.name}`}
        placeholder="Расскажи про продукт, аудиторию, цель воронки..."
        persistKey={`chatbot-scenario-${scenario.id}`}
        agent={{
          endpoint: '/api/ai/agent/chatbot',
          payload: { scenarioId: scenario.id, projectId },
          onChangesApplied: () => { void loadData() },
        }}
        initialMessages={[{ kind: 'ai', text: `Привет! Я маркетинговый агент, работаю только с этим сценарием — **"${scenario.name}"**. Сейчас в нём ${messages.length} ${messages.length === 1 ? 'сообщение' : 'сообщений'}.\n\nЧтобы собрать сильную воронку, расскажи:\n1. **Что за продукт / курс** ты продаёшь?\n2. **Кто твоя аудитория** — пол, возраст, чем занимается, какая главная боль?\n3. **Что должен сделать** человек в конце воронки — подписаться, оставить контакт, купить, прийти на вебинар?\n4. Есть уже **оффер** (цена, бонусы, дедлайн)?\n\nЯ **ничего не применяю без твоего явного "да"** — сначала покажу тексты, ты покритикуешь, потом сохраню в сценарий.` }]}
      />
    </div>
  )
}

// =============================================
// SCENARIOS LIST
// =============================================
export default function ChatbotsPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const projectId = params.id as string
  const supabase = createClient()

  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [bots, setBots] = useState<TelegramBot[]>([])
  const [botStats, setBotStats] = useState<Map<string, { scenarios: number; subscribers: number }>>(new Map())
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newBotId, setNewBotId] = useState('')
  const [activePageTab, setActivePageTab] = useState<'scenarios' | 'users'>('scenarios')
  const [botAllUsers, setBotAllUsers] = useState<(BotConversation & { scenarioNames: string[]; scenarioIds: string[] })[]>([])
  const [loadingBotUsers, setLoadingBotUsers] = useState(false)

  // Фильтры списка пользователей внутри бота
  const [userSubStatus, setUserSubStatus] = useState<'active' | 'unsubscribed'>('active')
  const [userSearch, setUserSearch] = useState('')
  const [userSources, setUserSources] = useState<Set<string>>(new Set())
  const [userScenarios, setUserScenarios] = useState<Set<string>>(new Set())
  const [userDateRange, setUserDateRange] = useState<'all' | 'today' | '7d' | '30d'>('all')
  const [userSort, setUserSort] = useState<'recent' | 'name_asc' | 'name_desc'>('recent')

  // URL: ?bot=<id> — выбран конкретный бот (второй уровень навигации)
  //       ?open=<id> — выбран сценарий (третий уровень)
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null)
  const urlSelectedId = searchParams.get('open') || null
  const selectedScenarioId = localSelectedId ?? urlSelectedId
  const urlBotId = searchParams.get('bot') || null

  function selectBot(id: string) {
    const p = new URLSearchParams(searchParams.toString())
    p.set('bot', id)
    p.delete('open')
    router.replace(`?${p.toString()}`, { scroll: false })
  }
  function clearBot() {
    setLocalSelectedId(null)
    const p = new URLSearchParams(searchParams.toString())
    p.delete('bot')
    p.delete('open')
    router.replace(`?${p.toString()}`, { scroll: false })
  }

  function selectScenario(id: string) {
    setLocalSelectedId(id)
    const p = new URLSearchParams(searchParams.toString())
    p.set('open', id)
    router.replace(`?${p.toString()}`, { scroll: false })
  }
  function clearSelection() {
    setLocalSelectedId(null)
    const p = new URLSearchParams(searchParams.toString())
    p.delete('open')
    router.replace(`?${p.toString()}`, { scroll: false })
  }

  async function load() {
    const [scenariosRes, botsRes] = await Promise.all([
      supabase.from('chatbot_scenarios').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('telegram_bots').select('id, name, bot_username, is_active').eq('project_id', projectId),
    ])
    const sc = scenariosRes.data ?? []
    const bs = botsRes.data ?? []
    setScenarios(sc)
    setBots(bs)

    // Статистика по каждому боту: сколько сценариев и активных подписчиков
    const stats = new Map<string, { scenarios: number; subscribers: number }>()
    for (const b of bs) {
      const scenariosCount = sc.filter(s => s.telegram_bot_id === b.id).length
      stats.set(b.id, { scenarios: scenariosCount, subscribers: 0 })
    }
    if (bs.length > 0) {
      const { data: subs } = await supabase
        .from('chatbot_conversations')
        .select('telegram_bot_id')
        .in('telegram_bot_id', bs.map(b => b.id))
        .eq('chat_blocked', false)
        .not('customer_id', 'is', null)
        .gt('telegram_chat_id', 0)
      for (const row of (subs ?? []) as Array<{ telegram_bot_id: string }>) {
        const cur = stats.get(row.telegram_bot_id)
        if (cur) cur.subscribers++
      }
    }
    setBotStats(stats)
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [projectId])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activePageTab !== 'users') return
    // Мгновенно показываем что есть, одновременно синхронизируем актуальные статусы
    // через Telegram (sendChatAction) и ещё раз перезагружаем. Так отписавшиеся
    // сразу попадают во вкладку «Отписавшиеся».
    loadBotUsers()
    if (urlBotId) {
      fetch('/api/broadcasts/sync-subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram_bot_id: urlBotId }),
      })
        .then(r => r.json())
        .then(() => loadBotUsers())
        .catch(() => { /* фон — ок если упало */ })
    }
  }, [activePageTab, scenarios, urlBotId])

  async function loadBotUsers() {
    setLoadingBotUsers(true)
    // В режиме внутри бота — грузим только этого бота. В общем режиме — все боты проекта.
    const botIds = urlBotId
      ? [urlBotId]
      : [...new Set(scenarios.filter(s => s.telegram_bot_id).map(s => s.telegram_bot_id as string))]
    if (botIds.length === 0) { setBotAllUsers([]); setLoadingBotUsers(false); return }

    // Все разговоры по этим ботам
    const { data: convs } = await supabase
      .from('chatbot_conversations')
      .select('id, telegram_bot_id, telegram_first_name, telegram_username, telegram_user_id, telegram_chat_id, updated_at, chat_blocked, customers(id, full_name, source_name, source_slug, bot_blocked_at, bot_blocked_source)')
      .in('telegram_bot_id', botIds)
      .gt('telegram_chat_id', 0)
      .order('updated_at', { ascending: false })
      .limit(1000)
    if (!convs || convs.length === 0) { setBotAllUsers([]); setLoadingBotUsers(false); return }

    // Участие в сценариях: chatbot_messages.scenario_id per conversation
    const convIds = convs.map((c: { id: string }) => c.id)
    const { data: msgRows } = await supabase
      .from('chatbot_messages')
      .select('conversation_id, scenario_id')
      .in('conversation_id', convIds)
      .not('scenario_id', 'is', null)
      .eq('direction', 'outgoing')

    // conversation_id → Set<scenario_id>
    const convScenarioMap: Record<string, Set<string>> = {}
    for (const row of (msgRows ?? []) as { conversation_id: string; scenario_id: string }[]) {
      if (!convScenarioMap[row.conversation_id]) convScenarioMap[row.conversation_id] = new Set()
      convScenarioMap[row.conversation_id].add(row.scenario_id)
    }

    // scenario_id → name (из уже загруженного списка сценариев)
    const scenarioMap: Record<string, string> = {}
    for (const s of scenarios) scenarioMap[s.id] = s.name

    const result = (convs as unknown as BotConversation[]).map(conv => {
      const ids = [...(convScenarioMap[conv.id] ?? [])]
      return {
        ...conv,
        scenarioIds: ids,
        scenarioNames: ids.map(sid => scenarioMap[sid]).filter(Boolean) as string[],
      }
    })
    setBotAllUsers(result)
    setLoadingBotUsers(false)
  }

  async function createScenario() {
    if (!newName.trim()) return
    // В режиме внутри бота — привязываем к нему автоматически
    const botIdForScenario = urlBotId ?? (newBotId || null)
    const tempScenario: Scenario = {
      id: 'temp-' + Date.now(),
      name: newName.trim(),
      status: 'draft',
      telegram_bot_id: botIdForScenario,
      created_at: new Date().toISOString(),
    }
    setScenarios(prev => [tempScenario, ...prev])
    setNewName('')
    setNewBotId('')
    setCreating(false)
    const { data } = await supabase.from('chatbot_scenarios').insert({
      project_id: projectId,
      name: tempScenario.name,
      telegram_bot_id: tempScenario.telegram_bot_id,
    }).select().single()
    if (data) {
      setScenarios(prev => prev.map(s => s.id === tempScenario.id ? data as Scenario : s))
    }
  }

  const selectedScenario = scenarios.find(s => s.id === selectedScenarioId)

  if (selectedScenario) {
    return <ScenarioDetail scenario={selectedScenario} onBack={clearSelection}
      onDeleted={(id) => setScenarios(prev => prev.filter(s => s.id !== id))}
      onDuplicated={(s) => setScenarios(prev => [...prev, s])}
    />
  }

  // Уровень 1 — список ботов (когда в URL нет ?bot=...)
  if (!urlBotId) {
    return (
      <BotsListView
        bots={bots}
        stats={botStats}
        loading={loading}
        onSelect={selectBot}
      />
    )
  }

  // Уровень 2 — внутри конкретного бота
  const currentBot = bots.find(b => b.id === urlBotId) ?? null
  const displayScenarios = scenarios.filter(s => s.telegram_bot_id === urlBotId)
  const displayUsers = botAllUsers.filter(c => c.telegram_bot_id === urlBotId)

  return (
    <div className="space-y-6">
      {/* Back + bot title */}
      <div>
        <button onClick={clearBot} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-3 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Все боты
        </button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-xl">🤖</div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{currentBot?.name ?? 'Бот'}</h1>
              {currentBot?.bot_username && (
                <a href={`https://t.me/${currentBot.bot_username}`} target="_blank" rel="noreferrer"
                  className="text-sm text-[#6A55F8] hover:underline">@{currentBot.bot_username}</a>
              )}
            </div>
          </div>
          {activePageTab === 'scenarios' && (
            <button onClick={() => setCreating(true)} className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              + Создать сценарий
            </button>
          )}
        </div>
      </div>

      {/* Вкладки страницы */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(['scenarios', 'users'] as const).map(tab => (
          <button key={tab} onClick={() => setActivePageTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activePageTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {tab === 'scenarios' ? '🤖 Сценарии' : '👥 Пользователи'}
          </button>
        ))}
      </div>

      {activePageTab === 'users' && (() => {
        // ─── Уникальные источники и сценарии для фильтр-чипов ───
        const allSources = Array.from(new Set(
          displayUsers.map(u => u.customers?.source_name).filter((x): x is string => !!x)
        )).sort()
        const botScenarios = displayScenarios // сценарии этого бота

        // ─── Пре-счёт: активных / отписавшихся в текущей выборке ───
        const activeCount = displayUsers.filter(u => !u.chat_blocked).length
        const unsubscribedCount = displayUsers.filter(u => !!u.chat_blocked).length

        // ─── Основная фильтрация ───
        const now = Date.now()
        const dateThreshold = userDateRange === 'today' ? now - 24 * 3600 * 1000
          : userDateRange === '7d' ? now - 7 * 24 * 3600 * 1000
          : userDateRange === '30d' ? now - 30 * 24 * 3600 * 1000
          : null
        const q = userSearch.trim().toLowerCase()

        const filtered = displayUsers
          .filter(u => userSubStatus === 'active' ? !u.chat_blocked : !!u.chat_blocked)
          .filter(u => {
            if (!q) return true
            const name = (u.customers?.full_name || u.telegram_first_name || '').toLowerCase()
            const uname = (u.telegram_username || '').toLowerCase()
            return name.includes(q) || uname.includes(q)
          })
          .filter(u => userSources.size === 0 || (u.customers?.source_name && userSources.has(u.customers.source_name)))
          .filter(u => userScenarios.size === 0 || u.scenarioIds.some(id => userScenarios.has(id)))
          .filter(u => {
            if (dateThreshold === null) return true
            return new Date(u.updated_at).getTime() >= dateThreshold
          })
          .sort((a, b) => {
            if (userSort === 'recent') {
              return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
            }
            const nameA = (a.customers?.full_name || a.telegram_first_name || '').toLowerCase()
            const nameB = (b.customers?.full_name || b.telegram_first_name || '').toLowerCase()
            return userSort === 'name_asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA)
          })

        function toggleSet<T>(set: Set<T>, value: T): Set<T> {
          const next = new Set(set)
          if (next.has(value)) next.delete(value)
          else next.add(value)
          return next
        }

        const hasAnyFilter = userSearch || userSources.size || userScenarios.size || userDateRange !== 'all'

        return (
          <div className="space-y-3">
            {/* Sub-tabs: Активные / Отписавшиеся */}
            <div className="flex gap-1 border-b border-gray-100">
              {([
                { id: 'active' as const, label: '✓ Активные', count: activeCount },
                { id: 'unsubscribed' as const, label: '✗ Отписавшиеся', count: unsubscribedCount },
              ]).map(t => (
                <button key={t.id} onClick={() => setUserSubStatus(t.id)}
                  className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    userSubStatus === t.id
                      ? 'border-[#6A55F8] text-[#6A55F8]'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}>
                  {t.label} <span className="ml-1 text-[10px] text-gray-400">{t.count}</span>
                </button>
              ))}
            </div>

            {/* Search + sort */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <input type="text" value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="🔍 Поиск по имени или @username"
                  className="w-full pl-3 pr-8 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
                {userSearch && (
                  <button onClick={() => setUserSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
                )}
              </div>
              <select value={userSort} onChange={e => setUserSort(e.target.value as typeof userSort)}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#6A55F8]">
                <option value="recent">Сначала новые</option>
                <option value="name_asc">По имени: А → Я</option>
                <option value="name_desc">По имени: Я → А</option>
              </select>
              {hasAnyFilter && (
                <button onClick={() => {
                  setUserSearch('')
                  setUserSources(new Set())
                  setUserScenarios(new Set())
                  setUserDateRange('all')
                }} className="text-xs text-gray-500 hover:text-[#6A55F8] hover:underline">
                  Сбросить фильтры
                </button>
              )}
            </div>

            {/* Date range chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-gray-400 mr-1">Активность:</span>
              {([
                { id: 'all' as const, label: 'Всё время' },
                { id: 'today' as const, label: 'Сегодня' },
                { id: '7d' as const, label: '7 дней' },
                { id: '30d' as const, label: '30 дней' },
              ]).map(r => (
                <button key={r.id} onClick={() => setUserDateRange(r.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    userDateRange === r.id
                      ? 'bg-[#6A55F8] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-[#F0EDFF]'
                  }`}>
                  {r.label}
                </button>
              ))}
            </div>

            {/* Scenario chips */}
            {botScenarios.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-gray-400 mr-1">Сценарий:</span>
                {botScenarios.map(s => {
                  const active = userScenarios.has(s.id)
                  return (
                    <button key={s.id} onClick={() => setUserScenarios(prev => toggleSet(prev, s.id))}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        active ? 'bg-[#6A55F8] text-white' : 'bg-gray-100 text-gray-600 hover:bg-[#F0EDFF]'
                      }`}>
                      {active && '✓ '}{s.name}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Source chips */}
            {allSources.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-gray-400 mr-1">Источник:</span>
                {allSources.map(src => {
                  const active = userSources.has(src)
                  return (
                    <button key={src} onClick={() => setUserSources(prev => toggleSet(prev, src))}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        active ? 'bg-[#6A55F8] text-white' : 'bg-gray-100 text-gray-600 hover:bg-[#F0EDFF]'
                      }`}>
                      {active && '✓ '}📍 {src}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {loadingBotUsers ? (
                <div className="p-8 text-center text-sm text-gray-400">Загружаю...</div>
              ) : filtered.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="text-3xl mb-3">👥</div>
                  <p className="text-sm text-gray-500">
                    {displayUsers.length === 0
                      ? 'Пока никто не писал боту'
                      : hasAnyFilter
                        ? 'Никто не подходит под фильтры'
                        : userSubStatus === 'active' ? 'Нет активных подписчиков' : 'Нет отписавшихся'}
                  </p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-left">Пользователь</th>
                      <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-left">Username</th>
                      <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-left">Сценарии</th>
                      <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-left">Источник</th>
                      <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-left">
                        {userSubStatus === 'active' ? 'Активность' : 'Отписался'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map(conv => {
                      const name = conv.customers?.full_name || conv.telegram_first_name || 'Без имени'
                      const source = conv.customers?.source_name
                      const isBlocked = !!conv.chat_blocked
                      const blockedAt = conv.customers?.bot_blocked_at
                      const blockedExact = conv.customers?.bot_blocked_source === 'webhook'
                      const href = conv.customers?.id ? `/project/${projectId}/users?open=${conv.customers.id}` : null
                      return (
                        <tr key={conv.id} className="hover:bg-gray-50/50">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8] flex-shrink-0">
                                {name.charAt(0).toUpperCase()}
                              </div>
                              {href ? (
                                <a href={href} className="font-medium text-[#6A55F8] text-sm hover:underline">{name}</a>
                              ) : (
                                <span className="font-medium text-gray-800 text-sm">{name}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-gray-500 text-sm">
                            {conv.telegram_username ? (
                              <a href={`https://t.me/${conv.telegram_username}`} target="_blank" rel="noreferrer"
                                className="text-[#6A55F8] hover:underline">@{conv.telegram_username}</a>
                            ) : conv.telegram_user_id ? `ID: ${conv.telegram_user_id}` : '—'}
                          </td>
                          <td className="px-5 py-3">
                            {conv.scenarioNames.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {conv.scenarioNames.map(n => (
                                  <span key={n} className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-[#F0EDFF] text-[#6A55F8]">{n}</span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            {source ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">📍 {source}</span>
                            ) : <span className="text-gray-400 text-xs">—</span>}
                          </td>
                          <td className="px-5 py-3 text-xs">
                            {isBlocked ? (
                              blockedAt ? (
                                <span className="text-red-500" title={blockedExact ? 'Точное время — Telegram уведомил в момент блокировки' : 'Момент обнаружения — мог заблокировать раньше'}>
                                  {blockedExact ? '' : '~'}{new Date(blockedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              ) : <span className="text-red-500">Заблокировал</span>
                            ) : (
                              <span className="text-gray-500">
                                {new Date(conv.updated_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )
      })()}

      {activePageTab === 'scenarios' && (
        <Modal
          isOpen={creating}
          onClose={() => { setCreating(false); setNewName('') }}
          title="Новый сценарий"
          subtitle="Назови сценарий — сообщения добавишь внутри"
          maxWidth="md"
          footer={
            <>
              <button onClick={() => { setCreating(false); setNewName('') }}
                className="px-3 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100">
                Отмена
              </button>
              <button onClick={createScenario} disabled={!newName.trim()}
                className="px-4 py-2 text-sm font-semibold bg-[#6A55F8] text-white rounded-lg hover:bg-[#5845e0] disabled:opacity-50">
                Создать сценарий
              </button>
            </>
          }
        >
          <div className="p-5">
            <label className="block text-xs font-medium text-gray-700 mb-1">Название</label>
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Например: Приветственная цепочка"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) createScenario() }}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10" />
          </div>
        </Modal>
      )}

      {activePageTab === 'scenarios' && (loading ? (
        <SkeletonList count={3} />
      ) : displayScenarios.length === 0 && !creating ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-4">💬</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Нет сценариев</h3>
          <p className="text-sm text-gray-500 mb-6">Создай первый сценарий для этого бота</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayScenarios.map(s => (
            <button key={s.id} onClick={() => selectScenario(s.id)}
              className="w-full bg-white rounded-xl border border-gray-100 p-4 text-left transition-all group flex items-center gap-4 hover:border-[#6A55F8]/40 hover:shadow-md">
              <div className="w-11 h-11 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-[#6A55F8] text-xl flex-shrink-0">💬</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate group-hover:text-[#6A55F8] transition-colors">{s.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">сценарий чат-бота</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  s.status === 'active' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-500'
                }`}>{s.status === 'active' ? 'Активен' : 'Черновик'}</span>
                <svg className="w-4 h-4 text-gray-300 group-hover:text-[#6A55F8] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

// =============================================
// BOTS LIST VIEW — уровень 1: список ботов проекта
// =============================================
function BotsListView({ bots, stats, loading, onSelect }: {
  bots: TelegramBot[]
  stats: Map<string, { scenarios: number; subscribers: number }>
  loading: boolean
  onSelect: (id: string) => void
}) {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Чат-боты</h1>
          <p className="text-sm text-gray-500">Выбери бота чтобы управлять его сценариями и подписчиками</p>
        </div>
        <button
          onClick={() => router.push(`/project/${projectId}/settings?focus=telegram-bot`)}
          className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Добавить бота
        </button>
      </div>

      {loading ? (
        <SkeletonList count={2} />
      ) : bots.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-4">🤖</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Нет подключённых ботов</h3>
          <p className="text-sm text-gray-500 mb-6">Подключи Telegram-бота в настройках проекта</p>
          <button
            onClick={() => router.push(`/project/${projectId}/settings?focus=telegram-bot`)}
            className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium">
            Открыть настройки
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {bots.map(b => {
            const s = stats.get(b.id) ?? { scenarios: 0, subscribers: 0 }
            return (
              <button key={b.id} onClick={() => onSelect(b.id)}
                className="w-full bg-white rounded-xl border border-gray-100 p-4 text-left transition-all group flex items-center gap-4 hover:border-[#6A55F8]/40 hover:shadow-md">
                <div className="w-11 h-11 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-[#6A55F8] text-xl flex-shrink-0">🤖</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate group-hover:text-[#6A55F8] transition-colors">{b.name}</p>
                  <p className="text-xs text-gray-400 font-mono truncate mt-0.5">@{b.bot_username}</p>
                </div>
                <div className="hidden sm:flex items-center gap-6 flex-shrink-0">
                  <div className="text-center">
                    <p className="text-base font-bold text-gray-900 leading-tight">{s.scenarios}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">сценариев</p>
                  </div>
                  <div className="text-center">
                    <p className="text-base font-bold text-gray-900 leading-tight">{s.subscribers}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">подписчиков</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${b.is_active === false ? 'bg-gray-100 text-gray-500' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                    {b.is_active === false ? 'Отключён' : 'Активен'}
                  </span>
                  <svg className="w-4 h-4 text-gray-300 group-hover:text-[#6A55F8] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Селектор Telegram-канала для subscription gate
// ============================================================
function GateChannelSelect({ projectId, value, onChange }: {
  projectId: string
  value: string | null
  onChange: (v: string | null) => void
}) {
  const supabase = createClient()
  const [channels, setChannels] = useState<Array<{ id: string; external_title: string | null; external_username: string | null; external_id: string }>>([])
  const [allAccounts, setAllAccounts] = useState<Array<{ id: string; external_title: string | null; external_id: string; mtproto_status: string | null }>>([])
  useEffect(() => {
    supabase.from('social_accounts')
      .select('id, external_title, external_username, external_id, mtproto_status')
      .eq('project_id', projectId)
      .eq('platform', 'telegram')
      .eq('is_active', true)
      .then(({ data }) => {
        setAllAccounts(data ?? [])
        // Каналы имеют отрицательный chat_id (-100...), user-аккаунты (менеджеры MTProto) — положительный
        const onlyChannels = (data ?? []).filter(a => a.external_id && a.external_id.startsWith('-'))
        setChannels(onlyChannels as typeof channels)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  if (channels.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
        ⚠️ Нет подключённых Telegram-каналов. Подключи канал в разделе <b>Соцсети → Telegram</b>, чтобы выбрать его здесь.
      </div>
    )
  }
  const savedAccount = value ? allAccounts.find(a => a.id === value) : null
  const savedIsChannel = savedAccount?.external_id?.startsWith('-') ?? false
  const isDeadReference = !!value && !savedAccount
  const isWrongType = !!savedAccount && !savedIsChannel
  return (
    <div className="bg-[#F0EDFF] border border-[#6A55F8]/20 rounded-lg p-3 space-y-2">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Какой канал проверять</label>
        <select value={value ?? ''} onChange={ev => onChange(ev.target.value || null)}
          className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:border-[#6A55F8] ${(isDeadReference || isWrongType) ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
          <option value="">— Выбери канал —</option>
          {channels.map(c => (
            <option key={c.id} value={c.id}>
              {c.external_title ?? c.external_username ?? c.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </div>
      {isDeadReference && (
        <div className="text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg p-2.5">
          ⚠️ Выбранный канал удалён или переподключён. Выбери канал из списка заново и сохрани.
        </div>
      )}
      {isWrongType && (
        <div className="text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg p-2.5">
          ⚠️ Выбран не канал, а user-аккаунт. Выбери настоящий канал в списке.
        </div>
      )}
    </div>
  )
}
