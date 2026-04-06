'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { AiAssistantButton, AiAssistantOverlay } from '@/components/ui/AiAssistant'

type Scenario = { id: string; name: string; status: string; telegram_bot_id: string | null; created_at: string }
type TelegramBot = { id: string; name: string; bot_username: string }
type Step = { id: string; scenario_id: string; order_position: number; step_type: string; content: string | null; delay_seconds: number; button_text: string | null; button_url: string | null }

const stepTypeIcon: Record<string, string> = { message: '💬', button: '🔘', delay: '⏱', condition: '⚡', action: '⚙️' }

function ScenarioDetail({ scenario, onBack, projectId }: { scenario: Scenario; onBack: () => void; projectId: string }) {
  const [activeTab, setActiveTab] = useState<'scenario' | 'users' | 'analytics' | 'settings'>('scenario')
  const [showAI, setShowAI] = useState(false)
  const [steps, setSteps] = useState<Step[]>([])
  const [loading, setLoading] = useState(true)
  const [addingStep, setAddingStep] = useState(false)
  const [newStepType, setNewStepType] = useState('message')
  const [newStepContent, setNewStepContent] = useState('')
  const supabase = createClient()

  async function loadSteps() {
    const { data } = await supabase.from('scenario_steps').select('*').eq('scenario_id', scenario.id).order('order_position')
    setSteps(data ?? [])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadSteps() }, [scenario.id])

  async function addStep() {
    if (!newStepContent.trim() && newStepType !== 'delay') return
    await supabase.from('scenario_steps').insert({
      scenario_id: scenario.id,
      order_position: steps.length,
      step_type: newStepType,
      content: newStepContent.trim() || null,
      delay_seconds: newStepType === 'delay' ? 3600 : 0,
      button_text: newStepType === 'button' ? newStepContent.trim() : null,
    })
    setNewStepContent('')
    setAddingStep(false)
    await loadSteps()
  }

  async function removeStep(id: string) {
    await supabase.from('scenario_steps').delete().eq('id', id)
    await loadSteps()
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
            <p className="text-xs text-gray-500">{steps.length} шагов</p>
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
        <div className="space-y-2">
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Загрузка...</div>
          ) : steps.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
              Добавьте первый шаг сценария
            </div>
          ) : (
            steps.map((step, idx) => (
              <div key={step.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-start gap-3 group hover:border-[#6A55F8]/30 transition-colors">
                <div className="w-7 h-7 rounded-lg bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8] flex-shrink-0 mt-0.5">{idx + 1}</div>
                <span className="text-base mt-0.5">{stepTypeIcon[step.step_type] ?? '📌'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700">{step.content || step.button_text || `Задержка ${step.delay_seconds}с`}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{step.step_type === 'delay' ? `⏱ ${Math.round(step.delay_seconds / 60)} мин` : step.step_type}</p>
                </div>
                <button onClick={() => removeStep(step.id)} className="text-xs text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">✕</button>
              </div>
            ))
          )}

          {addingStep ? (
            <div className="bg-white rounded-xl border border-[#6A55F8]/30 p-4 space-y-3">
              <div className="flex gap-2">
                {['message', 'button', 'delay'].map(t => (
                  <button key={t} onClick={() => setNewStepType(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${newStepType === t ? 'bg-[#6A55F8] text-white' : 'border border-gray-200 text-gray-600'}`}>
                    {stepTypeIcon[t]} {t === 'message' ? 'Сообщение' : t === 'button' ? 'Кнопка' : 'Задержка'}
                  </button>
                ))}
              </div>
              <input type="text" value={newStepContent} onChange={e => setNewStepContent(e.target.value)}
                placeholder={newStepType === 'delay' ? 'Задержка добавится автоматически' : 'Текст сообщения или кнопки...'}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]"
                disabled={newStepType === 'delay'}
              />
              <div className="flex gap-2">
                <button onClick={addStep} className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium">Добавить</button>
                <button onClick={() => setAddingStep(false)} className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50">Отмена</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAddingStep(true)}
              className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-[#6A55F8] hover:text-[#6A55F8] transition-colors">
              + Добавить шаг
            </button>
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
            <label className="block text-xs font-medium text-gray-700 mb-1">Привязан к боту</label>
            <p className="text-sm text-gray-500">{scenario.telegram_bot_id ? 'Привязан' : 'Не привязан'}</p>
          </div>
        </div>
      )}

      <AiAssistantOverlay
        isOpen={showAI}
        onClose={() => setShowAI(false)}
        title="AI-помощник чат-бота"
        placeholder="Описать сценарий бота..."
        initialMessages={[{ from: 'ai' as const, text: 'Привет! Опиши сценарий бота — я создам шаги автоматически.' }]}
      />
    </div>
  )
}

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
    return <ScenarioDetail scenario={selectedScenario} onBack={() => setSelectedScenarioId(null)} projectId={projectId} />
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
                      s.status === 'active' ? 'bg-green-100 text-green-700' : s.status === 'paused' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                    }`}>{s.status === 'active' ? 'Активен' : s.status === 'paused' ? 'Пауза' : 'Черновик'}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {s.telegram_bot_id ? 'Привязан к боту' : 'Без бота'}
                  </p>
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
