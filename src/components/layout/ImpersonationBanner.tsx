'use client'

// Глобальный баннер для режима impersonation. Читает marker-cookie
// `studency-impersonating` (не HTTP-only, доступна клиенту).
// Кнопка «Вернуться» дёргает /api/team/exit-impersonation и редиректит на /projects.

import { useState, useSyncExternalStore } from 'react'

const MARKER_COOKIE = 'studency-impersonating'

type MarkerData = {
  target_email: string
  target_role_label: string
  started_at: number
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : null
}

// useSyncExternalStore-based чтение marker-cookie. Без подписки (cookie не имеет
// событий), но и без setState в useEffect — lint-правило в Next.js 15
// (react-hooks/set-state-in-effect) не позволяет это иначе.
function subscribeNoop() { return () => {} }
function getMarkerSnapshot(): string | null {
  return readCookie(MARKER_COOKIE)
}
function getMarkerServer(): string | null { return null }

export default function ImpersonationBanner() {
  const [exiting, setExiting] = useState(false)
  const raw = useSyncExternalStore(subscribeNoop, getMarkerSnapshot, getMarkerServer)
  let marker: MarkerData | null = null
  if (raw) {
    try { marker = JSON.parse(raw) as MarkerData } catch { /* ignore */ }
  }

  if (!marker) return null

  async function handleExit() {
    setExiting(true)
    try {
      await fetch('/api/team/exit-impersonation', { method: 'POST' })
    } catch { /* ignore */ }
    // Полный hard-redirect — нужно чтобы браузер перечитал auth-cookie.
    window.location.href = '/projects'
  }

  return (
    <div className="sticky top-0 z-[100] bg-amber-500 text-white px-4 py-2 flex items-center justify-between gap-4 text-sm shadow-md">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base">👁</span>
        <span className="truncate">
          Вы вошли как <strong>{marker.target_email}</strong> ({marker.target_role_label}). Это временный режим для тестирования.
        </span>
      </div>
      <button
        onClick={handleExit}
        disabled={exiting}
        className="shrink-0 px-3 py-1 rounded-md bg-white/20 hover:bg-white/30 text-white font-medium disabled:opacity-50"
      >
        {exiting ? 'Возвращаемся…' : 'Вернуться в свой аккаунт'}
      </button>
    </div>
  )
}
