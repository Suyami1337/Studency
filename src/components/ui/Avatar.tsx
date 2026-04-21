/**
 * Аватарка пользователя/канала с цветным градиентом и инициалами.
 * Цвет детерминирован от имени/id — один и тот же пользователь всегда
 * получает тот же цвет.
 */

// Палитра аккуратных градиентов (пастельные, не кричащие)
const PALETTE: [string, string][] = [
  ['#FF6B6B', '#EE5A6F'],
  ['#FFA07A', '#FA8072'],
  ['#FFB347', '#FFCC33'],
  ['#F4D03F', '#F1C40F'],
  ['#7ED321', '#5FB821'],
  ['#4ECDC4', '#44A08D'],
  ['#5BC0EB', '#5A8FD6'],
  ['#6A55F8', '#8B5CF6'],
  ['#9B59B6', '#8E44AD'],
  ['#E74C3C', '#C0392B'],
  ['#F39C12', '#D68910'],
  ['#16A085', '#138D75'],
]

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
const SIZE_MAP: Record<Size, { box: number; text: number }> = {
  xs: { box: 24, text: 10 },
  sm: { box: 32, text: 12 },
  md: { box: 40, text: 14 },
  lg: { box: 48, text: 18 },
  xl: { box: 64, text: 24 },
}

export function Avatar({
  name,
  seed,
  photoUrl,
  size = 'md',
  className = '',
}: {
  /** Имя — используется для инициалов и стабильного цвета */
  name?: string | null
  /** Опционально — отдельный seed для цвета (e.g. telegram_user_id) */
  seed?: string | number | null
  /** Если есть реальное фото — показываем его, fallback на инициалы */
  photoUrl?: string | null
  size?: Size
  className?: string
}) {
  const { box, text } = SIZE_MAP[size]
  const displayName = (name?.trim() || '?')
  const initials = getInitials(displayName)
  const colorSeed = String(seed ?? displayName)
  const [c1, c2] = PALETTE[hashString(colorSeed) % PALETTE.length]

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={displayName}
        width={box}
        height={box}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: box, height: box }}
      />
    )
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center shrink-0 font-semibold text-white select-none ${className}`}
      style={{
        width: box,
        height: box,
        fontSize: text,
        background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
      }}
      aria-label={displayName}
    >
      {initials}
    </div>
  )
}
