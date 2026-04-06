'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { AiAssistantButton, AiAssistantOverlay } from '@/components/ui/AiAssistant'

type Scenario = { id: string; name: string; status: string; telegram_bot_id: string | null; created_at: string }
type TelegramBot = { id: string; name: string; bot_username: string }
type Message = {
  id: string; scenario_id: string; order_position: number; text: string | null
  is_start: boolean; trigger_word: string | null; is_followup: boolean
  delay_minutes: number; followup_condition: string | null
  next_message_id: string | null; parent_message_id: string | null
}
type Button = {
  id: string; message_id: string; order_position: number; text: string
  action_type: string; action_url: string | null; action_trigger_word: string | null
  action_goto_message_id: string | null
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
  const [expanded, setExpanded] = useState(false)

  const typeLabel = msg.is_start ? '⭐ Стартовое' : msg.is_followup ? '🔔 Дожим' : '💬 Сообщение'
  const typeColor = msg.is_start ? 'bg-green-100 text-green-700 border-green-200' : msg.is_followup ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-blue-100 text-blue-700 border-blue-200'

  return (
    <div className={`bg-white rounded-xl border ${expanded ? 'border-[#6A55F8]/40 shadow-sm' : 'border-gray-100'} transition-all`}>
      {/* Header — always visible */}
      <div className="flex items-center gap-3 px-5 py-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="w-8 h-8 rounded-lg bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8]">
          {msg.order_position + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${typeColor}`}>{typeLabel}</span>
            {msg.trigger_word && <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-mono">{msg.trigger_word}</span>}
            {msg.delay_minutes > 0 && <span className="text-xs text-gray-400">⏱ {msg.delay_minutes >= 60 ? `${Math.round(msg.delay_minutes / 60)}ч` : `${msg.delay_minutes}мин`}</span>}
          </div>
          <p className="text-sm text-gray-700 truncate">{msg.text || 'Пустое сообщение'}</p>
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
              value={msg.text || ''}
              onChange={e => onUpdate(msg.id, { text: e.target.value })}
              placeholder="Введите текст сообщения..."
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] h-24 resize-none"
            />
          </div>

          {/* Type settings */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={msg.is_start} onChange={e => onUpdate(msg.id, { is_start: e.target.checked, is_followup: false })}
                className="rounded border-gray-300 text-[#6A55F8] focus:ring-[#6A55F8]" />
              <span className="text-xs font-medium text-gray-700">⭐ Стартовое сообщение</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={msg.is_followup} onChange={e => onUpdate(msg.id, { is_followup: e.target.checked, is_start: false })}
                className="rounded border-gray-300 text-[#6A55F8] focus:ring-[#6A55F8]" />
              <span className="text-xs font-medium text-gray-700">🔔 Дожим</span>
            </label>
          </div>

          {/* Trigger word (if start) */}
          {msg.is_start && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Кодовое слово (триггер)</label>
              <input type="text" value={msg.trigger_word || ''} onChange={e => onUpdate(msg.id, { trigger_word: e.target.value })}
                placeholder="/start, привет, любое слово..."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:border-[#6A55F8]" />
            </div>
          )}

          {/* Delay (if followup or has delay) */}
          {(msg.is_followup || msg.delay_minutes > 0) && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Задержка перед отправкой</label>
              <div className="flex items-center gap-2">
                <input type="number" value={msg.delay_minutes} onChange={e => onUpdate(msg.id, { delay_minutes: parseInt(e.target.value) || 0 })}
                  className="w-24 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
                <span className="text-xs text-gray-500">минут</span>
                <span className="text-xs text-gray-400 ml-2">
                  (= {msg.delay_minutes >= 60 ? `${Math.round(msg.delay_minutes / 60)} ч` : `${msg.delay_minutes} мин`})
                </span>
              </div>
            </div>
          )}

          {msg.is_followup && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Условие дожима</label>
              <select value={msg.followup_condition || 'no_action'} onChange={e => onUpdate(msg.id, { followup_condition: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
                <option value="no_action">Если не совершил действие</option>
                <option value="no_button_click">Если не нажал кнопку</option>
                <option value="no_reply">Если не ответил</option>
              </select>
            </div>
          )}

          {/* Buttons */}
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
                      <input type="text" value={btn.text} onChange={e => onUpdateButton(btn.id, { text: e.target.value })}
                        placeholder="Текст кнопки" className="flex-1 px-2 py-1.5 rounded border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
                      <button onClick={() => onDeleteButton(btn.id)} className="text-xs text-gray-400 hover:text-red-500">✕</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <select value={btn.action_type} onChange={e => onUpdateButton(btn.id, { action_type: e.target.value })}
                        className="px-2 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:border-[#6A55F8]">
                        <option value="url">Ссылка</option>
                        <option value="trigger">Запустить кодовое слово</option>
                        <option value="goto_message">Перейти к сообщению</option>
                      </select>
                      {btn.action_type === 'url' && (
                        <input type="text" value={btn.action_url || ''} onChange={e => onUpdateButton(btn.id, { action_url: e.target.value })}
                          placeholder="https://..." className="flex-1 px-2 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:border-[#6A55F8]" />
                      )}
                      {btn.action_type === 'trigger' && (
                        <input type="text" value={btn.action_trigger_word || ''} onChange={e => onUpdateButton(btn.id, { action_trigger_word: e.target.value })}
                          placeholder="Кодовое слово..." className="flex-1 px-2 py-1.5 rounded border border-gray-200 text-xs font-mono focus:outline-none focus:border-[#6A55F8]" />
                      )}
                      {btn.action_type === 'goto_message' && (
                        <select value={btn.action_goto_message_id || ''} onChange={e => onUpdateButton(btn.id, { action_goto_message_id: e.target.value || null })}
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

          {/* Delete */}
          <div className="pt-2 border-t border-gray-100 flex justify-end">
            <button onClick={() => onDelete(msg.id)} className="text-xs text-red-500 hover:underline">Удалить сообщение</button>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================
// SCENARIO DETAIL
// =============================================
function ScenarioDetail({ scenario, onBack }: { scenario: Scenario; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<'scenario' | 'users' | 'analytics' | 'settings'>('scenario')
  const [showAI, setShowAI] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [buttons, setButtons] = useState<Button[]>([])
  const [loading, setLoading] = useState(true)
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData() }, [scenario.id])

  async function addMessage() {
    await supabase.from('scenario_messages').insert({
      scenario_id: scenario.id,
      order_position: messages.length,
      text: '',
      is_start: messages.length === 0,
      trigger_word: messages.length === 0 ? '/start' : null,
    })
    await loadData()
  }

  async function updateMessage(id: string, data: Partial<Message>) {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...data } : m))
    await supabase.from('scenario_messages').update(data).eq('id', id)
  }

  async function deleteMessage(id: string) {
    await supabase.from('scenario_messages').delete().eq('id', id)
    // Reorder remaining messages
    const remaining = messages.filter(m => m.id !== id)
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].order_position !== i) {
        await supabase.from('scenario_messages').update({ order_position: i }).eq('id', remaining[i].id)
      }
    }
    await loadData()
  }

  async function addButton(messageId: string) {
    const msgButtons = buttons.filter(b => b.message_id === messageId)
    await supabase.from('scenario_buttons').insert({
      message_id: messageId,
      order_position: msgButtons.length,
      text: 'Кнопка',
      action_type: 'url',
    })
    await loadData()
  }

  async function deleteButton(id: string) {
    await supabase.from('scenario_buttons').delete().eq('id', id)
    await loadData()
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
            <div className="text-center py-8 text-gray-400 text-sm">Загрузка...</div>
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
                return (
                  <div key={msg.id}>
                    {/* Connection line */}
                    {idx > 0 && (
                      <div className="flex items-center gap-2 py-1 pl-9">
                        <div className="w-px h-4 bg-gray-200 ml-3" />
                        {msg.delay_minutes > 0 && (
                          <span className="text-[10px] text-gray-400">⏱ через {msg.delay_minutes >= 60 ? `${Math.round(msg.delay_minutes / 60)}ч` : `${msg.delay_minutes}мин`}</span>
                        )}
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
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400 text-sm">
          Пользователи появятся после того как бот начнёт получать сообщения
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400 text-sm">
          Аналитика появится после того как бот начнёт получать сообщения
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="max-w-xl bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Название сценария</label>
            <input type="text" defaultValue={scenario.name} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Статус</label>
            <p className="text-sm text-gray-500">{scenario.status === 'active' ? 'Активен' : 'Черновик'}</p>
          </div>
        </div>
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
  const projectId = params.id as string
  const supabase = createClient()

  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [bots, setBots] = useState<TelegramBot[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newBotId, setNewBotId] = useState('')

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

  async function createScenario() {
    if (!newName.trim()) return
    await supabase.from('chatbot_scenarios').insert({
      project_id: projectId,
      name: newName.trim(),
      telegram_bot_id: newBotId || null,
    })
    setNewName('')
    setNewBotId('')
    setCreating(false)
    await load()
  }

  const selectedScenario = scenarios.find(s => s.id === selectedScenarioId)

  if (selectedScenario) {
    return <ScenarioDetail scenario={selectedScenario} onBack={() => setSelectedScenarioId(null)} />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Чат-боты</h1>
          <p className="text-sm text-gray-500">Сценарии и автоматизация Telegram-ботов</p>
        </div>
        <button onClick={() => setCreating(true)} className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Создать сценарий
        </button>
      </div>

      {creating && (
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

      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Загрузка...</div>
      ) : scenarios.length === 0 && !creating ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-4">💬</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Нет сценариев</h3>
          <p className="text-sm text-gray-500 mb-6">Создайте сценарий для Telegram-бота</p>
        </div>
      ) : (
        <div className="space-y-3">
          {scenarios.map(s => (
            <button key={s.id} onClick={() => setSelectedScenarioId(s.id)}
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
      )}
    </div>
  )
}
