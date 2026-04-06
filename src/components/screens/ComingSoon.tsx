'use client'

export default function ComingSoon({ title, icon }: { title: string; icon: string }) {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="text-center">
        <div className="text-5xl mb-4">{icon}</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">{title}</h2>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          В разработке
        </div>
        <p className="text-sm text-gray-400 mt-4 max-w-sm mx-auto">
          Этот раздел сейчас разрабатывается. Мы сообщим, когда он будет готов к тестированию.
        </p>
      </div>
    </div>
  )
}
