'use client'

import { useState } from 'react'
import { courses } from '@/lib/mock-data'

type Course = typeof courses[number]

const fakeLessonsMap: Record<number, { moduleIdx: number; id: number; title: string; type: 'video' | 'text' | 'homework'; done: boolean }[][]> = {
  1: [
    [
      { moduleIdx: 0, id: 1, title: 'Что такое AI-маркетинг', type: 'video', done: true },
      { moduleIdx: 0, id: 2, title: 'Инструменты AI для бизнеса', type: 'video', done: true },
      { moduleIdx: 0, id: 3, title: 'Первый промпт для маркетинга', type: 'text', done: true },
      { moduleIdx: 0, id: 4, title: 'Практика: напиши оффер с AI', type: 'homework', done: false },
    ],
    [
      { moduleIdx: 1, id: 5, title: 'ChatGPT для копирайтинга', type: 'video', done: true },
      { moduleIdx: 1, id: 6, title: 'Создание контент-плана', type: 'video', done: true },
      { moduleIdx: 1, id: 7, title: 'Автоматизация e-mail рассылок', type: 'text', done: false },
      { moduleIdx: 1, id: 8, title: 'Домашнее задание: контент-план', type: 'homework', done: false },
    ],
    [
      { moduleIdx: 2, id: 9, title: 'Архитектура автоворонки', type: 'video', done: false },
      { moduleIdx: 2, id: 10, title: 'Чат-боты в Telegram', type: 'video', done: false },
      { moduleIdx: 2, id: 11, title: 'Интеграции и Webhook', type: 'text', done: false },
      { moduleIdx: 2, id: 12, title: 'Практика: настрой воронку', type: 'homework', done: false },
    ],
    [
      { moduleIdx: 3, id: 13, title: 'Масштабирование трафика', type: 'video', done: false },
      { moduleIdx: 3, id: 14, title: 'Команда на удалёнке с AI', type: 'video', done: false },
      { moduleIdx: 3, id: 15, title: 'Метрики роста бизнеса', type: 'text', done: false },
      { moduleIdx: 3, id: 16, title: 'Финальный проект', type: 'homework', done: false },
    ],
  ],
  2: [
    [
      { moduleIdx: 0, id: 1, title: 'Введение: что будет на курсе', type: 'video', done: true },
      { moduleIdx: 0, id: 2, title: '5 нейросетей для старта', type: 'text', done: true },
      { moduleIdx: 0, id: 3, title: 'Практика за 3 часа', type: 'homework', done: false },
    ],
  ],
}

const lessonTypeIcon: Record<string, string> = {
  video: '🎬',
  text: '📄',
  homework: '📝',
}

const lessonTypeLabel: Record<string, string> = {
  video: 'Видео',
  text: 'Статья',
  homework: 'ДЗ',
}

function CourseDetail({ course, onBack }: { course: Course; onBack: () => void }) {
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set([0]))
  const moduleLessons = fakeLessonsMap[course.id] ?? []

  function toggleModule(idx: number) {
    setExpandedModules(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            ← Назад
          </button>
          <div className="w-9 h-9 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-lg">🎓</div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{course.name}</h1>
            <p className="text-xs text-gray-500">{course.students} студентов · {course.modules} модулей · {course.lessons} уроков</p>
          </div>
        </div>
        <button className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Добавить модуль
        </button>
      </div>

      {/* Progress */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm text-gray-600">Средний прогресс студентов</span>
            <span className="text-sm font-bold text-[#6A55F8]">{course.completion}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="bg-[#6A55F8] h-2 rounded-full transition-all" style={{ width: `${course.completion}%` }} />
          </div>
        </div>
      </div>

      {/* Module tree */}
      <div className="space-y-3">
        {course.modulesList.map((mod, modIdx) => {
          const lessons = moduleLessons[modIdx] ?? []
          const isExpanded = expandedModules.has(modIdx)
          const doneLessons = lessons.filter(l => l.done).length

          return (
            <div key={modIdx} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {/* Module header */}
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleModule(modIdx)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-colors ${isExpanded ? 'bg-[#6A55F8] text-white' : 'bg-[#F0EDFF] text-[#6A55F8]'}`}>
                    {modIdx + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{mod.name}</p>
                    <p className="text-xs text-gray-500">{mod.lessons} уроков · прошли {mod.completed} студентов</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{doneLessons}/{lessons.length}</span>
                  <div className="w-20 bg-gray-100 rounded-full h-1.5">
                    <div className="bg-[#6A55F8] h-1.5 rounded-full" style={{ width: lessons.length ? `${(doneLessons / lessons.length) * 100}%` : '0%' }} />
                  </div>
                  <span className="text-gray-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Lessons */}
              {isExpanded && (
                <div className="border-t border-gray-100">
                  {lessons.map((lesson, lessonIdx) => (
                    <div
                      key={lesson.id}
                      className="flex items-center gap-3 px-5 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0" style={{ borderColor: lesson.done ? '#6A55F8' : '#D1D5DB', backgroundColor: lesson.done ? '#6A55F8' : 'transparent' }}>
                        {lesson.done && <span className="text-white text-[9px] font-bold">✓</span>}
                      </div>
                      <span className="text-gray-400 text-xs w-4">{modIdx + 1}.{lessonIdx + 1}</span>
                      <span className="text-sm">{lessonTypeIcon[lesson.type]}</span>
                      <span className="flex-1 text-sm text-gray-800">{lesson.title}</span>
                      <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                        lesson.type === 'homework' ? 'bg-amber-100 text-amber-700' :
                        lesson.type === 'video' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {lessonTypeLabel[lesson.type]}
                      </span>
                      <button className="text-xs text-[#6A55F8] font-medium hover:underline">Изменить</button>
                    </div>
                  ))}
                  <div className="px-5 py-3 flex gap-3">
                    <button className="text-xs text-[#6A55F8] font-medium flex items-center gap-1 hover:underline">
                      + Добавить урок
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function LearningScreen() {
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const selectedCourse = courses.find(c => c.id === selectedId)

  if (selectedCourse) {
    return <CourseDetail course={selectedCourse} onBack={() => setSelectedId(null)} />
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Обучение</h1>
          <p className="text-sm text-gray-500 mt-0.5">Курсы и учебные материалы вашей школы</p>
        </div>
        <button className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Создать курс
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {courses.map(course => (
          <div key={course.id} className="bg-white rounded-xl border border-gray-100 p-5 hover:border-[#6A55F8]/30 transition-all">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-2xl flex-shrink-0">🎓</div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 leading-tight">{course.name}</h3>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                  <span>{course.students} студентов</span>
                  <span>·</span>
                  <span>{course.modules} модулей</span>
                  <span>·</span>
                  <span>{course.lessons} уроков</span>
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>Средний прогресс</span>
                    <span className="font-semibold text-[#6A55F8]">{course.completion}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className="bg-[#6A55F8] h-1.5 rounded-full" style={{ width: `${course.completion}%` }} />
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setSelectedId(course.id)}
                className="px-3 py-1.5 rounded-lg bg-[#6A55F8] text-white text-sm hover:bg-[#5040D6] transition-colors"
              >
                Редактировать
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
