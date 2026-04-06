// Фейковые данные для прототипа — онлайн-школа AI-маркетинга

export const currentUser = {
  name: 'Хасан',
  email: 'hasan@studency.ru',
  avatar: null,
  role: 'owner' as const,
}

export const projects = [
  { id: 1, name: 'AI-Маркетинг Школа', clients: 1247, revenue: 2_840_000, domain: 'ai-marketing.pro' },
  { id: 2, name: 'Марат — Фитнес', clients: 340, revenue: 680_000, domain: 'marat-fit.ru' },
  { id: 3, name: 'Егор — Крипто', clients: 89, revenue: 156_000, domain: null },
]

export const dashboardStats = {
  revenueMonth: 847_500,
  revenueToday: 29_900,
  newUsersToday: 34,
  newUsersMonth: 487,
  ordersMonth: 62,
  ordersToday: 3,
  conversionRate: 4.2,
  activeSubscribers: 1247,
}

export const revenueByDay = [
  { day: '1', value: 29900 }, { day: '2', value: 59800 }, { day: '3', value: 0 },
  { day: '4', value: 89700 }, { day: '5', value: 29900 }, { day: '6', value: 149500 },
  { day: '7', value: 0 }, { day: '8', value: 29900 }, { day: '9', value: 59800 },
  { day: '10', value: 89700 }, { day: '11', value: 0 }, { day: '12', value: 29900 },
  { day: '13', value: 119600 }, { day: '14', value: 29900 }, { day: '15', value: 0 },
]

export const leadsByDay = [
  { day: '1', value: 45 }, { day: '2', value: 32 }, { day: '3', value: 28 },
  { day: '4', value: 51 }, { day: '5', value: 38 }, { day: '6', value: 67 },
  { day: '7', value: 22 }, { day: '8', value: 41 }, { day: '9', value: 35 },
  { day: '10', value: 48 }, { day: '11', value: 29 }, { day: '12', value: 56 },
  { day: '13', value: 63 }, { day: '14', value: 34 }, { day: '15', value: 42 },
]

export const products = [
  { id: 1, name: 'Мини-курс "AI за 3 дня"', price: 2990, sold: 89, revenue: 266_110 },
  { id: 2, name: 'Наставничество "AI-маркетолог"', price: 29900, sold: 18, revenue: 538_200 },
  { id: 3, name: 'VIP с разборами', price: 89900, sold: 3, revenue: 269_700 },
]

export const funnels = [
  {
    id: 1, name: 'Автовебинар AI-маркетинг', status: 'active' as const,
    stages: 6, clients: 487, conversion: 4.2,
    stagesList: [
      { name: 'Telegram-бот', type: 'bot', clients: 487, conversion: 100 },
      { name: 'VSL Видео', type: 'landing', clients: 312, conversion: 64 },
      { name: 'Оффер', type: 'landing', clients: 189, conversion: 61 },
      { name: 'Заказ создан', type: 'order', clients: 84, conversion: 44 },
      { name: 'Оплата', type: 'payment', clients: 62, conversion: 74 },
      { name: 'Обучение', type: 'learning', clients: 58, conversion: 94 },
    ]
  },
  {
    id: 2, name: 'Лид-магнит: чек-лист', status: 'draft' as const,
    stages: 3, clients: 0, conversion: 0,
    stagesList: [
      { name: 'Telegram-бот', type: 'bot', clients: 0, conversion: 0 },
      { name: 'Чек-лист PDF', type: 'landing', clients: 0, conversion: 0 },
      { name: 'Оффер мини-курс', type: 'landing', clients: 0, conversion: 0 },
    ]
  },
]

export const crmStages = [
  { id: 'new', name: 'Новый', color: '#94A3B8' },
  { id: 'video', name: 'Смотрит видео', color: '#6A55F8' },
  { id: 'offer', name: 'На оффере', color: '#F59E0B' },
  { id: 'order', name: 'Создал заказ', color: '#EF4444' },
  { id: 'paid', name: 'Оплатил', color: '#10B981' },
  { id: 'learning', name: 'Учится', color: '#06B6D4' },
]

