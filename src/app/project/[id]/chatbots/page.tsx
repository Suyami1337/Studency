'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { AiAssistantButton, AiAssistantOverlay } from '@/components/ui/AiAssistant'
import { SkeletonList } from '@/components/ui/Skeleton'

type Scenario = { id: string; name: string; status: string; telegram_bot_id: string | null; created_at: string }
type TelegramBot = { id: string; name: string; bot_username: string }
type Message = {
  id: string; scenario_id: string; order_position: number; text: string | null
  is_start: boolean; trigger_word: string | null; is_followup: boolean
  delay_minutes: number; delay_unit: string; followup_condition: string | null
  next_message_id: string | null; parent_message_id: string | null
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
}

// =============================================
// FOLLOWUP CARD (одна запись дожима)
// =============================================
function FollowupCard({ followup, index, onUpdate, onDelete }: {
  followup: Followup; index: number
  onUpdate: (id: string, data: Partial<Followup>) => void
  onDelete: (id: string) => void
}) {
  const [cardExpanded, setCardExpanded] = useState(true)
  const unitLabel = (u: string) => u === 'sec' ? 'сек' : u === 'min' ? 'мин' : u === 'hour' ? 'ч' : 'дн'

  return (
    <div className={`rounded-lg border transition-colors ${followup.is_active ? 'bg-[#F8F7FF] border-[#6A55F8]/15' : 'bg-gray-50 border-gray-200'}`}>
      {/* Шапка карточки — всегда видна */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Тоггл активности */}
        <button onClick={() => onUpdate(followup.id, { is_active: !followup.is_active })}
          className={`w-7 h-4 rounded-full transition-colors relative flex-shrink-0 ${followup.is_active ? 'bg-[#6A55F8]' : 'bg-gray-300'}`}>
          <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${followup.is_active ? 'translate-x-3' : 'translate-x-0.5'}`} />
        </button>
        <span className={`text-xs font-semibold flex-1 min-w-0 ${followup.is_active ? 'text-[#6A55F8]' : 'text-gray-400'}`}>
          Дожим {index + 1}
          <span className="ml-1.5 font-normal text-gray-400">
            через {followup.delay_value} {unitLabel(followup.delay_unit)}
          </span>
          {!followup.is_active && <span className="ml-1.5 text-gray-400">(выкл.)</span>}
        </span>
        <button onClick={() => setCardExpanded(!cardExpanded)} className="text-gray-400 hover:text-gray-600 text-xs px-1">
          {cardExpanded ? '▲' : '▼'}
        </button>
        <button onClick={() => onDelete(followup.id)} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
      </div>

      {/* Тело карточки — сворачивается */}
      {cardExpanded && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-[#6A55F8]/10">
          {/* Задержка */}
          <div className="flex items-center gap-2 mt-2.5">
            <span className="text-xs text-gray-600 w-10 flex-shrink-0">Через</span>
            <input type="number" min="1" value={followup.delay_value}
              onChange={e => onUpdate(followup.id, { delay_value: parseInt(e.target.value) || 1 })}
              className="w-16 px-2 py-1.5 rounded border border-gray-200 text-sm text-center focus:outline-none focus:border-[#6A55F8]" />
            <select value={followup.delay_unit} onChange={e => onUpdate(followup.id, { delay_unit: e.target.value })}
              className="px-2 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:border-[#6A55F8]">
              <option value="sec">сек</option>
              <option value="min">мин</option>
              <option value="hour">час</option>
              <option value="day">дней</option>
            </select>
          </div>
          {/* Текст */}
          <textarea value={followup.text} onChange={e => onUpdate(followup.id, { text: e.target.value })}
            placeholder={`Текст дожима ${index + 1}...`}
            className="w-full px-3 py-2 rounded border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] h-16 resize-none" />
          {/* Канал */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 flex-shrink-0">Канал:</span>
            <div className="flex gap-1">
              {(['telegram', 'email', 'both'] as const).map(ch => (
                <button key={ch} onClick={() => onUpdate(followup.id, { channel: ch })}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    followup.channel === ch ? 'bg-[#6A55F8] text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-[#6A55F8]/40'
                  }`}>
                  {ch === 'telegram' ? 'Telegram' : ch === 'email' ? 'Email' : 'Оба'}
                </button>
              ))}
            </div>
          </div>
          {/* Условие отмены */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={followup.cancel_on_reply}
              onChange={e => onUpdate(followup.id, { cancel_on_reply: e.target.checked })}
              className="rounded border-gray-300 text-[#6A55F8] focus:ring-[#6A55F8]" />
            <span className="text-xs text-gray-600">Отменить, если пользователь ответит</span>
          </label>
        </div>
      )}
    </div>
  )
}

