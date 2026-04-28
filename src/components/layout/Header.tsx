'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import NotificationBell from '@/components/learning/NotificationBell'

export default function Header() {
  const [showUser, setShowUser] = useState(false)
  const [userName, setUserName] = useState('Юзер')
  const [userEmail, setUserEmail] = useState('')
  const supabase = createClient()
  const userMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const fn = (user.user_metadata?.full_name as string) || ''
      const email = user.email || ''
      setUserName(fn || (email ? email.split('@')[0] : 'Юзер'))
      setUserEmail(email)
    })
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [])

  // Закрытие dropdown'ов при клике вне
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (showUser && userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUser(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [showUser])

  return (
    <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-6 shrink-0">
      <div />

      <div className="flex items-center gap-3">
        {/* Notifications */}
        <NotificationBell />

        {/* User dropdown */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUser(v => !v)}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#6A55F8] to-[#8B7BFA] flex items-center justify-center text-white text-xs font-bold">
              {(userName[0] || 'U').toUpperCase()}
            </div>
            <span className="text-sm font-medium text-gray-700">{userName}</span>
            <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showUser ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showUser && (
            <div className="absolute right-0 top-12 w-64 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900 truncate">{userName}</p>
                {userEmail && <p className="text-xs text-gray-500 truncate mt-0.5">{userEmail}</p>}
              </div>

              <a
                href="/account/settings"
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <span className="text-base">⚙️</span>
                <span>Настройки</span>
              </a>

              <a
                href="/projects"
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <span className="text-base">📂</span>
                <span>Мои проекты</span>
              </a>

              <div className="border-t border-gray-100">
                <a
                  href="/api/auth/global-logout"
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <span className="text-base">🚪</span>
                  <span>Выйти</span>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