export const clients = [
  { id: 1, name: 'Анна Петрова', email: 'anna@mail.ru', phone: '+7 912 345-67-89', telegram: '@anna_petrova', stage: 'paid', tags: ['VIP'], lastAction: 'Оплатила "AI-маркетолог"', lastActionTime: '2 часа назад', orders: 2, revenue: 32890 },
  { id: 2, name: 'Дмитрий Козлов', email: 'dima@gmail.com', phone: '+7 903 456-78-90', telegram: '@dimakoz', stage: 'order', tags: ['Горячий'], lastAction: 'Создал заказ на VIP', lastActionTime: '4 часа назад', orders: 1, revenue: 0 },
  { id: 3, name: 'Мария Сидорова', email: 'masha@yandex.ru', phone: '+7 926 567-89-01', telegram: '@masha_sid', stage: 'learning', tags: [], lastAction: 'Прошла урок 4', lastActionTime: '1 час назад', orders: 1, revenue: 29900 },
  { id: 4, name: 'Алексей Новиков', email: 'alex@inbox.ru', phone: '+7 915 678-90-12', telegram: '@alexnov', stage: 'video', tags: [], lastAction: 'Смотрит VSL видео', lastActionTime: '30 минут назад', orders: 0, revenue: 0 },
  { id: 5, name: 'Елена Волкова', email: 'lena@mail.ru', phone: '+7 906 789-01-23', telegram: '@lena_v', stage: 'new', tags: [], lastAction: 'Запустила бота', lastActionTime: '15 минут назад', orders: 0, revenue: 0 },
  { id: 6, name: 'Сергей Морозов', email: 'sergey@gmail.com', phone: '+7 999 890-12-34', telegram: '@sergmoroz', stage: 'paid', tags: [], lastAction: 'Оплатил мини-курс', lastActionTime: '6 часов назад', orders: 1, revenue: 2990 },
  { id: 7, name: 'Ольга Кузнецова', email: 'olga@yandex.ru', phone: '+7 916 901-23-45', telegram: '@olga_kuz', stage: 'offer', tags: ['Горячий'], lastAction: 'Читает оффер', lastActionTime: '45 минут назад', orders: 0, revenue: 0 },
  { id: 8, name: 'Иван Федоров', email: 'ivan@mail.ru', phone: '+7 925 012-34-56', telegram: '@ivanfed', stage: 'learning', tags: [], lastAction: 'Сдал ДЗ к уроку 2', lastActionTime: '3 часа назад', orders: 1, revenue: 29900 },
  { id: 9, name: 'Наталья Белова', email: 'nata@inbox.ru', phone: '+7 903 123-45-67', telegram: '@nata_bel', stage: 'new', tags: [], lastAction: 'Запустила бота', lastActionTime: '1 час назад', orders: 0, revenue: 0 },
  { id: 10, name: 'Павел Григорьев', email: 'pavel@gmail.com', phone: '+7 912 234-56-78', telegram: '@pavelgrig', stage: 'video', tags: [], lastAction: 'Перешёл на VSL', lastActionTime: '20 минут назад', orders: 0, revenue: 0 },
]

export const chatbots = [
  { id: 1, name: 'Автовебинар AI-маркетинг', subscribers: 487, active: true, messages: 3240, lastActivity: '5 минут назад' },
  { id: 2, name: 'Проверка подписки', subscribers: 1200, active: true, messages: 890, lastActivity: '12 минут назад' },
  { id: 3, name: 'Дожим после вебинара', subscribers: 312, active: false, messages: 1560, lastActivity: '2 дня назад' },
]

export const botSteps = [
  { id: 1, type: 'message', text: 'Привет! Я бот школы AI-маркетинга. Готов показать, как нейросети делают маркетинг за тебя.', delay: '0', condition: 'Старт' },
  { id: 2, type: 'message', text: 'Посмотри это видео — 3 кейса, где AI заменил целый отдел маркетинга:', delay: '0', condition: 'После шага 1' },
  { id: 3, type: 'button', text: '🎬 Смотреть видео', delay: '0', condition: 'Кнопка' },
  { id: 4, type: 'delay', text: 'Ожидание 2 часа', delay: '2ч', condition: 'Не перешёл по ссылке' },
  { id: 5, type: 'message', text: 'Ты ещё не посмотрел видео. Там всего 12 минут, но после него ты поймёшь, почему 80% маркетологов уже используют AI.', delay: '2ч', condition: 'Дожим #1' },
  { id: 6, type: 'delay', text: 'Ожидание 24 часа', delay: '24ч', condition: 'Не перешёл по ссылке' },
  { id: 7, type: 'message', text: 'Последнее напоминание: видео доступно ещё 24 часа. Потом доступ закроется.', delay: '24ч', condition: 'Дожим #2' },
  { id: 8, type: 'message', text: '🔥 Отлично! Теперь посмотри предложение — мы подготовили 3 формата обучения:', delay: '0', condition: 'Досмотрел видео' },
  { id: 9, type: 'button', text: '📋 Посмотреть программу', delay: '0', condition: 'Кнопка → оффер' },
  { id: 10, type: 'delay', text: 'Ожидание 1 час', delay: '1ч', condition: 'Создал заказ, не оплатил' },
  { id: 11, type: 'message', text: 'Ты создал заказ, но ещё не оплатил. Напоминаю: ранняя цена действует ещё 3 часа!', delay: '1ч', condition: 'Дожим оплаты #1' },
]

