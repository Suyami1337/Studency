'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Bot = { id: string; name: string; bot_username: string | null }

export default function AiPage() {
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()

  const [mode, setMode] = useState<'scenario' | 'landing' | 'assistant'>('scenario')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Scenario-specific
  const [bots, setBots] = useState<Bot[]>([])
  const [selectedBotId, setSelectedBotId] = useState('')

  // Assistant-specific
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('telegram_bots')
      .select('id, name, bot_username')
      .eq('project_id', projectId)
      .then(({ data }) => setBots((data ?? []) as Bot[]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function handleGenerate() {
    setError(null)
    setResult(null)
    setLoading(true)

    try {
      if (mode === 'scenario') {
        if (!selectedBotId) { setError('Выбери бота'); setLoading(false); return }
        const res = await fetch('/api/ai/generate-scenario', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description, telegram_bot_id: selectedBotId }),
        })
        const json = await res.json()
        if (json.error) {
          setError(json.error + (json.hint ? '\n' + json.hint : ''))
        } else {
          setResult(`✅ Сценарий "${json.scenario.name}" создан!\n\n${json.scenario.messages.length} сообщений добавлено. Открой вкладку Чат-боты чтобы увидеть.`)
        }
      } else if (mode === 'landing') {
        const res = await fetch('/api/ai/generate-landing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description }),
        })
        const json = await res.json()
        if (json.error) {
          setError(json.error + (json.hint ? '\n' + json.hint : ''))
        } else {
          setResult(JSON.stringify(json.content, null, 2))
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка')
    } finally {
      setLoading(false)
    }
  }

  async function handleAsk() {
    setError(null)
    setAnswer(null)
    setLoading(true)
    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const json = await res.json()
      if (json.error) setError(json.error + (json.hint ? '\n' + json.hint : ''))
      else setAnswer(json.answer)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">AI-помощник</h1>
        <p className="text-sm text-gray-500 mt-0.5">Генерация сценариев, лендингов и ответы на вопросы через Claude AI</p>
      </div>

      {/* Mode switcher */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-5">
        {[
          { id: 'scenario', label: '🤖 Сценарий бота' },
          { id: 'landing', label: '🌐 Лендинг' },
          { id: 'assistant', label: '💬 Вопрос-ответ' },
        ].map(m => (
          <button key={m.id} onClick={() => setMode(m.id as 'scenario' | 'landing' | 'assistant')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === m.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'scenario' && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Выбери бота</label>
            <select value={selectedBotId} onChange={e => setSelectedBotId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]">
              <option value="">— Выбери бота —</option>
              {bots.map(b => <option key={b.id} value={b.id}>@{b.bot_username} — {b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Описание бота</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={6}
              placeholder="Опиши что должен делать бот. Например: 'Бот для онлайн-школы английского. Собирает заявки, рассказывает о курсах, предлагает бесплатный урок, мотивирует записаться.'"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] resize-none"
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={loading || !description.trim()}
            className="bg-gradient-to-r from-[#6A55F8] to-[#8B7BFA] text-white px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
            {loading ? '✨ Генерирую…' : '✨ Сгенерировать сценарий'}
          </button>
        </div>
      )}

      {mode === 'landing' && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Описание продукта</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={6}
              placeholder="Опиши продукт, ценность, целевую аудиторию. Например: 'Онлайн-курс по инвестициям для начинающих. 8 недель, практика на реальных данных, поддержка в чате.'"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] resize-none"
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={loading || !description.trim()}
            className="bg-gradient-to-r from-[#6A55F8] to-[#8B7BFA] text-white px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
            {loading ? '✨ Генерирую…' : '✨ Сгенерировать лендинг'}
          </button>
        </div>
      )}

      {mode === 'assistant' && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Твой вопрос</label>
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              rows={4}
              placeholder="Например: 'Как сделать воронку для продажи курса через Telegram?'"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] resize-none"
            />
          </div>
          <button
            onClick={handleAsk}
            disabled={loading || !question.trim()}
            className="bg-gradient-to-r from-[#6A55F8] to-[#8B7BFA] text-white px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
            {loading ? '💭 Думаю…' : '💬 Спросить'}
          </button>

          {answer && (
            <div className="bg-[#F8F7FF] border border-[#6A55F8]/20 rounded-lg p-4">
              <p className="text-sm text-gray-900 whitespace-pre-line">{answer}</p>
            </div>
          )}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mt-5 bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-900 whitespace-pre-line">{result}</p>
        </div>
      )}

      {error && (
        <div className="mt-5 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-900 whitespace-pre-line">{error}</p>
        </div>
      )}
    </div>
  )
}