// =============================================
// FOLLOWUP SECTION (секция внутри MessageCard)
// =============================================
function FollowupSection({ messageId }: { messageId: string }) {
  const supabase = createClient()
  const [followups, setFollowups] = useState<Followup[]>([])
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [sectionCollapsed, setSectionCollapsed] = useState(false)

  useEffect(() => {
    supabase.from('message_followups').select('*').eq('scenario_message_id', messageId).order('order_index')
      .then(({ data }) => {
        const items = (data ?? []) as Followup[]
        setFollowups(items)
        setEnabled(items.length > 0)
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId])

  async function toggleEnabled() {
    if (enabled) {
      // Выключаем — только скрываем, данные НЕ удаляем
      setEnabled(false)
    } else {
      setEnabled(true)
      setSectionCollapsed(false)
      if (followups.length === 0) {
        // Первый дожим — создаём в БД
        const row = { scenario_message_id: messageId, order_index: 0, delay_value: 1, delay_unit: 'hour', text: '', channel: 'telegram', cancel_on_reply: true, is_active: true }
        const { data, error } = await supabase.from('message_followups').insert(row).select().single()
        if (error) console.error('message_followups insert error:', error)
        if (data) setFollowups([data as Followup])
      }
    }
  }

  async function addFollowup() {
    if (followups.length >= 5) return
    const row = { scenario_message_id: messageId, order_index: followups.length, delay_value: 1, delay_unit: 'hour', text: '', channel: 'telegram', cancel_on_reply: true, is_active: true }
    const { data, error } = await supabase.from('message_followups').insert(row).select().single()
    if (error) console.error('message_followups insert error:', error)
    if (data) setFollowups(prev => [...prev, data as Followup])
  }

  async function updateFollowup(id: string, updates: Partial<Followup>) {
    setFollowups(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f))
    await supabase.from('message_followups').update(updates).eq('id', id)
  }

  async function deleteFollowup(id: string) {
    const remaining = followups.filter(f => f.id !== id)
    setFollowups(remaining)
    if (remaining.length === 0) setEnabled(false)
    await supabase.from('message_followups').delete().eq('id', id)
  }

  if (loading) return null

  const activeCount = followups.filter(f => f.is_active).length

  return (
    <div className="border-t border-gray-100 pt-4">
      <div className="flex items-center justify-between mb-2">
        {/* Главный тоггл + заголовок */}
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
            <FollowupCard key={f.id} followup={f} index={i} onUpdate={updateFollowup} onDelete={deleteFollowup} />
          ))}
        </div>
      )}
    </div>
  )
}