export const landings = [
  { id: 1, name: 'VSL — Как AI делает маркетинг', url: 'ai-marketing.pro/vsl', visits: 312, conversions: 189, status: 'published' as const },
  { id: 2, name: 'Оффер — 3 тарифа обучения', url: 'ai-marketing.pro/offer', visits: 189, conversions: 84, status: 'published' as const },
  { id: 3, name: 'Чек-лист: 10 AI-инструментов', url: 'ai-marketing.pro/checklist', visits: 0, conversions: 0, status: 'draft' as const },
]

export const courses = [
  {
    id: 1, name: 'AI-маркетолог: полный курс', students: 58, modules: 4, lessons: 16, completion: 67,
    modulesList: [
      { name: 'Модуль 1: Основы AI', lessons: 4, completed: 52 },
      { name: 'Модуль 2: ChatGPT для маркетинга', lessons: 4, completed: 41 },
      { name: 'Модуль 3: Автоворонки с AI', lessons: 4, completed: 28 },
      { name: 'Модуль 4: Масштабирование', lessons: 4, completed: 12 },
    ]
  },
  {
    id: 2, name: 'Мини-курс: AI за 3 дня', students: 89, modules: 1, lessons: 3, completion: 84,
    modulesList: [
      { name: 'Быстрый старт', lessons: 3, completed: 75 },
    ]
  },
]

export const orders = [
  { id: 1001, client: 'Анна Петрова', product: 'AI-маркетолог', tariff: 'Стандарт', amount: 29900, status: 'paid' as const, date: '06.04.2026 14:23', email: 'anna@mail.ru' },
  { id: 1002, client: 'Дмитрий Козлов', product: 'VIP с разборами', tariff: 'VIP', amount: 89900, status: 'new' as const, date: '06.04.2026 12:45', email: 'dima@gmail.com' },
  { id: 1003, client: 'Мария Сидорова', product: 'AI-маркетолог', tariff: 'Стандарт', amount: 29900, status: 'paid' as const, date: '05.04.2026 19:10', email: 'masha@yandex.ru' },
  { id: 1004, client: 'Сергей Морозов', product: 'Мини-курс AI за 3 дня', tariff: 'Базовый', amount: 2990, status: 'paid' as const, date: '05.04.2026 16:32', email: 'sergey@gmail.com' },
  { id: 1005, client: 'Анна Петрова', product: 'Мини-курс AI за 3 дня', tariff: 'Базовый', amount: 2990, status: 'paid' as const, date: '01.04.2026 11:05', email: 'anna@mail.ru' },
  { id: 1006, client: 'Ольга Кузнецова', product: 'AI-маркетолог', tariff: 'Стандарт', amount: 29900, status: 'new' as const, date: '06.04.2026 10:15', email: 'olga@yandex.ru' },
  { id: 1007, client: 'Иван Федоров', product: 'AI-маркетолог', tariff: 'Стандарт', amount: 29900, status: 'paid' as const, date: '04.04.2026 22:40', email: 'ivan@mail.ru' },
  { id: 1008, client: 'Наталья Белова', product: 'Мини-курс AI за 3 дня', tariff: 'Базовый', amount: 2990, status: 'refund' as const, date: '03.04.2026 08:20', email: 'nata@inbox.ru' },
]

export const notifications = [
  { id: 1, text: 'Анна Петрова оплатила "AI-маркетолог" — 29 900₽', time: '2 часа назад', read: false },
  { id: 2, text: 'Дмитрий Козлов создал заказ на VIP — 89 900₽', time: '4 часа назад', read: false },
  { id: 3, text: 'Новый подписчик бота: @lena_v', time: '15 минут назад', read: false },
  { id: 4, text: 'Сергей Морозов оплатил мини-курс — 2 990₽', time: '6 часов назад', read: true },
  { id: 5, text: 'Мария Сидорова прошла урок 4', time: '1 час назад', read: true },
]

export const orderStatuses: Record<string, { label: string; color: string }> = {
  new: { label: 'Новый', color: '#6A55F8' },
  in_progress: { label: 'В работе', color: '#F59E0B' },
  paid: { label: 'Оплачен', color: '#10B981' },
  partial: { label: 'Частично', color: '#06B6D4' },
  refund: { label: 'Возврат', color: '#EF4444' },
  cancelled: { label: 'Отменён', color: '#94A3B8' },
}
