'use client'

// Phase 7.10 — Публичная страница сертификата.
// Любой может открыть по certificate_number из URL — это удостоверяет
// подлинность для работодателей и т.д.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Certificate = {
  id: string
  certificate_number: string
  student_name_snapshot: string
  course_name_snapshot: string
  exam_score: number | null
  issued_at: string
  reissued_at: string | null
}

export default function CertificatePage() {
  const params = useParams<{ certNumber: string }>()
  const supabase = createClient()
  const [cert, setCert] = useState<Certificate | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('course_certificates')
        .select('id, certificate_number, student_name_snapshot, course_name_snapshot, exam_score, issued_at, reissued_at')
        .eq('certificate_number', params.certNumber)
        .maybeSingle()
      if (cancelled) return
      setCert(data as Certificate | null)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [params.certNumber, supabase])

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Загружаем…</div>
  }

  if (!cert) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-8 max-w-md text-center">
          <div className="text-3xl mb-3">🤔</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Сертификат не найден</h1>
          <p className="text-sm text-gray-500">Номер «{params.certNumber}» не зарегистрирован в системе.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F8F7FF] via-white to-[#F0EDFF] flex flex-col items-center justify-center p-6">
      {/* Сертификат */}
      <div className="bg-white rounded-3xl shadow-2xl shadow-[#6A55F8]/10 max-w-3xl w-full overflow-hidden border border-[#6A55F8]/10 print:shadow-none print:border-0">
        {/* Header polosa */}
        <div className="bg-gradient-to-r from-[#6A55F8] to-[#8B7BFA] h-3" />

        <div className="p-12 md:p-16">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#6A55F8] to-[#8B7BFA] flex items-center justify-center text-white text-2xl font-bold">S</div>
              <div className="text-sm text-gray-500">Studency</div>
            </div>
            <div className="text-xs text-gray-400">№ {cert.certificate_number}</div>
          </div>

          <div className="text-center my-12">
            <div className="text-3xl mb-4">🎓</div>
            <p className="text-sm uppercase tracking-widest text-gray-500 mb-2">Сертификат</p>
            <p className="text-sm text-gray-500 mb-1">подтверждает, что</p>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">{cert.student_name_snapshot}</h1>
            <p className="text-sm text-gray-500 mb-2">успешно завершил(а) курс</p>
            <h2 className="text-xl md:text-2xl font-semibold text-[#6A55F8]">«{cert.course_name_snapshot}»</h2>
            {cert.exam_score != null && (
              <p className="text-sm text-gray-500 mt-3">Оценка экзамена: <span className="font-semibold text-gray-700">{cert.exam_score} баллов</span></p>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-100 pt-6">
            <div>
              <div className="text-gray-400">Дата выдачи</div>
              <div className="font-medium text-gray-700">{new Date(cert.issued_at).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
            </div>
            <div className="text-right">
              <div className="text-gray-400">Подлинность</div>
              <div className="font-medium text-gray-700">studency.ru/certificate/{cert.certificate_number}</div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-[#6A55F8] to-[#8B7BFA] h-3" />
      </div>

      {/* Кнопки */}
      <div className="mt-6 flex gap-3 print:hidden">
        <button onClick={() => window.print()} className="px-5 py-2 rounded-xl bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium">
          🖨 Распечатать / сохранить PDF
        </button>
      </div>
    </div>
  )
}
