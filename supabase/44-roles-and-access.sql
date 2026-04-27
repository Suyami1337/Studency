-- =====================================================================
-- Migration 44: Фундамент ролей, доступов и членства в проектах
-- =====================================================================
-- Внедряем многопользовательскую модель: одна школа -> много участников
-- с разными ролями. Роли настраиваются (галочки прав). 9 предустановленных
-- системных ролей + возможность создавать кастомные.
--
-- Decision doc: knowledge/decisions/roles-and-access-architecture-2026-04-27
--
-- Эта миграция ТОЛЬКО создаёт инфраструктуру. RLS на остальные таблицы
-- НЕ переписывает (это фаза 6.2).
-- =====================================================================


-- =====================================================================
-- BLOCK A: SCHEMA
-- =====================================================================

-- A0. Cleanup: старая project_members (legacy схема: role TEXT enum + is_blocked).
--     В ней только owner-записи существующих проектов, которые backfill пересоздаст.
DROP TABLE IF EXISTS project_members CASCADE;
DROP TYPE IF EXISTS project_member_role CASCADE;

-- A1. Каталог permissions (глобальный, не редактируется через UI)
CREATE TABLE IF NOT EXISTS permissions (
  code TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  is_dangerous BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- A2. Роли. project_id IS NULL = глобальный системный шаблон.
--     Конкретный проект имеет свои копии всех 9 системных ролей + кастомные.
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  access_type TEXT NOT NULL DEFAULT 'admin_panel'
    CHECK (access_type IN ('admin_panel', 'student_panel', 'no_access')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, code)
);

CREATE INDEX IF NOT EXISTS idx_roles_project_id ON roles(project_id);

-- A3. Связка role <-> permission
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_code)
);

-- A4. Члены проекта (роль внутри проекта)
CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'invited', 'disabled')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_role ON project_members(role_id);

-- A5. Приглашения. Одноразовые токены с TTL 7 дней.
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(lower(email));
CREATE INDEX IF NOT EXISTS idx_invitations_project ON invitations(project_id);

