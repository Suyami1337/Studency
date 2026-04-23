'use client'

import { useState, useRef, useEffect, ClipboardEvent, KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'

type ToolCallInfo = { name: string; summary: string; ok: boolean }
/** Картинка — data URL вида `data:image/png;base64,iVBOR...`. Храним целиком, на беке парсим. */
type ImageAttachment = { dataUrl: string }
type ChatEntry =
  | { kind: 'user'; text: string; images?: string[] }
  | { kind: 'ai'; text: string; tools?: ToolCallInfo[] }
  | { kind: 'system'; text: string }

// SpeechRecognition — webkit префикс в Chromium, стандарт в Safari. Типов в lib.dom нет — объявим минимальные.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionInstance = any
function getSpeechRecognitionCtor(): { new (): SpeechRecognitionInstance } | null {
  if (typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024  // 5 МБ на картинку

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

type PreviewButton = { text: string; type?: 'url' | 'goto' | 'trigger' | 'gate' | 'subscribe'; hint?: string }
type MessagePreview = { text: string; buttons?: PreviewButton[]; label?: string; note?: string; gate?: string }

// Парсит JSON из tg-preview блока. Возвращает null если не валиден.
function tryParsePreview(raw: string): MessagePreview | null {
  try {
    const obj = JSON.parse(raw)
    if (obj && typeof obj === 'object' && typeof obj.text === 'string') return obj as MessagePreview
  } catch { /* ignore */ }
  return null
}

function TelegramPreview({ preview }: { preview: MessagePreview }) {
  return (
    <div className="my-2 max-w-md">
      {preview.label && (
        <div className="text-[10px] font-semibold text-[#6A55F8] uppercase tracking-wide mb-1.5">
          {preview.label}
          {preview.gate && <span className="ml-2 text-purple-600">🚪 gate: {preview.gate}</span>}
        </div>
      )}
      {/* Telegram-style bubble */}
      <div className="bg-white rounded-2xl rounded-bl-md border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 text-[14px] leading-relaxed text-gray-900 whitespace-pre-wrap">
          {preview.text}
        </div>
        {preview.buttons && preview.buttons.length > 0 && (
          <div className="border-t border-gray-100 p-1.5 flex flex-col gap-1 bg-gray-50">
            {preview.buttons.map((btn, i) => (
              <div key={i} className={`rounded-lg px-3 py-2 text-[13px] font-medium flex items-center justify-between gap-2 ${
                btn.type === 'subscribe' ? 'bg-purple-100 text-purple-800'
                : btn.type === 'url' ? 'bg-blue-50 text-blue-700'
                : btn.type === 'goto' ? 'bg-green-50 text-green-700'
                : btn.type === 'trigger' ? 'bg-amber-50 text-amber-700'
                : 'bg-white text-gray-700 border border-gray-200'
              }`}>
                <span>{btn.text}</span>
                {btn.hint && <span className="text-[10px] opacity-70 truncate max-w-[50%]">{btn.hint}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      {preview.note && (
        <div className="text-[11px] text-gray-500 mt-1 italic">{preview.note}</div>
      )}
    </div>
  )
}

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
  persistKey,
}: {
  isOpen: boolean
  onClose: () => void
  title?: string
  placeholder?: string
  initialMessages?: ChatEntry[]
  context?: string
  /** If set — use agentic tool-use endpoint with conversation history */
  agent?: AgentConfig
  /** If set — conversation is persisted in localStorage under `ai-chat:<persistKey>` and survives reload */
  persistKey?: string
}) {
  const storageKey = persistKey ? `ai-chat:${persistKey}` : null

  function loadPersisted(): { entries: ChatEntry[]; history: unknown[] } | null {
    if (!storageKey || typeof window === 'undefined') return null
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (parsed && Array.isArray(parsed.entries)) return parsed
    } catch { /* ignore corrupt blob */ }
    return null
  }

  const persisted = loadPersisted()
  const [entries, setEntries] = useState<ChatEntry[]>(persisted?.entries ?? initialMessages)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [agentHistory, setAgentHistory] = useState<any[]>(persisted?.history as unknown[] ?? [])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [attachments, setAttachments] = useState<ImageAttachment[]>([])
  const [attachError, setAttachError] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const speechSupported = typeof window !== 'undefined' && !!getSpeechRecognitionCtor()

  // Авторесайз textarea: высота подстраивается под содержимое (от 1 строки до ~8)
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    const next = Math.min(ta.scrollHeight, 200)  // cap ~8 строк
    ta.style.height = next + 'px'
  }, [input])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [entries, loading])

  // Persist to localStorage whenever conversation changes
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ entries, history: agentHistory }))
    } catch { /* quota exceeded — skip */ }
  }, [entries, agentHistory, storageKey])

  // При открытии перечитываем из localStorage (если ключ задан) — чтобы если в соседней
  // вкладке добавилось сообщение, текущий overlay подтянул свежую версию. Если ключа
  // нет — сбрасываем в initialMessages как раньше.
  useEffect(() => {
    if (!isOpen) return
    if (storageKey) {
      const fresh = loadPersisted()
      if (fresh) {
        setEntries(fresh.entries)
        setAgentHistory((fresh.history as unknown[]) ?? [])
      }
    } else {
      setEntries(initialMessages)
      setAgentHistory([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  function resetConversation() {
    if (!confirm('Очистить всю переписку с AI? Это действие необратимо.')) return
    setEntries(initialMessages)
    setAgentHistory([])
    if (storageKey && typeof window !== 'undefined') {
      try { window.localStorage.removeItem(storageKey) } catch { /* ignore */ }
    }
  }

  if (!isOpen) return null

  async function addImagesFromFiles(files: FileList | File[]) {
    setAttachError(null)
    const arr = Array.from(files)
    const added: ImageAttachment[] = []
    for (const f of arr) {
      if (!f.type.startsWith('image/')) continue
      if (f.size > MAX_IMAGE_BYTES) {
        setAttachError(`«${f.name}» больше 5 МБ — пропущен`)
        continue
      }
      try {
        const dataUrl = await fileToDataUrl(f)
        added.push({ dataUrl })
      } catch {
        setAttachError('Не удалось прочитать картинку')
      }
    }
    if (added.length) setAttachments(prev => [...prev, ...added])
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items
    if (!items) return
    const images: File[] = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile()
        if (f) images.push(f)
      }
    }
    if (images.length) {
      e.preventDefault()
      void addImagesFromFiles(images)
    }
  }

  function toggleListening() {
    if (listening) {
      try { recognitionRef.current?.stop() } catch { /* ignore */ }
      setListening(false)
      return
    }
    const SR = getSpeechRecognitionCtor()
    if (!SR) {
      setAttachError('Голосовой ввод не поддерживается в этом браузере — попробуй Chrome или Safari')
      return
    }
    try {
      const r = new SR()
      r.lang = 'ru-RU'
      r.continuous = false
      r.interimResults = true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r.onresult = (event: any) => {
        let transcript = ''
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript
        }
        setInput(transcript.trim())
      }
      r.onend = () => setListening(false)
      r.onerror = () => setListening(false)
      r.start()
      recognitionRef.current = r
      setListening(true)
    } catch {
      setListening(false)
      setAttachError('Не удалось запустить микрофон')
    }
  }

  async function send() {
    const question = input.trim()
    const images = attachments.map(a => a.dataUrl)
    if ((!question && images.length === 0) || loading) return
    // Если распознавание активно — остановим перед отправкой
    if (listening) {
      try { recognitionRef.current?.stop() } catch { /* ignore */ }
      setListening(false)
    }
    setEntries(prev => [...prev, { kind: 'user', text: question, images: images.length ? images : undefined }])
    setInput('')
    setAttachments([])
    setLoading(true)
    try {
      if (agent) {
        const res = await fetch(agent.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...agent.payload, history: agentHistory, userMessage: question, attachments: images.length ? images : undefined }),
        })
        // Если Vercel обрезал функцию по таймауту — ответ приходит не JSON,
        // а plain-text ("An error occurred..."). Обрабатываем мягко, не теряя переписку.
        const text = await res.text()
        let json: { error?: string; hint?: string; assistantText?: string; toolCalls?: ToolCallInfo[]; history?: unknown[]; changesApplied?: boolean } | null = null
        try { json = JSON.parse(text) } catch { /* не JSON */ }
        if (!json) {
          const looksLikeTimeout = /An error occurred|FUNCTION_INVOCATION_TIMEOUT|504|Gateway/i.test(text)
          setEntries(prev => [...prev, { kind: 'ai', text: looksLikeTimeout
            ? '⏱ Сервер не успел обработать запрос за 60с. Часть изменений могла примениться — проверь редактор. Напиши «продолжай» чтобы дозаписать остальное маленькими шагами.'
            : `⚠️ Сервер вернул не-JSON ответ (status ${res.status}). Попробуй ещё раз.` }])
        } else if (json.error) {
          setEntries(prev => [...prev, { kind: 'ai', text: `⚠️ Ошибка: ${json!.error}${json!.hint ? '\n' + json!.hint : ''}` }])
        } else {
          setEntries(prev => [...prev, { kind: 'ai', text: json!.assistantText || 'Готово.', tools: json!.toolCalls }])
          setAgentHistory(json.history ?? [])
          if (json.changesApplied && agent.onChangesApplied) agent.onChangesApplied()
        }
      } else {
        const res = await fetch('/api/ai/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, context, attachments: images.length ? images : undefined }),
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
            <div className="flex items-center gap-3">
              {storageKey && entries.length > 1 && (
                <button onClick={resetConversation} className="text-white/70 hover:text-white text-xs transition-colors">↻ Новый диалог</button>
              )}
              <button onClick={onClose} className="text-white/70 hover:text-white transition-colors text-lg">✕</button>
            </div>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-3">
            {entries.map((entry, i) => {
              if (entry.kind === 'user') {
                return (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[70%] flex flex-col gap-1.5 items-end">
                      {entry.images && entry.images.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 justify-end">
                          {entry.images.map((src, idx) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={idx} src={src} alt={`attachment-${idx}`} className="max-w-[220px] max-h-[220px] rounded-lg border border-gray-200 object-cover" />
                          ))}
                        </div>
                      )}
                      {entry.text && (
                        <div className="rounded-xl px-4 py-3 text-sm leading-relaxed bg-[#6A55F8] text-white rounded-br-none whitespace-pre-wrap">
                          {entry.text}
                        </div>
                      )}
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
                          code: ({ className, children }) => {
                            // tg-preview code block — render as Telegram message preview
                            if (className === 'language-tg-preview' || className === 'language-tg') {
                              const preview = tryParsePreview(String(children ?? ''))
                              if (preview) return <TelegramPreview preview={preview} />
                            }
                            return <code className="bg-gray-200 text-[#6A55F8] px-1 py-0.5 rounded text-[13px] font-mono">{children}</code>
                          },
                          pre: ({ children }) => {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const child = (children as any)?.props
                            if (child?.className === 'language-tg-preview' || child?.className === 'language-tg') {
                              const preview = tryParsePreview(String(child.children ?? ''))
                              if (preview) return <TelegramPreview preview={preview} />
                            }
                            return <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto text-[13px] mb-2">{children}</pre>
                          },
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
          <div className="px-5 pt-3 pb-4 border-t border-gray-100 flex flex-col gap-2">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((a, idx) => (
                  <div key={idx} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.dataUrl} alt={`preview-${idx}`} className="w-16 h-16 rounded-lg border border-gray-200 object-cover" />
                    <button
                      onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Удалить"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            {attachError && (
              <div className="text-xs text-red-500">{attachError}</div>
            )}
            <div className="flex gap-2 items-end">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => {
                  if (e.target.files?.length) void addImagesFromFiles(e.target.files)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                title="Прикрепить картинку (или Cmd+V из буфера)"
                className="w-11 h-11 flex-shrink-0 rounded-xl border border-gray-200 text-gray-500 hover:text-[#6A55F8] hover:border-[#6A55F8]/30 transition-colors disabled:opacity-50"
              >
                📎
              </button>
              <button
                type="button"
                onClick={toggleListening}
                disabled={loading || !speechSupported}
                title={speechSupported ? (listening ? 'Остановить запись' : 'Надиктовать голосом') : 'Недоступно в этом браузере'}
                className={`w-11 h-11 flex-shrink-0 rounded-xl border transition-colors disabled:opacity-50 ${
                  listening
                    ? 'bg-red-500 border-red-500 text-white animate-pulse'
                    : 'border-gray-200 text-gray-500 hover:text-[#6A55F8] hover:border-[#6A55F8]/30'
                }`}
              >
                {listening ? '⏺' : '🎤'}
              </button>
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    void send()
                  }
                }}
                onPaste={handlePaste}
                placeholder={listening ? 'Говори...' : placeholder}
                disabled={loading}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10 disabled:bg-gray-50 resize-none leading-relaxed"
                style={{ minHeight: '44px', maxHeight: '200px' }}
              />
              <button
                onClick={send}
                disabled={loading || (!input.trim() && attachments.length === 0)}
                className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-5 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '...' : 'Отправить'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
