'use client'

import { useState } from 'react'
import { courses, clients } from '@/lib/mock-data'

type Course = typeof courses[number]

const fakeLessonsMap: Record<number, { id: number; title: string; done: boolean }[][]> = {
  1: [
    [
      { id: 1, title: 'Что такое AI-маркетинг', done: true },
      { id: 2, title: 'Инструменты AI для бизнеса', done: true },
      { id: 3, title: 'Первый промпт для маркетинга', done: true },
      { id: 4, title: 'Практика: напиши оффер с AI', done: false },
    ],
    [
      { id: 5, title: 'ChatGPT для копирайтинга', done: true },
      { id: 6, title: 'Создание контент-плана', done: true },
      { id: 7, title: 'Автоматизация e-mail рассылок', done: false },
      { id: 8, title: 'Домашнее задание: контент-план', done: false },
    ],
    [
      { id: 9, title: 'Архитектура автоворонки', done: false },
      { id: 10, title: 'Чат-боты в Telegram', done: false },
      { id: 11, title: 'Интеграции и Webhook', done: false },
      { id: 12, title: 'Практика: настрой воронку', done: false },
    ],
    [
      { id: 13, title: 'Масштабирование трафика', done: false },
      { id: 14, title: 'Команда на удалёнке с AI', done: false },
      { id: 15, title: 'Метрики роста бизнеса', done: false },
      { id: 16, title: 'Финальный проект', done: false },
    ],
  ],
  2: [
    [
      { id: 1, title: 'Введение: что будет на курсе', done: true },
      { id: 2, title: '5 нейросетей для старта', done: true },
      { id: 3, title: 'Практика за 3 часа', done: false },
    ],
  ],
}

const fakeChatAI = [
  { from: 'ai', text: 'Привет! Я помогу создать программу обучения. Опиши что за курс, и я создам модули, уроки, тарифы.' },
  { from: 'user', text: 'Создай курс по AI-маркетингу: 4 модуля, от основ до масштабирования' },
  { from: 'ai', text: 'Создал 4 модуля с 16 уроками. Какие тарифы создать?' },
]

const fakeStudents = clients.slice(0, 5).map((c, i) => ({
  ...c,
  currentModule: `Модуль ${Math.min(i + 1, 4)}`,
  currentLesson: `Урок ${(i % 4) + 1}`,
  progress: [85, 62, 45, 30, 15][i],
}))

// Fake lesson blocks for lesson editor
const fakeLessonBlocks = [
  { type: 'video', content: 'https://youtube.com/watch?v=example' },
  { type: 'heading', content: 'Что ты узнаешь из этого урока' },
  { type: 'text', content: 'В этом уроке мы разберём основы AI-маркетинга и как нейросети могут автоматизировать рутинные задачи.' },
  { type: 'homework', content: 'Напиши оффер для своего продукта с помощью ChatGPT. Прикрепи результат ниже.' },
]

const blockTypeIcon: Record<string, string> = { video: '🎬', heading: '📌', text: '📄', homework: '📝', image: '🖼', button: '🔘' }
const blockTypeLabel: Record<string, string> = { video: 'Видео', heading: 'Заголовок', text: 'Текст', homework: 'Домашнее задание', image: 'Изображение', button: 'Кнопка' }

