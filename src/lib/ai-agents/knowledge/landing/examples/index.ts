// Golden examples для лендинг-агента.
// Добавляй реальные конверсионные лендинги — модель будет копировать стиль.
//
// Формат: см. Example type. Пиши в funnel готовый HTML (с Tailwind классами)
// в том виде как он есть на странице.

export type Example = {
  niche: string
  goal: string
  /** HTML лендинга. Используй Tailwind utility classes. */
  html: string
  /** Короткий комментарий почему этот лендинг работает (по блокам) */
  why_it_works?: string
}

export const EXAMPLES: Example[] = [
  // TODO: наполнить реальными образцовыми лендингами.
  // Пример: { niche: 'Онлайн-курс по Python', goal: '...', html: '...', why_it_works: '...' }
]
