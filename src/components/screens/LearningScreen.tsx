'use client'

import { courses } from '@/lib/mock-data'

export default function LearningScreen() {
  const featuredCourse = courses[0]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Обучение</h1>
          <p className="text-sm text-gray-500 mt-0.5">Курсы и учебные материалы вашей школы</p>
        </div>
        <button className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Создать курс
        </button>
      </div>

      {/* Course cards */}
      <div className="grid grid-cols-2 gap-4">
        {courses.map(course => (
          <div key={course.id} className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-sm transition-shadow cursor-pointer">
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
                {/* Progress bar */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>Средний прогресс</span>
                    <span className="font-semibold text-[#6A55F8]">{course.completion}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className="bg-[#6A55F8] h-1.5 rounded-full transition-all"
                      style={{ width: `${course.completion}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Featured course: module breakdown */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-1">{featuredCourse.name}</h2>
        <p className="text-xs text-gray-500 mb-4">Детализация по модулям</p>
        <div className="space-y-3">
          {featuredCourse.modulesList.map((mod, idx) => (
            <div key={idx} className="flex items-center gap-4">
              <div className="w-7 h-7 rounded-lg bg-[#F0EDFF] flex items-center justify-center text-xs font-bold text-[#6A55F8] flex-shrink-0">
                {idx + 1}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-800">{mod.name}</span>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>{mod.lessons} урока</span>
                    <span className="font-semibold text-gray-700">{mod.completed} из {featuredCourse.students}</span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-[#6A55F8] h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.round((mod.completed / featuredCourse.students) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="text-xs font-semibold text-[#6A55F8] w-10 text-right">
                {Math.round((mod.completed / featuredCourse.students) * 100)}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