function CourseDetail({ course, onBack }: { course: Course; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<'content' | 'edit' | 'analytics' | 'users'>('content')
  const [showAI, setShowAI] = useState(false)
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set([0]))
  const [chatInput, setChatInput] = useState('')
  const [aiMessages, setAiMessages] = useState(fakeChatAI)
  const [editingLessonId, setEditingLessonId] = useState<number | null>(null)
  const [userFilter, setUserFilter] = useState<string>('all')
  const moduleLessons = fakeLessonsMap[course.id] ?? []

  function toggleModule(idx: number) {
    setExpandedModules(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }

  function sendMessage() {
    if (!chatInput.trim()) return
    setAiMessages(prev => [...prev, { from: 'user', text: chatInput }, { from: 'ai', text: 'Понял! Обновляю программу курса...' }])
    setChatInput('')
  }

  // Build filter options
  const filterOptions: { value: string; label: string }[] = [{ value: 'all', label: 'Все ученики' }]
  course.modulesList.forEach((mod, mIdx) => {
    filterOptions.push({ value: `m${mIdx}`, label: mod.name })
    ;(moduleLessons[mIdx] ?? []).forEach((l, lIdx) => {
      filterOptions.push({ value: `l${l.id}`, label: `  ↳ ${mIdx + 1}.${lIdx + 1} ${l.title}` })
    })
  })

  const tabs = [
    { id: 'content' as const, label: 'Обучение' },
    { id: 'edit' as const, label: 'Редактор' },
    { id: 'analytics' as const, label: 'Аналитика' },
    { id: 'users' as const, label: 'Пользователи' },
  ]

  // Lesson editor view
  if (editingLessonId !== null) {
    const allLessons = moduleLessons.flat()
    const lesson = allLessons.find(l => l.id === editingLessonId)
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setEditingLessonId(null)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">← Назад к курсу</button>
          <h1 className="text-xl font-bold text-gray-900">{lesson?.title ?? 'Урок'}</h1>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Блоки урока</h3>
            <span className="text-xs text-gray-400">{fakeLessonBlocks.length} блоков</span>
          </div>
          <div className="space-y-3">
            {fakeLessonBlocks.map((block, idx) => (
              <div key={idx} className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100 group hover:border-[#6A55F8]/30 transition-colors">
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <span className="text-lg">{blockTypeIcon[block.type]}</span>
                  <span className="text-[10px] text-gray-400">{blockTypeLabel[block.type]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  {block.type === 'video' && (
                    <div className="bg-gray-900 rounded-lg h-32 flex items-center justify-center text-white text-sm">▶ Видео плеер</div>
                  )}
                  {block.type === 'heading' && (
                    <input type="text" defaultValue={block.content} className="text-lg font-bold text-gray-900 bg-transparent w-full focus:outline-none" />
                  )}
                  {block.type === 'text' && (
                    <textarea defaultValue={block.content} className="w-full text-sm text-gray-700 bg-transparent resize-none focus:outline-none h-16" />
                  )}
                  {block.type === 'homework' && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-xs font-medium text-amber-700 mb-1">📝 Домашнее задание</p>
                      <textarea defaultValue={block.content} className="w-full text-sm text-gray-700 bg-transparent resize-none focus:outline-none h-12" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button className="text-xs text-gray-400 hover:text-gray-600">↑</button>
                  <button className="text-xs text-gray-400 hover:text-red-500">✕</button>
                  <button className="text-xs text-gray-400 hover:text-gray-600">↓</button>
                </div>
              </div>
            ))}
          </div>

          {/* Add block */}
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">Добавить блок:</span>
            {Object.entries(blockTypeLabel).map(([type, label]) => (
              <button key={type} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:border-[#6A55F8] hover:text-[#6A55F8] transition-colors">
                {blockTypeIcon[type]} {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">← Назад</button>
          <div className="w-9 h-9 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-lg">🎓</div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{course.name}</h1>
            <p className="text-xs text-gray-500">{course.students} студентов · {course.modules} модулей · {course.lessons} уроков</p>
          </div>
        </div>
        {(activeTab === 'content' || activeTab === 'edit') && (
          <button
            onClick={() => setShowAI(!showAI)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              showAI ? 'bg-[#6A55F8] text-white' : 'border border-[#6A55F8] text-[#6A55F8] hover:bg-[#F0EDFF]'
            }`}
          >
            <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">AI</div>
            {showAI ? 'Скрыть AI' : 'AI-помощник'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-100">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${
              activeTab === tab.id ? 'border-[#6A55F8] text-[#6A55F8]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >{tab.label}</button>
        ))}
      </div>

      {/* Content + Edit with AI */}
      {(activeTab === 'content' || activeTab === 'edit') && (
        <div className="flex gap-4">
          <div className={`${showAI ? 'flex-1' : 'w-full'} transition-all`}>

            {/* TAB: Обучение */}
            {activeTab === 'content' && (
              <div className="space-y-3">
                <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-gray-600">Средний прогресс</span>
                      <span className="text-sm font-bold text-[#6A55F8]">{course.completion}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="bg-[#6A55F8] h-2 rounded-full" style={{ width: `${course.completion}%` }} />
                    </div>
                  </div>
                </div>
                {course.modulesList.map((mod, modIdx) => {
                  const lessons = moduleLessons[modIdx] ?? []
                  const isExpanded = expandedModules.has(modIdx)
                  const doneLessons = lessons.filter(l => l.done).length
                  return (
                    <div key={modIdx} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => toggleModule(modIdx)}>
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${isExpanded ? 'bg-[#6A55F8] text-white' : 'bg-[#F0EDFF] text-[#6A55F8]'}`}>{modIdx + 1}</div>
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">{mod.name}</p>
                            <p className="text-xs text-gray-500">{mod.lessons} уроков</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400">{doneLessons}/{lessons.length}</span>
                          <span className="text-gray-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="border-t border-gray-100">
                          {lessons.map((lesson, lIdx) => (
                            <div key={lesson.id} className="flex items-center gap-3 px-5 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                              <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0" style={{ borderColor: lesson.done ? '#6A55F8' : '#D1D5DB', backgroundColor: lesson.done ? '#6A55F8' : 'transparent' }}>
                                {lesson.done && <span className="text-white text-[9px] font-bold">✓</span>}
                              </div>
                              <span className="text-gray-400 text-xs w-6">{modIdx + 1}.{lIdx + 1}</span>
                              <span className="flex-1 text-sm text-gray-800">{lesson.title}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* TAB: Редактор */}
            {activeTab === 'edit' && (
              <div className="space-y-3">
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Структура курса</h3>
                  {course.modulesList.map((mod, modIdx) => {
                    const lessons = moduleLessons[modIdx] ?? []
                    return (
                      <div key={modIdx} className="mb-5 last:mb-0">
                        {/* Module */}
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-7 h-7 rounded-lg bg-[#6A55F8] flex items-center justify-center text-xs font-bold text-white">{modIdx + 1}</div>
                          <input type="text" defaultValue={mod.name} className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold focus:outline-none focus:border-[#6A55F8]" />
                          <button className="text-xs text-gray-400 hover:text-red-500">✕</button>
                        </div>

                        {/* Submodule placeholder */}
                        <div className="ml-10 mb-2">
                          <div className="flex items-center gap-2 px-3 py-2 bg-[#F8F7FF] rounded-lg border border-[#6A55F8]/10 mb-2">
                            <div className="w-5 h-5 rounded bg-[#F0EDFF] flex items-center justify-center text-[10px] font-bold text-[#6A55F8]">1.1</div>
                            <input type="text" defaultValue="Подмодуль: Теория" className="flex-1 bg-transparent text-sm text-gray-700 focus:outline-none" />
                            <button className="text-xs text-gray-400 hover:text-red-500">✕</button>
                          </div>
                        </div>

                        {/* Lessons */}
                        <div className="ml-10 space-y-1.5">
                          {lessons.map((lesson, lIdx) => (
                            <div
                              key={lesson.id}
                              onClick={() => setEditingLessonId(lesson.id)}
                              className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 rounded-lg group hover:bg-[#F0EDFF] hover:border-[#6A55F8]/20 cursor-pointer transition-colors border border-transparent"
                            >
                              <span className="text-xs text-gray-400 w-6">{modIdx + 1}.{lIdx + 1}</span>
                              <span className="flex-1 text-sm text-gray-800">{lesson.title}</span>
                              <span className="text-xs text-[#6A55F8] opacity-0 group-hover:opacity-100 transition-opacity">Открыть →</span>
                            </div>
                          ))}
                          <button className="text-xs text-[#6A55F8] font-medium hover:underline ml-3 py-1">+ Добавить урок</button>
                        </div>

                        {/* Add submodule */}
                        <div className="ml-10 mt-2">
                          <button className="text-xs text-gray-400 font-medium hover:text-[#6A55F8] transition-colors">+ Добавить подмодуль</button>
                        </div>
                      </div>
                    )
                  })}
                  <button className="mt-4 w-full py-2.5 rounded-lg border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-[#6A55F8] hover:text-[#6A55F8] transition-colors">
                    + Добавить модуль
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* AI Chat panel */}
          {showAI && (
            <div className="flex flex-col w-[380px] flex-shrink-0 bg-white rounded-xl border border-gray-100 overflow-hidden h-[600px]">
              <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-[#6A55F8] to-[#8B7BFA] flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold">AI</div>
                <span className="text-sm font-semibold text-white">AI-помощник</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {aiMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      msg.from === 'user' ? 'bg-[#6A55F8] text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'
                    }`}>{msg.text}</div>
                  </div>
                ))}
              </div>
              <div className="px-3 py-3 border-t border-gray-100 flex gap-2">
                <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  placeholder="Описать программу курса..." className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8]" />
                <button onClick={sendMessage} className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2.5 rounded-lg text-sm transition-colors">→</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: Аналитика */}
      {activeTab === 'analytics' && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Студентов', value: course.students.toString() },
              { label: 'Средний прогресс', value: `${course.completion}%` },
              { label: 'Завершили курс', value: '12' },
              { label: 'Сдали ДЗ', value: '34' },
            ].map(m => (
              <div key={m.label} className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-xs text-gray-500 mb-1">{m.label}</p>
                <p className="text-xl font-bold text-gray-900">{m.value}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Прохождение по модулям</h3>
            <div className="space-y-3">
              {course.modulesList.map((mod, idx) => {
                const pct = Math.round((mod.completed / course.students) * 100)
                return (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8]">{idx + 1}</div>
                    <div className="w-44 flex-shrink-0 text-sm text-gray-700 truncate">{mod.name}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                      <div className="h-5 rounded-full bg-[#8B7BFA] flex items-center px-2" style={{ width: `${pct}%` }}>
                        {pct >= 15 && <span className="text-white text-[10px] font-medium">{mod.completed}</span>}
                      </div>
                    </div>
                    <div className="w-16 text-right text-xs font-semibold text-gray-700">{mod.completed}/{course.students}</div>
                    <div className="w-10 text-right text-xs font-medium text-[#6A55F8]">{pct}%</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB: Пользователи */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Filter */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">Фильтр:</span>
            <select
              value={userFilter}
              onChange={e => setUserFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 focus:outline-none focus:border-[#6A55F8] min-w-[250px]"
            >
              {filterOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {userFilter !== 'all' && (
              <button onClick={() => setUserFilter('all')} className="text-xs text-gray-400 hover:text-gray-600">Сбросить</button>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-sm font-semibold text-gray-700">
                {userFilter === 'all' ? `Все ученики · ${fakeStudents.length} человек` : `Фильтр: ${filterOptions.find(o => o.value === userFilter)?.label}`}
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Имя', 'Email', 'Telegram', 'Модуль', 'Урок', 'Прогресс'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fakeStudents.map(user => (
                  <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8]">
                          {user.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span className="font-medium text-gray-900">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{user.email}</td>
                    <td className="px-4 py-3 text-gray-500">{user.telegram}</td>
                    <td className="px-4 py-3"><span className="text-xs bg-[#F0EDFF] text-[#6A55F8] rounded-full px-2 py-0.5 font-medium">{user.currentModule}</span></td>
                    <td className="px-4 py-3"><span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 font-medium">{user.currentLesson}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-100 rounded-full h-1.5">
                          <div className="bg-[#6A55F8] h-1.5 rounded-full" style={{ width: `${user.progress}%` }} />
                        </div>
                        <span className="text-xs font-medium text-gray-700">{user.progress}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default function LearningScreen() {
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)
  const selectedCourse = courses.find(c => c.id === selectedCourseId)

  if (selectedCourse) {
    return <CourseDetail course={selectedCourse} onBack={() => setSelectedCourseId(null)} />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Обучение</h1>
          <p className="text-sm text-gray-500 mt-0.5">Курсы и учебные материалы вашей школы</p>
        </div>
        <button className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">+ Создать курс</button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {courses.map(course => (
          <button key={course.id} onClick={() => setSelectedCourseId(course.id)}
            className="bg-white rounded-xl border border-gray-100 p-5 hover:border-[#6A55F8]/30 hover:shadow-sm transition-all text-left">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-2xl flex-shrink-0">🎓</div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 leading-tight">{course.name}</h3>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                  <span>{course.students} студентов</span><span>·</span><span>{course.modules} модулей</span><span>·</span><span>{course.lessons} уроков</span>
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>Прогресс</span><span className="font-semibold text-[#6A55F8]">{course.completion}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className="bg-[#6A55F8] h-1.5 rounded-full" style={{ width: `${course.completion}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