// =============================================
// MESSAGE EDITOR (карточка сообщения)
// =============================================
function MessageCard({
  msg, buttons, allMessages, onUpdate, onDelete, onAddButton, onDeleteButton, onUpdateButton
}: {
  msg: Message; buttons: Button[]; allMessages: Message[]
  onUpdate: (id: string, data: Partial<Message>) => void
  onDelete: (id: string) => void
  onAddButton: (messageId: string) => void
  onDeleteButton: (id: string) => void
  onUpdateButton: (id: string, data: Partial<Button>) => void
}) {
  const supabase = createClient()
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState<Partial<Message>>({})
  const [saving, setSaving] = useState(false)
  const isDirty = Object.keys(draft).length > 0
  const e = { ...msg, ...draft } // effective values

  function set(data: Partial<Message>) {
    setDraft(prev => ({ ...prev, ...data }))
  }

  async function handleSave() {
    if (!isDirty) return
    setSaving(true)
    const updates = {
      text: e.text, is_start: e.is_start, trigger_word: e.trigger_word,
      next_message_id: e.next_message_id, delay_minutes: e.delay_minutes, delay_unit: e.delay_unit,
    }
    if (!msg.id.startsWith('temp-')) {
      await supabase.from('scenario_messages').update(updates).eq('id', msg.id)
    }
    onUpdate(msg.id, updates) // синхронизируем родительский стейт
    setDraft({})
    setSaving(false)
  }

  function handleDiscard() {
    setDraft({})
  }

  const typeLabel = e.is_start ? '⭐ Стартовое' : '💬 Сообщение'
  const typeColor = e.is_start ? 'bg-green-100 text-green-700 border-green-200' : 'bg-blue-100 text-blue-700 border-blue-200'

  return (
    <div className={`bg-white rounded-xl border ${expanded ? 'border-[#6A55F8]/40 shadow-sm' : isDirty ? 'border-amber-300' : 'border-gray-100'} transition-all`}>
      {/* Header — always visible */}
      <div className="flex items-center gap-3 px-5 py-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="w-8 h-8 rounded-lg bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8]">
          {msg.order_position + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${typeColor}`}>{typeLabel}</span>
            {e.trigger_word && <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-mono">{e.trigger_word}</span>}
            {e.delay_minutes > 0 && <span className="text-xs text-gray-400">⏱ {e.delay_minutes} {e.delay_unit === 'sec' ? 'сек' : e.delay_unit === 'hour' ? 'ч' : e.delay_unit === 'day' ? 'дн' : 'мин'}</span>}
            {isDirty && <span className="text-xs text-amber-600 font-medium">● Не сохранено</span>}
          </div>
          <p className="text-sm text-gray-700 truncate">{e.text || 'Пустое сообщение'}</p>
        </div>
        <div className="flex items-center gap-2">
          {buttons.length > 0 && <span className="text-xs text-gray-400">{buttons.length} кнопок</span>}
          <span className="text-gray-400 text-sm">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4">
          {/* Text */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Текст сообщения</label>
            <textarea
              value={e.text || ''}
              onChange={ev => set({ text: ev.target.value })}
              placeholder="Введите текст сообщения..."
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] h-24 resize-none"
            />
          </div>

          {/* Type settings */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={e.is_start} onChange={ev => set({ is_start: ev.target.checked })}
                className="rounded border-gray-300 text-[#6A55F8] focus:ring-[#6A55F8]" />
              <span className="text-xs font-medium text-gray-700">⭐ Стартовое сообщение</span>
            </label>
          </div>

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
            {buttons.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">Нет кнопок</p>
            ) : (
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
          <FollowupSection messageId={msg.id} />

          {/* Save / Discard / Delete */}
          <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
            <button onClick={() => onDelete(msg.id)} className="text-xs text-red-400 hover:text-red-600 hover:underline">Удалить сообщение</button>
            {isDirty && (
              <div className="flex items-center gap-2">
                <button onClick={handleDiscard} className="px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100">Отменить</button>
                <button onClick={handleSave} disabled={saving}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#6A55F8] text-white hover:bg-[#5A45E8] disabled:opacity-50">
                  {saving ? 'Сохраняю...' : 'Сохранить'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
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
    if (onDeleted) onDeleted(scenario.id)
    onBack()
    await supabase.from('chatbot_scenarios').delete().eq('id', scenario.id)
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
  updated_at: string
  customers: { id: string; full_name: string | null; source_name: string | null } | null
}

function ScenarioDetail({ scenario, onBack, onDeleted, onDuplicated }: { scenario: Scenario; onBack: () => void; onDeleted?: (id: string) => void; onDuplicated?: (s: Scenario) => void }) {
  const [activeTab, setActiveTab] = useState<'scenario' | 'users' | 'analytics' | 'settings'>('scenario')
  const [showAI, setShowAI] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [buttons, setButtons] = useState<Button[]>([])
  const [loading, setLoading] = useState(true)
  const [botUsers, setBotUsers] = useState<BotConversation[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [analytics, setAnalytics] = useState<{
    totalReach: number; totalReplies: number; totalBtnClicks: number
    msgReach: { id: string; text: string | null; is_start: boolean; order_position: number; reach: number }[]
    btnCounts: [string, number][]
  } | null>(null)
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)
  const supabase = createClient()

  async function loadData() {
    const [msgsRes, btnsRes] = await Promise.all([
      supabase.from('scenario_messages').select('*').eq('scenario_id', scenario.id).order('order_position'),
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

    setAnalytics({
      totalReach: reachedConvIds.size,
      totalReplies,
      totalBtnClicks: btnActions?.length ?? 0,
      msgReach: messages.map(m => ({
        id: m.id, text: m.text, is_start: m.is_start,
        order_position: m.order_position,
        reach: convsByMsg[m.id]?.size ?? 0,
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

  async function deleteMessage(id: string) {
    const remaining = messages.filter(m => m.id !== id)
    setMessages(remaining)
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

                return (
                  <div key={msg.id}>
                    {/* Connection line */}
                    {idx > 0 && (
                      <div className="flex items-center gap-2 py-1.5 pl-4">
                        <div className="flex flex-col items-center">
                          <div className="w-px h-2 bg-[#6A55F8]/30" />
                          <div className="text-[#6A55F8] text-xs">↓</div>
                          <div className="w-px h-2 bg-[#6A55F8]/30" />
                        </div>
                        <div className="flex items-center gap-1.5">
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
                          {!hasIncomingLink && !msg.is_start && (
                            <span className="text-[10px] text-gray-300">не привязано</span>
                          )}
                        </div>
                      </div>
                    )}
                    <MessageCard
                      msg={msg}
                      buttons={msgButtons}
                      allMessages={messages}
                      onUpdate={updateMessage}
                      onDelete={deleteMessage}
                      onAddButton={addButton}
                      onDeleteButton={deleteButton}
                      onUpdateButton={updateButton}
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
                      const label = m.is_start ? '⭐ Стартовое' : `💬 Сообщение ${i + 1}`
                      const text = m.text ? (m.text.length > 60 ? m.text.slice(0, 60) + '…' : m.text) : '(без текста)'
                      return (
                        <div key={m.id} className="flex items-center gap-3">
                          <div className="w-28 flex-shrink-0">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${m.is_start ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-600'}`}>{label}</span>
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

      {activeTab === 'settings' && (
        <SettingsTab scenario={scenario} supabase={supabase} onBack={onBack} onDeleted={onDeleted} onDuplicated={onDuplicated} />
      )}

      <AiAssistantOverlay
        isOpen={showAI}
        onClose={() => setShowAI(false)}
        title="AI-помощник чат-бота"
        placeholder="Описать сценарий бота..."
        initialMessages={[{ from: 'ai' as const, text: 'Привет! Опиши сценарий — я создам сообщения и кнопки автоматически.' }]}
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
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newBotId, setNewBotId] = useState('')
  const [activePageTab, setActivePageTab] = useState<'scenarios' | 'users'>('scenarios')
  const [botAllUsers, setBotAllUsers] = useState<(BotConversation & { scenarioNames: string[] })[]>([])
  const [loadingBotUsers, setLoadingBotUsers] = useState(false)
  const [selectedBotFilter, setSelectedBotFilter] = useState<string | null>(null)

  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null)
  const urlSelectedId = searchParams.get('open') || null
  const selectedScenarioId = localSelectedId ?? urlSelectedId

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
      supabase.from('telegram_bots').select('id, name, bot_username').eq('project_id', projectId),
    ])
    setScenarios(scenariosRes.data ?? [])
    setBots(botsRes.data ?? [])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [projectId])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activePageTab === 'users') {
      loadBotUsers()
      // Выбираем первый бот по умолчанию, если фильтр ещё не установлен
      if (!selectedBotFilter) {
        const firstBotId = bots[0]?.id ?? null
        setSelectedBotFilter(firstBotId)
      }
    }
  }, [activePageTab, scenarios])

  async function loadBotUsers() {
    setLoadingBotUsers(true)
    // Берём все боты из сценариев этого проекта
    const botIds = [...new Set(scenarios.filter(s => s.telegram_bot_id).map(s => s.telegram_bot_id as string))]
    if (botIds.length === 0) { setBotAllUsers([]); setLoadingBotUsers(false); return }

    // Все разговоры по этим ботам
    const { data: convs } = await supabase
      .from('chatbot_conversations')
      .select('id, telegram_bot_id, telegram_first_name, telegram_username, telegram_user_id, updated_at, customers(id, full_name, source_name)')
      .in('telegram_bot_id', botIds)
      .order('updated_at', { ascending: false })
      .limit(200)
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

    const result = (convs as unknown as BotConversation[]).map(conv => ({
      ...conv,
      scenarioNames: [...(convScenarioMap[conv.id] ?? [])].map(sid => scenarioMap[sid]).filter(Boolean) as string[],
    }))
    setBotAllUsers(result)
    setLoadingBotUsers(false)
  }

  async function createScenario() {
    if (!newName.trim()) return
    const tempScenario: Scenario = {
      id: 'temp-' + Date.now(),
      name: newName.trim(),
      status: 'draft',
      telegram_bot_id: newBotId || null,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Чат-боты</h1>
          <p className="text-sm text-gray-500">Сценарии и автоматизация Telegram-ботов</p>
        </div>
        {activePageTab === 'scenarios' && (
          <button onClick={() => setCreating(true)} className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            + Создать сценарий
          </button>
        )}
      </div>

      {/* Вкладки страницы */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(['scenarios', 'users'] as const).map(tab => (
          <button key={tab} onClick={() => setActivePageTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activePageTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {tab === 'scenarios' ? '🤖 Сценарии' : '👥 Все пользователи'}
          </button>
        ))}
      </div>

      {activePageTab === 'users' && (
        <div className="space-y-3">
          {/* Фильтр по боту */}
          {bots.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {bots.map(b => (
                <button key={b.id} onClick={() => setSelectedBotFilter(b.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    selectedBotFilter === b.id
                      ? 'bg-[#6A55F8] text-white border-[#6A55F8]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-[#6A55F8]/40'
                  }`}>
                  @{b.bot_username}
                </button>
              ))}
            </div>
          )}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {loadingBotUsers ? (
            <div className="p-8 text-center text-sm text-gray-400">Загружаю...</div>
          ) : (() => {
            const filtered = selectedBotFilter
              ? botAllUsers.filter(c => c.telegram_bot_id === selectedBotFilter)
              : botAllUsers
            return filtered.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-3xl mb-3">👥</div>
                <p className="text-sm text-gray-500">Пока никто не писал боту</p>
              </div>
            ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-left">Пользователь</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-left">Username</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-left">Участвовал в сценариях</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-left">Источник</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-left">Активность</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(conv => {
                  const name = conv.customers?.full_name || conv.telegram_first_name || 'Без имени'
                  const source = conv.customers?.source_name
                  return (
                    <tr key={conv.id} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8] flex-shrink-0">
                            {name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-800 text-sm">{name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-sm">
                        {conv.telegram_username ? `@${conv.telegram_username}` : conv.telegram_user_id ? `ID: ${conv.telegram_user_id}` : '—'}
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
                      <td className="px-5 py-3 text-gray-500 text-xs">
                        {new Date(conv.updated_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )})()}
        </div>
        </div>
      )}

      {activePageTab === 'scenarios' && creating && (
        <div className="bg-white rounded-xl border border-[#6A55F8]/30 p-5 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Новый сценарий</h3>
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Название сценария"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
          {bots.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Привязать к боту</label>
              <select value={newBotId} onChange={e => setNewBotId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
                <option value="">Не привязывать</option>
                {bots.map(b => <option key={b.id} value={b.id}>@{b.bot_username} — {b.name}</option>)}
              </select>
            </div>
          )}
          {bots.length === 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">Сначала подключите Telegram-бота в Настройки → Интеграции</p>
          )}
          <div className="flex gap-2">
            <button onClick={createScenario} className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium">Создать</button>
            <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50">Отмена</button>
          </div>
        </div>
      )}

      {activePageTab === 'scenarios' && (loading ? (
        <SkeletonList count={3} />
      ) : scenarios.length === 0 && !creating ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-4">💬</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Нет сценариев</h3>
          <p className="text-sm text-gray-500 mb-6">Создайте сценарий для Telegram-бота</p>
        </div>
      ) : (
        <div className="space-y-3">
          {scenarios.map(s => (
            <button key={s.id} onClick={() => selectScenario(s.id)}
              className="w-full bg-white rounded-xl border border-gray-100 p-5 flex items-center justify-between hover:border-[#6A55F8]/30 hover:shadow-sm transition-all text-left">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-xl">🤖</div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{s.name}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>{s.status === 'active' ? 'Активен' : 'Черновик'}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{s.telegram_bot_id ? 'Привязан к боту' : 'Без бота'}</p>
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