-- A6. Мета пользователя (полное имя, аватар, можно ли создавать проекты)
CREATE TABLE IF NOT EXISTS users_meta (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  can_create_projects BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A7. Связь customer (карточка CRM) <-> auth.user (логин)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_project_email_lower ON customers(project_id, lower(email));


-- =====================================================================
-- BLOCK B: PERMISSION CATALOG (глобальный)
-- =====================================================================
-- Оцифровываем все разделы платформы. Каждое право = (resource, action).
-- При добавлении нового раздела платформы — добавляем сюда новую запись.
-- =====================================================================

INSERT INTO permissions (code, category, label, description, is_dangerous, sort_order) VALUES
-- CRM: карточки клиентов и сегменты
('crm.customers.view',       'crm', 'CRM — смотреть карточки',         'Видит список клиентов и их карточки',                           FALSE, 100),
('crm.customers.create',     'crm', 'CRM — создавать карточки',        'Может добавлять новых клиентов вручную',                        FALSE, 101),
('crm.customers.edit',       'crm', 'CRM — редактировать карточки',    'Может править поля карточки клиента',                           FALSE, 102),
('crm.customers.delete',     'crm', 'CRM — удалять карточки',          'ОПАСНО: удаление карточки безвозвратно',                        TRUE,  103),
('crm.customers.export',     'crm', 'CRM — экспорт',                   'Может выгружать список клиентов CSV',                           FALSE, 104),
('crm.segments.view',        'crm', 'CRM — смотреть сегменты',         'Видит сохранённые фильтры и сегменты',                          FALSE, 110),
('crm.segments.edit',        'crm', 'CRM — редактировать сегменты',    'Может создавать/менять/удалять сегменты',                       FALSE, 111),
('crm.notes.view',           'crm', 'CRM — смотреть заметки',          'Видит заметки в карточках',                                     FALSE, 120),
('crm.notes.create',         'crm', 'CRM — создавать заметки',         'Может добавлять заметки к клиентам',                            FALSE, 121),
('crm.notes.edit',           'crm', 'CRM — редактировать заметки',     'Может править свои и чужие заметки',                            FALSE, 122),
('crm.notes.delete',         'crm', 'CRM — удалять заметки',           'Может удалять заметки',                                         FALSE, 123),
('crm.fields.view',          'crm', 'CRM — смотреть кастомные поля',   'Видит кастомные поля',                                          FALSE, 130),
('crm.fields.edit',          'crm', 'CRM — настраивать поля',          'Может создавать/удалять кастомные поля',                        FALSE, 131),

-- Чат-боты
('chatbots.view',            'chatbots', 'Боты — смотреть',            'Видит список чат-ботов и их сценарии',                          FALSE, 200),
('chatbots.create',          'chatbots', 'Боты — создавать',           'Может создавать новых ботов и сценарии',                        FALSE, 201),
('chatbots.edit',            'chatbots', 'Боты — редактировать',       'Может править сценарии, сообщения, кнопки, дожимы',             FALSE, 202),
('chatbots.delete',          'chatbots', 'Боты — удалять',             'ОПАСНО: удаление бота со всеми сценариями',                     TRUE,  203),
('chatbots.broadcasts.view', 'chatbots', 'Рассылки — смотреть',        'Видит список рассылок и их статистику',                         FALSE, 210),
('chatbots.broadcasts.create','chatbots','Рассылки — создавать',       'Может создавать и запускать рассылки',                          FALSE, 211),
('chatbots.broadcasts.edit', 'chatbots', 'Рассылки — редактировать',   'Может править черновики и запланированные',                     FALSE, 212),
('chatbots.broadcasts.delete','chatbots','Рассылки — удалять',         'Может удалять/отменять рассылки',                               FALSE, 213),

-- Переписки (MTProto / менеджер)
('conversations.view',       'conversations', 'Диалоги — смотреть',     'Видит список диалогов и сообщения',                            FALSE, 300),
('conversations.reply',      'conversations', 'Диалоги — отвечать',     'Может отвечать клиентам',                                      FALSE, 301),

-- Воронки (этапы CRM)
('funnels.view',             'funnels', 'Воронки — смотреть',          'Видит этапы воронки',                                           FALSE, 400),
('funnels.create',           'funnels', 'Воронки — создавать',         'Может создавать воронки',                                       FALSE, 401),
('funnels.edit',             'funnels', 'Воронки — редактировать',     'Может править этапы и автоматизации',                           FALSE, 402),
('funnels.delete',           'funnels', 'Воронки — удалять',           'Может удалять воронки',                                         FALSE, 403),

-- Обучение
('learning.courses.view',    'learning', 'Курсы — смотреть',           'Видит список курсов проекта',                                   FALSE, 500),
('learning.courses.create',  'learning', 'Курсы — создавать',          'Может создавать новые курсы',                                   FALSE, 501),
('learning.courses.edit',    'learning', 'Курсы — редактировать',      'Может править содержимое курсов',                               FALSE, 502),
('learning.courses.delete',  'learning', 'Курсы — удалять',            'ОПАСНО: удаление курса с потерей доступов у учеников',          TRUE,  503),
('learning.lessons.view',    'learning', 'Уроки — смотреть',           'Видит уроки и их структуру',                                    FALSE, 510),
('learning.lessons.create',  'learning', 'Уроки — создавать',          'Может добавлять уроки',                                         FALSE, 511),
('learning.lessons.edit',    'learning', 'Уроки — редактировать',      'Может править уроки',                                           FALSE, 512),
('learning.lessons.delete',  'learning', 'Уроки — удалять',            'Может удалять уроки',                                           FALSE, 513),
('learning.homework.review', 'learning', 'ДЗ — проверять',             'Может смотреть и оценивать домашние задания учеников',          FALSE, 520),
('learning.analytics.view',  'learning', 'Обучение — аналитика',       'Видит прогресс учеников, статистику прохождения',               FALSE, 530),
('learning.access.grant',    'learning', 'Выдавать доступ к курсам',   'Может выдавать клиентам доступ к продуктам/курсам',             FALSE, 540),
('learning.access.revoke',   'learning', 'Отзывать доступ к курсам',   'Может отзывать выданный доступ к продуктам/курсам',             FALSE, 541),

-- Продукты
('products.view',            'products', 'Продукты — смотреть',        'Видит список продуктов',                                        FALSE, 600),
('products.create',          'products', 'Продукты — создавать',       'Может создавать продукты и тарифы',                             FALSE, 601),
('products.edit',            'products', 'Продукты — редактировать',   'Может править продукты, цены, сроки',                           FALSE, 602),
('products.delete',          'products', 'Продукты — удалять',         'ОПАСНО: удаление продукта с потерей связанных доступов',        TRUE,  603),

-- Заказы
('orders.view',              'orders', 'Заказы — смотреть',            'Видит список заказов',                                          FALSE, 700),
('orders.create',            'orders', 'Заказы — создавать',           'Может создавать заказ вручную (бесплатный/платный)',            FALSE, 701),
('orders.edit',              'orders', 'Заказы — редактировать',       'Может менять статус и параметры заказа',                        FALSE, 702),
('orders.delete',            'orders', 'Заказы — удалять',             'ОПАСНО: удаление заказа с историей оплат',                      TRUE,  703),
('orders.refund',            'orders', 'Заказы — возвраты',            'Может возвращать оплату клиенту',                               FALSE, 704),

-- Сайты (лендинги, источники)
('sites.landings.view',      'sites', 'Лендинги — смотреть',           'Видит список лендингов и их статистику',                        FALSE, 800),
('sites.landings.create',    'sites', 'Лендинги — создавать',          'Может создавать новые лендинги',                                FALSE, 801),
('sites.landings.edit',      'sites', 'Лендинги — редактировать',      'Может менять содержимое и публикацию лендингов',                FALSE, 802),
('sites.landings.delete',    'sites', 'Лендинги — удалять',            'ОПАСНО: удаление лендинга',                                     TRUE,  803),
('sites.sources.view',       'sites', 'Источники — смотреть',          'Видит UTM-метки и источники трафика',                           FALSE, 810),
('sites.sources.edit',       'sites', 'Источники — редактировать',     'Может создавать UTM, генерировать ссылки',                      FALSE, 811),

-- Аналитика
('analytics.general.view',   'analytics', 'Аналитика — общая',          'Видит общий дашборд',                                          FALSE, 900),
('analytics.sources.view',   'analytics', 'Аналитика — источники',      'Видит дашборд источников/UTM',                                 FALSE, 901),
('analytics.funnel.view',    'analytics', 'Аналитика — воронка',        'Видит сквозную воронку',                                       FALSE, 902),
('analytics.export',         'analytics', 'Аналитика — экспорт',        'Может выгружать аналитику',                                    FALSE, 910),

-- Соцсети
('social.channels.view',     'social', 'Соцсети — смотреть',           'Видит подключённые каналы и их статистику',                     FALSE, 1000),
('social.channels.edit',     'social', 'Соцсети — редактировать',      'Может подключать/отключать каналы',                             FALSE, 1001),

-- Медиа
('media.view',               'media', 'Медиа — смотреть',              'Видит медиа-библиотеку',                                        FALSE, 1100),
('media.upload',             'media', 'Медиа — загружать',             'Может загружать файлы',                                         FALSE, 1101),
('media.delete',             'media', 'Медиа — удалять',               'Может удалять файлы',                                           FALSE, 1102),

-- Видео (Kinescope)
('videos.view',              'videos', 'Видео — смотреть',             'Видит видео-библиотеку',                                        FALSE, 1200),
('videos.upload',            'videos', 'Видео — загружать',            'Может загружать видео',                                         FALSE, 1201),
('videos.delete',            'videos', 'Видео — удалять',              'Может удалять видео',                                           FALSE, 1202),

-- Журнал событий
('journal.view',             'journal', 'Журнал — смотреть',           'Видит журнал событий проекта',                                  FALSE, 1300),

-- Команда и роли
('team.members.view',        'team', 'Команда — смотреть',             'Видит участников проекта',                                      FALSE, 1400),
('team.members.invite',      'team', 'Команда — приглашать',           'Может приглашать новых участников',                             FALSE, 1401),
('team.members.edit',        'team', 'Команда — менять роли',          'Может менять роль участника',                                   FALSE, 1402),
('team.members.remove',      'team', 'Команда — удалять',              'Может удалять участников из проекта',                           FALSE, 1403),
('team.roles.view',          'team', 'Роли — смотреть',                'Видит конструктор ролей',                                       FALSE, 1410),
('team.roles.create',        'team', 'Роли — создавать',               'Может создавать кастомные роли',                                FALSE, 1411),
('team.roles.edit',          'team', 'Роли — редактировать',           'Может менять права в ролях',                                    FALSE, 1412),
('team.roles.delete',        'team', 'Роли — удалять',                 'Может удалять кастомные роли',                                  FALSE, 1413),
('team.impersonate',         'team', 'Войти от лица другого',          'Может зайти на платформу от лица другого пользователя',         TRUE,  1420),

-- Настройки проекта
('settings.project.view',    'settings', 'Настройки — смотреть',       'Видит настройки проекта',                                       FALSE, 1500),
('settings.project.edit',    'settings', 'Настройки — редактировать',  'Может править имя, описание проекта',                           FALSE, 1501),
('settings.integrations.view','settings','Интеграции — смотреть',      'Видит настройки интеграций',                                    FALSE, 1510),
('settings.integrations.edit','settings','Интеграции — редактировать', 'Может подключать Telegram bot, Prodamus, Resend и др.',         FALSE, 1511),
('settings.domain.view',     'settings', 'Домен — смотреть',           'Видит настройки домена',                                        FALSE, 1520),
('settings.domain.edit',     'settings', 'Домен — редактировать',      'ОПАСНО: меняет поддомен/custom domain (ломает ссылки)',         TRUE,  1521),

-- Опасная зона
('danger.delete_project',    'danger', 'Удалить проект',               'ОПАСНО: удаление проекта со всеми данными',                     TRUE,  9000),
('danger.transfer_ownership','danger', 'Передать владение',            'ОПАСНО: передача проекта другому владельцу',                    TRUE,  9001),
('danger.export_all_data',   'danger', 'Экспорт всех данных',          'ОПАСНО: выгрузка всей БД проекта',                              TRUE,  9002)
ON CONFLICT (code) DO UPDATE SET
  category = EXCLUDED.category,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  is_dangerous = EXCLUDED.is_dangerous,
  sort_order = EXCLUDED.sort_order;


-- =====================================================================
-- BLOCK C: SYSTEM ROLE TEMPLATES (глобальные, project_id IS NULL)
-- =====================================================================
-- Эти 9 ролей — шаблоны. При создании нового проекта они копируются
-- (вместе с правами) в роли с конкретным project_id.
-- =====================================================================

-- 1. Владелец
INSERT INTO roles (id, project_id, code, label, description, is_system, access_type, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, NULL, 'owner', 'Владелец', 'Создатель проекта. Полный доступ ко всему, включая опасные действия.', TRUE, 'admin_panel', 1)
ON CONFLICT (project_id, code) DO NOTHING;

-- 2. Главный администратор
INSERT INTO roles (id, project_id, code, label, description, is_system, access_type, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000002'::uuid, NULL, 'super_admin', 'Главный администратор', 'Все права кроме опасных и передачи владения. Управляет командой и ролями.', TRUE, 'admin_panel', 2)
ON CONFLICT (project_id, code) DO NOTHING;

-- 3. Администратор
INSERT INTO roles (id, project_id, code, label, description, is_system, access_type, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000003'::uuid, NULL, 'admin', 'Администратор', 'Операционные права: CRM, боты, заказы, сайты, аналитика. Без управления командой и опасных действий.', TRUE, 'admin_panel', 3)
ON CONFLICT (project_id, code) DO NOTHING;

-- 4. Гость
INSERT INTO roles (id, project_id, code, label, description, is_system, access_type, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000004'::uuid, NULL, 'guest', 'Гость', 'Карточка без данных. Нет входа в платформу. Создаётся автоматически при первом касании воронки.', TRUE, 'no_access', 4)
ON CONFLICT (project_id, code) DO NOTHING;

-- 5. Пользователь
INSERT INTO roles (id, project_id, code, label, description, is_system, access_type, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000005'::uuid, NULL, 'lead', 'Пользователь', 'Оставил данные (email/телефон). Нет входа в платформу. Маркетинговый статус карточки.', TRUE, 'no_access', 5)
ON CONFLICT (project_id, code) DO NOTHING;

-- 6. Ученик (получает доступ после оплаты)
INSERT INTO roles (id, project_id, code, label, description, is_system, access_type, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000006'::uuid, NULL, 'student', 'Ученик', 'Покупатель с входом. Видит витрину обучения: купленные курсы, ДЗ, профиль.', TRUE, 'student_panel', 6)
ON CONFLICT (project_id, code) DO NOTHING;

-- 7. Куратор
INSERT INTO roles (id, project_id, code, label, description, is_system, access_type, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000007'::uuid, NULL, 'curator', 'Куратор', 'Проверяет ДЗ, видит прогресс учеников и аналитику обучения. Без доступа к CRM/ботам/настройкам.', TRUE, 'admin_panel', 7)
ON CONFLICT (project_id, code) DO NOTHING;

-- 8. Продажник
INSERT INTO roles (id, project_id, code, label, description, is_system, access_type, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000008'::uuid, NULL, 'sales', 'Продажник', 'CRM, диалоги, заказы, выдача доступа. Без настроек и редактирования продуктов/ботов.', TRUE, 'admin_panel', 8)
ON CONFLICT (project_id, code) DO NOTHING;

-- 9. Таргетолог
INSERT INTO roles (id, project_id, code, label, description, is_system, access_type, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000009'::uuid, NULL, 'marketer', 'Таргетолог', 'Аналитика трафика, источники, UTM, статистика лендингов. Без доступа к CRM-данным и редактированию контента.', TRUE, 'admin_panel', 9)
ON CONFLICT (project_id, code) DO NOTHING;


-- =====================================================================
-- BLOCK D: ДЕФОЛТНЫЕ ПРАВА ДЛЯ СИСТЕМНЫХ РОЛЕЙ (template-уровень)
-- =====================================================================
-- При создании проекта эти права копируются в проектные копии ролей.
-- =====================================================================

-- D.1 OWNER — все permissions
INSERT INTO role_permissions (role_id, permission_code)
SELECT '00000000-0000-0000-0000-000000000001'::uuid, code FROM permissions
ON CONFLICT DO NOTHING;

-- D.2 SUPER_ADMIN — все КРОМЕ:
--   - danger.* (опасные)
--   - settings.domain.edit (опасное)
--   - crm.customers.delete (особо опасное)
INSERT INTO role_permissions (role_id, permission_code)
SELECT '00000000-0000-0000-0000-000000000002'::uuid, code
FROM permissions
WHERE category != 'danger'
  AND code NOT IN ('settings.domain.edit', 'crm.customers.delete')
ON CONFLICT DO NOTHING;

-- D.3 ADMIN — операционные права. БЕЗ team.*, settings.integrations.edit,
--   settings.domain.edit, crm.customers.delete, удаления продуктов/курсов.
INSERT INTO role_permissions (role_id, permission_code)
SELECT '00000000-0000-0000-0000-000000000003'::uuid, code
FROM permissions
WHERE category NOT IN ('danger', 'team')
  AND code NOT IN (
    'settings.domain.edit',
    'settings.integrations.edit',
    'crm.customers.delete',
    'products.delete',
    'learning.courses.delete',
    'orders.delete',
    'chatbots.delete',
    'sites.landings.delete'
  )
ON CONFLICT DO NOTHING;

-- D.4 GUEST — никаких прав (нет входа)
-- D.5 LEAD — никаких прав (нет входа)

-- D.6 STUDENT — нет permissions в админских разделах. Доступ к /learn
--   определяется через access_type='student_panel' и course_access (фаза 6.5).

-- D.7 CURATOR — обучение + просмотр карточек (без редактирования)
INSERT INTO role_permissions (role_id, permission_code) VALUES
  ('00000000-0000-0000-0000-000000000007'::uuid, 'learning.courses.view'),
  ('00000000-0000-0000-0000-000000000007'::uuid, 'learning.lessons.view'),
  ('00000000-0000-0000-0000-000000000007'::uuid, 'learning.homework.review'),
  ('00000000-0000-0000-0000-000000000007'::uuid, 'learning.analytics.view'),
  ('00000000-0000-0000-0000-000000000007'::uuid, 'crm.customers.view'),
  ('00000000-0000-0000-0000-000000000007'::uuid, 'media.view'),
  ('00000000-0000-0000-0000-000000000007'::uuid, 'videos.view')
ON CONFLICT DO NOTHING;

-- D.8 SALES — CRM, диалоги, заказы, доступ к курсам, без настроек
INSERT INTO role_permissions (role_id, permission_code) VALUES
  ('00000000-0000-0000-0000-000000000008'::uuid, 'crm.customers.view'),
  ('00000000-0000-0000-0000-000000000008'::uuid, 'crm.customers.create'),
  ('00000000-0000-0000-0000-000000000008'::uuid, 'crm.customers.edit'),
  ('00000000-0000-0000-0000-000000000008'::uuid, 'crm.customers.export'),
  ('00000000-0000-0000-0000-000000000008'::uuid, 'crm.segments.view'),
  ('00000000-0000-0000-0000-000000000008'::uuid, 'crm.segments.edit'),
  ('00000000-0000-0000-0000-000000000008'::uuid, 'crm.notes.view'),
  ('00000000-0000-0000-0000-000000000008'::uuid, 'crm.notes.create'),
  ('00000000-0000-0000-0000-000000000008'::uuid, 'crm.notes.edit'),
  ('00000000-0000-0000-0000-000000000008'::uuid, 'crm.fields.view'),
  ('00000000-0000-0000-0000-000000000008'::uuid, 'conversations.view'),
  ('00000000-0000-0000-0000-000000000008'::uuid, 'conversations.reply'),
  ('00000000-0000-0000-0000-000000000008'::uuid, 'orders.view'),
  ('00000000-0000-0000-0000-000000000008'::uuid, 'orders.create'),
  ('00000000-0000-0000-0000-000000000008'::uuid, 'orders.edit'),
  ('00000000-0000-0000-0000-000000000008'::uuid, 'products.view'),
  ('00000000-0000-0000-0000-000000000008'::uuid, 'learning.access.grant'),
  ('00000000-0000-0000-0000-000000000008'::uuid, 'funnels.view'),
  ('00000000-0000-0000-0000-000000000008'::uuid, 'analytics.general.view'),
  ('00000000-0000-0000-0000-000000000008'::uuid, 'media.view'),
  ('00000000-0000-0000-0000-000000000008'::uuid, 'videos.view'),
  ('00000000-0000-0000-0000-000000000008'::uuid, 'journal.view')
ON CONFLICT DO NOTHING;

-- D.9 MARKETER — аналитика, источники, лендинги (только смотреть)
INSERT INTO role_permissions (role_id, permission_code) VALUES
  ('00000000-0000-0000-0000-000000000009'::uuid, 'analytics.general.view'),
  ('00000000-0000-0000-0000-000000000009'::uuid, 'analytics.sources.view'),
  ('00000000-0000-0000-0000-000000000009'::uuid, 'analytics.funnel.view'),
  ('00000000-0000-0000-0000-000000000009'::uuid, 'analytics.export'),
  ('00000000-0000-0000-0000-000000000009'::uuid, 'sites.sources.view'),
  ('00000000-0000-0000-0000-000000000009'::uuid, 'sites.sources.edit'),
  ('00000000-0000-0000-0000-000000000009'::uuid, 'sites.landings.view'),
  ('00000000-0000-0000-0000-000000000009'::uuid, 'crm.customers.view'),
  ('00000000-0000-0000-0000-000000000009'::uuid, 'crm.segments.view'),
  ('00000000-0000-0000-0000-000000000009'::uuid, 'funnels.view'),
  ('00000000-0000-0000-0000-000000000009'::uuid, 'media.view')
ON CONFLICT DO NOTHING;


-- =====================================================================
-- BLOCK E: HELPER FUNCTIONS
-- =====================================================================

-- E.1 Проверка членства в проекте
CREATE OR REPLACE FUNCTION is_project_member(p_project_id uuid, p_user_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
      AND user_id = p_user_id
      AND status = 'active'
  );
$$;

-- E.2 Проверка конкретного permission
CREATE OR REPLACE FUNCTION has_permission(p_project_id uuid, p_user_id uuid, p_permission text)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM project_members pm
    JOIN role_permissions rp ON rp.role_id = pm.role_id
    WHERE pm.project_id = p_project_id
      AND pm.user_id = p_user_id
      AND pm.status = 'active'
      AND rp.permission_code = p_permission
  );
$$;

-- E.3 Получить роль пользователя в проекте (вернёт NULL если не член)
CREATE OR REPLACE FUNCTION get_member_role(p_project_id uuid, p_user_id uuid)
RETURNS TABLE (
  role_id uuid,
  role_code text,
  role_label text,
  access_type text,
  is_system boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.code, r.label, r.access_type, r.is_system
  FROM project_members pm
  JOIN roles r ON r.id = pm.role_id
  WHERE pm.project_id = p_project_id
    AND pm.user_id = p_user_id
    AND pm.status = 'active'
  LIMIT 1;
$$;

-- E.4 Список всех permissions пользователя в проекте
CREATE OR REPLACE FUNCTION get_member_permissions(p_project_id uuid, p_user_id uuid)
RETURNS TABLE (permission_code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rp.permission_code
  FROM project_members pm
  JOIN role_permissions rp ON rp.role_id = pm.role_id
  WHERE pm.project_id = p_project_id
    AND pm.user_id = p_user_id
    AND pm.status = 'active';
$$;

-- E.5 Триггер: при INSERT нового проекта автоматически копируем
--     9 системных ролей и их права в проект, и создаём project_members
--     для owner_id с ролью 'owner'.
CREATE OR REPLACE FUNCTION seed_project_roles_and_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  template_role RECORD;
  new_role_id UUID;
  owner_role_id UUID;
BEGIN
  -- Копируем все 9 системных ролей в новый проект
  FOR template_role IN
    SELECT * FROM roles WHERE project_id IS NULL AND is_system = TRUE ORDER BY sort_order
  LOOP
    INSERT INTO roles (project_id, code, label, description, is_system, access_type, sort_order)
    VALUES (NEW.id, template_role.code, template_role.label, template_role.description,
            TRUE, template_role.access_type, template_role.sort_order)
    RETURNING id INTO new_role_id;

    -- Копируем права из template
    INSERT INTO role_permissions (role_id, permission_code)
    SELECT new_role_id, permission_code
    FROM role_permissions
    WHERE role_id = template_role.id;

    -- Запоминаем ID owner роли проекта
    IF template_role.code = 'owner' THEN
      owner_role_id := new_role_id;
    END IF;
  END LOOP;

  -- Создаём project_members для owner_id с ролью 'owner'
  IF NEW.owner_id IS NOT NULL AND owner_role_id IS NOT NULL THEN
    INSERT INTO project_members (project_id, user_id, role_id, status)
    VALUES (NEW.id, NEW.owner_id, owner_role_id, 'active')
    ON CONFLICT (project_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_seed_roles ON projects;
CREATE TRIGGER trg_projects_seed_roles
  AFTER INSERT ON projects
  FOR EACH ROW
  EXECUTE FUNCTION seed_project_roles_and_owner();


-- =====================================================================
-- BLOCK F: BACKFILL — для всех существующих проектов
-- =====================================================================
-- Создаём проектные копии 9 ролей + копируем права + создаём
-- project_members с ролью owner для project.owner_id
-- =====================================================================

DO $$
DECLARE
  proj RECORD;
  template_role RECORD;
  new_role_id UUID;
  owner_role_id UUID;
BEGIN
  FOR proj IN SELECT id, owner_id FROM projects LOOP
    -- Пропускаем если у проекта уже есть роли (idempotent)
    IF EXISTS (SELECT 1 FROM roles WHERE project_id = proj.id) THEN
      CONTINUE;
    END IF;

    owner_role_id := NULL;

    -- Копируем 9 системных ролей
    FOR template_role IN
      SELECT * FROM roles WHERE project_id IS NULL AND is_system = TRUE ORDER BY sort_order
    LOOP
      INSERT INTO roles (project_id, code, label, description, is_system, access_type, sort_order)
      VALUES (proj.id, template_role.code, template_role.label, template_role.description,
              TRUE, template_role.access_type, template_role.sort_order)
      RETURNING id INTO new_role_id;

      INSERT INTO role_permissions (role_id, permission_code)
      SELECT new_role_id, permission_code
      FROM role_permissions
      WHERE role_id = template_role.id;

      IF template_role.code = 'owner' THEN
        owner_role_id := new_role_id;
      END IF;
    END LOOP;

    -- Создаём project_members для owner_id
    IF proj.owner_id IS NOT NULL AND owner_role_id IS NOT NULL THEN
      INSERT INTO project_members (project_id, user_id, role_id, status)
      VALUES (proj.id, proj.owner_id, owner_role_id, 'active')
      ON CONFLICT (project_id, user_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- Создаём users_meta для всех существующих auth.users.
-- Те, кто УЖЕ владеет хотя бы одним проектом — получают can_create_projects=TRUE
-- (они зарегистрировались самостоятельно и создавали проекты).
INSERT INTO users_meta (user_id, can_create_projects, full_name)
SELECT
  u.id,
  EXISTS (SELECT 1 FROM projects p WHERE p.owner_id = u.id),
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', NULL)
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;


-- =====================================================================
-- BLOCK G: RLS (минимальный — только защита служебных таблиц)
-- =====================================================================

ALTER TABLE permissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE users_meta        ENABLE ROW LEVEL SECURITY;

-- permissions: справочник, читать всем залогиненным
DROP POLICY IF EXISTS "permissions_read_all" ON permissions;
CREATE POLICY "permissions_read_all" ON permissions
  FOR SELECT USING (auth.role() = 'authenticated');

-- roles: видит только член проекта (системные шаблоны не видны через UI)
DROP POLICY IF EXISTS "roles_member_read" ON roles;
CREATE POLICY "roles_member_read" ON roles
  FOR SELECT USING (
    project_id IS NULL OR is_project_member(project_id, auth.uid())
  );

-- roles: пишет только тот, у кого есть team.roles.* в этом проекте
--        (или owner — у него все права)
DROP POLICY IF EXISTS "roles_member_write" ON roles;
CREATE POLICY "roles_member_write" ON roles
  FOR ALL USING (
    project_id IS NOT NULL AND (
      has_permission(project_id, auth.uid(), 'team.roles.create')
      OR has_permission(project_id, auth.uid(), 'team.roles.edit')
      OR has_permission(project_id, auth.uid(), 'team.roles.delete')
    )
  );

-- role_permissions: читает любой член проекта роли
DROP POLICY IF EXISTS "role_permissions_member_read" ON role_permissions;
CREATE POLICY "role_permissions_member_read" ON role_permissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM roles r
      WHERE r.id = role_permissions.role_id
        AND (r.project_id IS NULL OR is_project_member(r.project_id, auth.uid()))
    )
  );

-- role_permissions: пишет только с team.roles.edit
DROP POLICY IF EXISTS "role_permissions_member_write" ON role_permissions;
CREATE POLICY "role_permissions_member_write" ON role_permissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM roles r
      WHERE r.id = role_permissions.role_id
        AND r.project_id IS NOT NULL
        AND has_permission(r.project_id, auth.uid(), 'team.roles.edit')
    )
  );

-- project_members: читает любой член того же проекта
DROP POLICY IF EXISTS "project_members_member_read" ON project_members;
CREATE POLICY "project_members_member_read" ON project_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_project_member(project_id, auth.uid())
  );

-- project_members: пишет с team.members.*
DROP POLICY IF EXISTS "project_members_member_write" ON project_members;
CREATE POLICY "project_members_member_write" ON project_members
  FOR ALL USING (
    has_permission(project_id, auth.uid(), 'team.members.invite')
    OR has_permission(project_id, auth.uid(), 'team.members.edit')
    OR has_permission(project_id, auth.uid(), 'team.members.remove')
  );

-- invitations: читает участник проекта с team.members.view
DROP POLICY IF EXISTS "invitations_member_read" ON invitations;
CREATE POLICY "invitations_member_read" ON invitations
  FOR SELECT USING (
    has_permission(project_id, auth.uid(), 'team.members.view')
  );

-- invitations: пишет с team.members.invite
DROP POLICY IF EXISTS "invitations_member_write" ON invitations;
CREATE POLICY "invitations_member_write" ON invitations
  FOR ALL USING (
    has_permission(project_id, auth.uid(), 'team.members.invite')
  );

-- users_meta: каждый видит и редактирует свою запись
DROP POLICY IF EXISTS "users_meta_self" ON users_meta;
CREATE POLICY "users_meta_self" ON users_meta
  FOR ALL USING (user_id = auth.uid());

-- users_meta: дополнительно — можно прочитать запись любого члена общих проектов
DROP POLICY IF EXISTS "users_meta_member_read" ON users_meta;
CREATE POLICY "users_meta_member_read" ON users_meta
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM project_members pm1
      JOIN project_members pm2 ON pm2.project_id = pm1.project_id
      WHERE pm1.user_id = auth.uid()
        AND pm2.user_id = users_meta.user_id
    )
  );


-- =====================================================================
-- DONE
-- =====================================================================
-- После применения:
-- - 80+ permissions в каталоге
-- - 9 системных ролей (как глобальные шаблоны)
-- - Для всех существующих проектов: 9 ролей + права + project_members(owner)
-- - users_meta для всех auth.users + can_create_projects=TRUE для владельцев
-- - Helper функции: is_project_member, has_permission, get_member_role, get_member_permissions
-- - Триггер на INSERT projects автоматически создаёт всё для нового проекта
-- - RLS на новые таблицы (защита служебных таблиц)
--
-- НЕ ИЗМЕНЕНО (это фаза 6.2):
-- - RLS на остальных таблицах (всё ещё через owner_id = auth.uid())
-- =====================================================================
