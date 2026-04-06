'use client'

import { useState } from 'react'

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
}: {
  isOpen: boolean
  onClose: () => void
  title?: string
  placeholder?: string
  initialMessages?: Message[]
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')

  if (!isOpen) return null

  function send() {
    if (!input.trim()) return
    setMessages(prev => [...prev, { from: 'user', text: input }, { from: 'ai', text: 'Понял! Обрабатываю...' }])
    setInput('')
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
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                  msg.from === 'user' ? 'bg-[#6A55F8] text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder={placeholder}
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10"
            />
            <button onClick={send} className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-5 py-3 rounded-xl text-sm font-medium transition-colors">Отправить</button>
          </div>
        </div>
      </div>
    </div>
  )
}
