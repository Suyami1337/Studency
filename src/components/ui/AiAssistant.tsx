'use client'

import { useState, useRef, useEffect } from 'react'

type Message = { from: 'ai' | 'user'; text: string }

export function AiAssistantButton({ isOpen, onClick }: { isOpen: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
        isOpen ? 'bg-[#6A55F8] text-white' : 'border border-[#6A55F8] text-[#6A55F8] hover:bg-[#F0EDFF]'
      }`}
    >
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${isOpen ? 'bg-white/20 text-white' : 'bg-[#6A55F8] text-white'}`}>AI</div>
      {isOpen ? 'Скрыть AI' : 'AI-помощник'}
    </button>
  )
}

export function AiAssistantOverlay({
  isOpen,
  onClose,
  title = 'AI-помощник',
  placeholder = 'Описать что нужно...',
  initialMessages = [{ from: 'ai' as const, text: 'Привет! Чем могу помочь?' }],
  context,
}: {
  isOpen: boolean
  onClose: () => void
  title?: string
  placeholder?: string
  initialMessages?: Message[]
  context?: string
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  if (!isOpen) return null

  async function send() {
    const question = input.trim()
    if (!question || loading) return
    setMessages(prev => [...prev, { from: 'user', text: question }])
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context }),
      })
      const json = await res.json()
      const text = json.error
        ? `⚠️ Ошибка: ${json.error}${json.hint ? '\n' + json.hint : ''}`
        : (json.answer || 'Пустой ответ')
      setMessages(prev => [...prev, { from: 'ai', text }])
    } catch (err) {
      setMessages(prev => [...prev, { from: 'ai', text: '⚠️ Ошибка сети: ' + (err instanceof Error ? err.message : 'unknown') }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4" onClick={onClose}>
        <div className="w-full max-w-5xl h-[90vh] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden relative" onClick={e => e.stopPropagation()}>
          <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-[#6A55F8] to-[#8B7BFA] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-bold">AI</div>
              <span className="text-sm font-semibold text-white">{title}</span>
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white transition-colors text-lg">✕</button>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.from === 'user' ? 'bg-[#6A55F8] text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-500 rounded-xl px-4 py-3 text-sm rounded-bl-none flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </div>
          <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder={placeholder}
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10 disabled:bg-gray-50"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-5 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '...' : 'Отправить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
