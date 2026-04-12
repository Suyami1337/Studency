'use client'

import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'

type ToolCallInfo = { name: string; summary: string; ok: boolean }
type ChatEntry =
  | { kind: 'user'; text: string }
  | { kind: 'ai'; text: string; tools?: ToolCallInfo[] }
  | { kind: 'system'; text: string }

export type AgentConfig = {
  endpoint: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>
  onChangesApplied?: () => void
}

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
  initialMessages = [{ kind: 'ai' as const, text: 'Привет! Чем могу помочь?' }],
  context,
  agent,
}: {
  isOpen: boolean
  onClose: () => void
  title?: string
  placeholder?: string
  initialMessages?: ChatEntry[]
  context?: string
  /** If set — use agentic tool-use endpoint with conversation history */
  agent?: AgentConfig
}) {
  const [entries, setEntries] = useState<ChatEntry[]>(initialMessages)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [agentHistory, setAgentHistory] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [entries, loading])

  // Reset on reopen — fresh conversation each time overlay opens
  useEffect(() => {
    if (isOpen) {
      setEntries(initialMessages)
      setAgentHistory([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  if (!isOpen) return null

  async function send() {
    const question = input.trim()
    if (!question || loading) return
    setEntries(prev => [...prev, { kind: 'user', text: question }])
    setInput('')
    setLoading(true)
    try {
      if (agent) {
        const res = await fetch(agent.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...agent.payload, history: agentHistory, userMessage: question }),
        })
        const json = await res.json()
        if (json.error) {
          setEntries(prev => [...prev, { kind: 'ai', text: `⚠️ Ошибка: ${json.error}${json.hint ? '\n' + json.hint : ''}` }])
        } else {
          setEntries(prev => [...prev, { kind: 'ai', text: json.assistantText || 'Готово.', tools: json.toolCalls }])
          setAgentHistory(json.history ?? [])
          if (json.changesApplied && agent.onChangesApplied) agent.onChangesApplied()
        }
      } else {
        const res = await fetch('/api/ai/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, context }),
        })
        const json = await res.json()
        const text = json.error
          ? `⚠️ Ошибка: ${json.error}${json.hint ? '\n' + json.hint : ''}`
          : (json.answer || 'Пустой ответ')
        setEntries(prev => [...prev, { kind: 'ai', text }])
      }
    } catch (err) {
      setEntries(prev => [...prev, { kind: 'ai', text: '⚠️ Ошибка сети: ' + (err instanceof Error ? err.message : 'unknown') }])
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
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-white">{title}</span>
                {agent && <span className="text-[10px] text-white/70">Агент · применяет изменения после подтверждения</span>}
              </div>
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white transition-colors text-lg">✕</button>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-3">
            {entries.map((entry, i) => {
              if (entry.kind === 'user') {
                return (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[70%] rounded-xl px-4 py-3 text-sm leading-relaxed bg-[#6A55F8] text-white rounded-br-none whitespace-pre-wrap">
                      {entry.text}
                    </div>
                  </div>
                )
              }
              if (entry.kind === 'system') {
                return (
                  <div key={i} className="flex justify-center">
                    <div className="text-xs text-gray-500 italic">{entry.text}</div>
                  </div>
                )
              }
              return (
                <div key={i} className="flex justify-start">
                  <div className="max-w-[80%] flex flex-col gap-2">
                    {entry.tools && entry.tools.length > 0 && (
                      <div className="bg-[#F0EDFF] border border-[#6A55F8]/20 rounded-lg px-3 py-2 text-xs">
                        {entry.tools.map((t, idx) => (
                          <div key={idx} className={`flex items-center gap-1.5 ${t.ok ? 'text-[#6A55F8]' : 'text-red-600'}`}>
                            <span>{t.ok ? '✓' : '⚠'}</span>
                            <span className="font-mono text-[11px] opacity-70">{t.name}</span>
                            <span>— {t.summary}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="rounded-xl px-4 py-3 text-sm leading-relaxed bg-gray-100 text-gray-800 rounded-bl-none ai-markdown">
                      <ReactMarkdown
                        components={{
                          h1: ({ children }) => <div className="text-base font-bold text-gray-900 mt-2 mb-1.5 first:mt-0">{children}</div>,
                          h2: ({ children }) => <div className="text-sm font-bold text-gray-900 mt-2 mb-1 first:mt-0">{children}</div>,
                          h3: ({ children }) => <div className="text-sm font-semibold text-gray-900 mt-1.5 mb-1 first:mt-0">{children}</div>,
                          h4: ({ children }) => <div className="text-sm font-semibold text-gray-800 mt-1.5 mb-1 first:mt-0">{children}</div>,
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc pl-5 mb-2 last:mb-0 space-y-0.5">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 last:mb-0 space-y-0.5">{children}</ol>,
                          li: ({ children }) => <li>{children}</li>,
                          strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                          em: ({ children }) => <em className="italic">{children}</em>,
                          code: ({ children }) => <code className="bg-gray-200 text-[#6A55F8] px-1 py-0.5 rounded text-[13px] font-mono">{children}</code>,
                          pre: ({ children }) => <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto text-[13px] mb-2">{children}</pre>,
                          hr: () => <hr className="my-2 border-gray-300" />,
                          blockquote: ({ children }) => <blockquote className="border-l-2 border-[#6A55F8] pl-3 text-gray-600 italic mb-2">{children}</blockquote>,
                          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#6A55F8] underline">{children}</a>,
                        }}
                      >
                        {entry.text}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              )
            })}
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
