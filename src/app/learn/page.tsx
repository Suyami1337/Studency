'use client'

// Витрина ученика (MVP-заглушка).
// Полная функциональность курсов появится в фазе 6.6.
// Сейчас просто говорим «Скоро здесь будут ваши курсы».

export default function LearnHome() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#6A55F8]/10 to-[#8B7BFA]/10 flex items-center justify-center text-3xl mx-auto mb-6">
        📚
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-3">Добро пожаловать в школу</h1>
      <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
        Здесь скоро появятся ваши курсы и уроки. Когда школа добавит для вас доступ — продукт автоматически отобразится в этом разделе.
      </p>
    </div>
  )
}
