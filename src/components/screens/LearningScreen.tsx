'use client'

import { courses } from '@/lib/mock-data'

export default function LearningScreen() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Обучение</h1>
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
              <button className="px-3 py-1.5 rounded-lg bg-[#6A55F8] text-white text-sm hover:bg-[#5040D6] transition-colors">
                Редактировать
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
