-- ============================================================================
-- 56-learning-platform.sql
-- Phase 7.1 — БД-миграция учебной платформы
--
-- Решение: knowledge/decisions/learning-platform-architecture-2026-04-28.md
--
-- Что делаем:
-- 1. Расширяем course_modules (parent_module_id для подмодулей, open-rules,
--    is_bonus, cover_url, hidden_until_open, description, updated_at)
-- 2. Расширяем course_lessons (course_id для уроков в корне курса,
--    module_id nullable, completion_rules, is_bonus, is_exam, attempts_limit,
--    video_threshold, cover_url, description, updated_at)
-- 3. Расширяем courses (cover_url, certificate_enabled, has_gamification,
--    points_system_enabled, scoring_rules)
-- 4. Новые таблицы:
--    lesson_blocks, lesson_assignments, quiz_questions,
--    assignment_submissions, assignment_messages, quiz_attempts,
--    lesson_progress, lesson_video_views,
--    tariff_content_access,
--    product_groups, product_group_curators, product_group_members,
--    course_certificates
-- 5. Триггеры:
--    - lesson_progress.opened_at автоматом при INSERT
--    - авто-распределение в дефолтную группу при выдаче доступа
--    - дефолтная группа создаётся при создании продукта
-- 6. RLS через is_project_member() (как в фазе 6)
-- ============================================================================

-- ===========================================================================
-- 1. РАСШИРЕНИЕ courses
-- ===========================================================================

ALTER TABLE courses ADD COLUMN IF NOT EXISTS cover_url text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS certificate_enabled boolean DEFAULT false;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS points_system_enabled boolean DEFAULT false;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS gamification_enabled boolean DEFAULT false;
-- product_id уже есть

-- ===========================================================================
-- 2. РАСШИРЕНИЕ course_modules
-- ===========================================================================

ALTER TABLE course_modules ADD COLUMN IF NOT EXISTS parent_module_id uuid REFERENCES course_modules(id) ON DELETE CASCADE;
ALTER TABLE course_modules ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE course_modules ADD COLUMN IF NOT EXISTS cover_url text;
ALTER TABLE course_modules ADD COLUMN IF NOT EXISTS is_bonus boolean DEFAULT false;
ALTER TABLE course_modules ADD COLUMN IF NOT EXISTS is_hidden_until_open boolean DEFAULT false;
-- open_rule_type: instant | date | days_after_access | after_previous | manual
ALTER TABLE course_modules ADD COLUMN IF NOT EXISTS open_rule_type text DEFAULT 'instant';
ALTER TABLE course_modules ADD COLUMN IF NOT EXISTS open_at timestamptz;
ALTER TABLE course_modules ADD COLUMN IF NOT EXISTS open_after_days integer;
ALTER TABLE course_modules ADD COLUMN IF NOT EXISTS previous_module_id uuid REFERENCES course_modules(id) ON DELETE SET NULL;
ALTER TABLE course_modules ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Защита от 3+ уровня: если parent_module_id указан, то этот модуль = подмодуль
-- и у него самого не должно быть ни одного дочернего модуля
-- (проверка через триггер, см. ниже)

CREATE INDEX IF NOT EXISTS idx_course_modules_parent ON course_modules(parent_module_id);
CREATE INDEX IF NOT EXISTS idx_course_modules_course ON course_modules(course_id);

-- ===========================================================================
-- 3. РАСШИРЕНИЕ course_lessons
-- ===========================================================================

-- Уроки могут лежать прямо в курсе (course_id) или в модуле/подмодуле (module_id)
ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE course_lessons ALTER COLUMN module_id DROP NOT NULL;

ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS cover_url text;
ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS is_bonus boolean DEFAULT false;
ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS is_exam boolean DEFAULT false;
ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS attempts_limit integer DEFAULT 0; -- 0 = unlimited
ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS video_threshold integer DEFAULT 90;

-- completion_rules — JSON с правилами завершения урока
-- Пример: {"button": true, "video_required": true, "video_threshold": 90,
--          "homework_required": true, "homework_review_type": "auto"|"curator",
--          "stop_lesson": true}
-- stop_lesson: true = блокирует следующий урок до выполнения
ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS completion_rules jsonb DEFAULT '{"button": true}'::jsonb;

-- Жёсткий vs мягкий стоп при провале попыток теста
ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS hard_stop_on_failure boolean DEFAULT true;

ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill: проставить course_id для уроков, у которых module_id указан
-- (для существующих данных — старая модель)
UPDATE course_lessons cl
SET course_id = (SELECT cm.course_id FROM course_modules cm WHERE cm.id = cl.module_id)
WHERE cl.course_id IS NULL AND cl.module_id IS NOT NULL;

-- Защита: должен быть ровно один из (course_id || module_id)
ALTER TABLE course_lessons DROP CONSTRAINT IF EXISTS course_lessons_parent_check;
ALTER TABLE course_lessons ADD CONSTRAINT course_lessons_parent_check
  CHECK ( (course_id IS NOT NULL) OR (module_id IS NOT NULL) );

CREATE INDEX IF NOT EXISTS idx_course_lessons_course ON course_lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_course_lessons_module ON course_lessons(module_id);
CREATE INDEX IF NOT EXISTS idx_course_lessons_exam ON course_lessons(course_id, is_exam) WHERE is_exam = true;

-- ===========================================================================
-- 4. lesson_blocks — конструктор уроков
-- ===========================================================================

CREATE TABLE IF NOT EXISTS lesson_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  -- video | text | audio | files | assignment
  type text NOT NULL,
  -- Контент зависит от типа:
  --   video:      {kinescope_id, title, duration}
  --   text:       {html} — TipTap rich-text
  --   audio:      {kinescope_id, title}
  --   files:      {items: [{name, url, size_bytes, mime}]}
  --   assignment: {assignment_id} — ссылка на lesson_assignments
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  order_position integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_blocks_lesson ON lesson_blocks(lesson_id, order_position);

-- ===========================================================================
-- 5. lesson_assignments — задания (живут параллельно блокам, ссылка из блока)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS lesson_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  -- open_text | test_single | test_multi | test_open_text | file_upload | video_response
  type text NOT NULL,
  title text NOT NULL DEFAULT '',
  description text,
  -- Гибкие настройки задания:
  -- {
  --   points_total: int,            -- если points_system_enabled
  --   attempts_limit: int,          -- 0 = unlimited (для тестов)
  --   deadline_type: 'none'|'days'|'date',
  --   deadline_days: int,           -- N дней с момента открытия урока админом
  --   deadline_at: timestamptz,     -- абсолютная дата
  --   keywords: [string],           -- для автопроверки текста
  --   passing_score: int,           -- проходной балл
  --   show_correct_after: false     -- юзер сказал НЕ показывать правильные ответы
  -- }
  settings jsonb DEFAULT '{}'::jsonb,
  is_required boolean DEFAULT true,
  order_position integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_assignments_lesson ON lesson_assignments(lesson_id);

-- ===========================================================================
-- 6. quiz_questions — вопросы внутри тестового задания
-- ===========================================================================

CREATE TABLE IF NOT EXISTS quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES lesson_assignments(id) ON DELETE CASCADE,
  -- single | multi | text (произвольный ответ без вариантов)
  type text NOT NULL,
  question_text text NOT NULL,
  -- Для single/multi: [{id, text, is_correct}]
  -- Для text: пустой массив
  options jsonb DEFAULT '[]'::jsonb,
  -- Для type=text: правильный ответ (точное совпадение нечувств. к регистру) или null
  correct_text text,
  -- Можно несколько правильных текстов (для type=text), массив строк
  correct_text_alts jsonb DEFAULT '[]'::jsonb,
  points integer DEFAULT 1,
  order_position integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_assignment ON quiz_questions(assignment_id, order_position);

-- ===========================================================================
-- 7. assignment_submissions — сдача ДЗ (1 на ученика+задание, диалог сверху)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES lesson_assignments(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  -- pending: только что создан, ученик ещё не сдал
  -- in_review: сдал, ждёт куратора
  -- needs_revision: куратор отправил на доработку
  -- accepted: куратор принял (или авто-проверка прошла)
  -- rejected: куратор отклонил окончательно (без права пересдачи)
  -- expired: дедлайн просрочен, проверять не будут
  status text NOT NULL DEFAULT 'pending',
  -- Контент ответа ученика (зависит от типа задания):
  -- open_text: {text}
  -- test_*: {answers: [{question_id, value}]}
  -- file_upload: {files: [{name, url, size_bytes}]}
  -- video_response: {video_url}
  content jsonb DEFAULT '{}'::jsonb,
  score integer,
  errors_count integer,
  attempt_number integer DEFAULT 1, -- с какой попытки сдан (для теста)
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (assignment_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_customer ON assignment_submissions(customer_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON assignment_submissions(status);

-- ===========================================================================
-- 8. assignment_messages — диалог под ДЗ
-- ===========================================================================

CREATE TABLE IF NOT EXISTS assignment_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
  -- student | curator (используется и для admin)
  sender_type text NOT NULL,
  sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  text text,
  -- [{type: 'image'|'file', url, name, size_bytes, mime}]
  attachments jsonb DEFAULT '[]'::jsonb,
  -- Ставится при изменении статуса (для системных сообщений)
  status_change text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignment_messages_submission ON assignment_messages(submission_id, created_at);

-- ===========================================================================
-- 9. quiz_attempts — все попытки прохождения теста
-- ===========================================================================

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES lesson_assignments(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  -- [{question_id, answer}]
  answers jsonb DEFAULT '[]'::jsonb,
  score integer DEFAULT 0,
  errors_count integer DEFAULT 0,
  passed boolean DEFAULT false,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_assignment_customer ON quiz_attempts(assignment_id, customer_id, attempt_number);

-- ===========================================================================
-- 10. lesson_progress — прогресс ученика по уроку
-- ===========================================================================

CREATE TABLE IF NOT EXISTS lesson_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  -- Когда первый раз открыл урок (для расчёта дедлайна).
  -- Юзер сказал: "дата открытия этого урока админом для всех один дедлайн!"
  -- → берём lesson.published_at / created_at, а opened_at оставляем для аналитики.
  opened_at timestamptz,
  completed_at timestamptz,
  video_max_percent integer DEFAULT 0,
  video_total_seconds integer DEFAULT 0,
  -- Статус: not_started | in_progress | completed | skipped (бонусный)
  status text DEFAULT 'not_started',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (customer_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_customer ON lesson_progress(customer_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_lesson ON lesson_progress(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_completed ON lesson_progress(customer_id, completed_at) WHERE completed_at IS NOT NULL;

-- ===========================================================================
-- 11. lesson_video_views — детальная статистика просмотров видео
-- ===========================================================================

CREATE TABLE IF NOT EXISTS lesson_video_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  block_id uuid REFERENCES lesson_blocks(id) ON DELETE CASCADE,
  -- Kinescope ID видео (на случай миграций/замен)
  kinescope_id text,
  duration_seconds integer DEFAULT 0,
  watched_seconds integer DEFAULT 0,
  max_position_seconds integer DEFAULT 0,
  watch_percent integer DEFAULT 0,
  sessions integer DEFAULT 1,
  first_watched_at timestamptz DEFAULT now(),
  last_watched_at timestamptz DEFAULT now(),
  UNIQUE (customer_id, block_id)
);

CREATE INDEX IF NOT EXISTS idx_video_views_lesson ON lesson_video_views(lesson_id);
CREATE INDEX IF NOT EXISTS idx_video_views_customer ON lesson_video_views(customer_id);

-- ===========================================================================
-- 12. tariff_content_access — какому тарифу какие узлы доступны
-- ===========================================================================
-- Если у узла НЕТ записей — он доступен ВСЕМ тарифам продукта.
-- Если есть записи — доступен ТОЛЬКО тарифам из списка.

CREATE TABLE IF NOT EXISTS tariff_content_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tariff_id uuid NOT NULL REFERENCES tariffs(id) ON DELETE CASCADE,
  -- module | submodule | lesson
  -- (submodule — это тоже строка в course_modules, но для UI удобно различать)
  node_type text NOT NULL,
  node_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (tariff_id, node_type, node_id)
);

CREATE INDEX IF NOT EXISTS idx_tariff_access_tariff ON tariff_content_access(tariff_id);
CREATE INDEX IF NOT EXISTS idx_tariff_access_node ON tariff_content_access(node_type, node_id);

-- ===========================================================================
-- 13. product_groups — группы учеников внутри продукта
-- ===========================================================================

CREATE TABLE IF NOT EXISTS product_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_default boolean DEFAULT false,
  order_position integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_groups_product ON product_groups(product_id);
-- Только одна дефолтная группа на продукт
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_groups_default ON product_groups(product_id) WHERE is_default = true;

-- ===========================================================================
-- 14. product_group_curators — какие кураторы отвечают за какую группу
-- ===========================================================================

CREATE TABLE IF NOT EXISTS product_group_curators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES product_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_curators_user ON product_group_curators(user_id);

-- ===========================================================================
-- 15. product_group_members — какой ученик в какой группе
-- ===========================================================================
-- Один ученик = одна группа на продукт (UNIQUE по customer_id + product_id
-- через денормализованное поле)

CREATE TABLE IF NOT EXISTS product_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES product_groups(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  added_at timestamptz DEFAULT now(),
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (product_id, customer_id) -- один ученик = одна группа в продукте
);

CREATE INDEX IF NOT EXISTS idx_group_members_group ON product_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_customer ON product_group_members(customer_id);

-- ===========================================================================
-- 16. course_certificates — выданные сертификаты
-- ===========================================================================

CREATE TABLE IF NOT EXISTS course_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  -- Уникальный публичный номер вида STUDENCY-XXXX-NNN
  certificate_number text UNIQUE NOT NULL,
  -- Снимок данных на момент выдачи (имя могло измениться, но сертификат стабилен
  -- в случае не-перевыпуска; перевыпуск делает UPDATE этих полей)
  student_name_snapshot text,
  course_name_snapshot text,
  exam_score integer,
  issued_at timestamptz DEFAULT now(),
  reissued_at timestamptz,
  -- Доп. данные для шаблона
  extra jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_certificates_customer ON course_certificates(customer_id);
CREATE INDEX IF NOT EXISTS idx_certificates_course ON course_certificates(course_id);

-- ===========================================================================
-- 17. ТРИГГЕРЫ
-- ===========================================================================

-- (a) updated_at автообновление для всех таблиц
CREATE OR REPLACE FUNCTION set_updated_at_now() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'course_modules','course_lessons','lesson_blocks','lesson_assignments',
    'assignment_submissions','lesson_progress'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s;', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();', t, t);
  END LOOP;
END $$;

-- (b) Защита от 3+ уровня вложенности модулей.
-- Если parent_module_id указан, то у parent не должен быть свой parent
CREATE OR REPLACE FUNCTION check_module_max_depth() RETURNS trigger AS $$
DECLARE
  parent_has_parent boolean;
BEGIN
  IF NEW.parent_module_id IS NOT NULL THEN
    SELECT (parent_module_id IS NOT NULL) INTO parent_has_parent
    FROM course_modules WHERE id = NEW.parent_module_id;
    IF parent_has_parent THEN
      RAISE EXCEPTION 'Подмодуль не может содержать ещё подмодуль (максимум 2 уровня вложенности)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_module_depth ON course_modules;
CREATE TRIGGER trg_check_module_depth
  BEFORE INSERT OR UPDATE OF parent_module_id ON course_modules
  FOR EACH ROW EXECUTE FUNCTION check_module_max_depth();

-- (c) Авто-создание дефолтной группы при создании продукта
CREATE OR REPLACE FUNCTION create_default_product_group() RETURNS trigger AS $$
BEGIN
  INSERT INTO product_groups (product_id, name, is_default, order_position)
  VALUES (NEW.id, 'Основная группа', true, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_default_group ON products;
CREATE TRIGGER trg_create_default_group
  AFTER INSERT ON products
  FOR EACH ROW EXECUTE FUNCTION create_default_product_group();

-- Backfill: создать дефолтные группы для существующих продуктов
INSERT INTO product_groups (product_id, name, is_default, order_position)
SELECT p.id, 'Основная группа', true, 0
FROM products p
WHERE NOT EXISTS (SELECT 1 FROM product_groups pg WHERE pg.product_id = p.id);

-- (d) Авто-распределение в дефолтную группу при выдаче доступа
-- При INSERT в customer_access находим продукт через тариф и кладём в дефолтную группу
CREATE OR REPLACE FUNCTION auto_assign_to_default_group() RETURNS trigger AS $$
DECLARE
  v_product_id uuid;
  v_default_group_id uuid;
BEGIN
  SELECT t.product_id INTO v_product_id FROM tariffs t WHERE t.id = NEW.tariff_id;
  IF v_product_id IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_default_group_id FROM product_groups
  WHERE product_id = v_product_id AND is_default = true LIMIT 1;
  IF v_default_group_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO product_group_members (group_id, product_id, customer_id)
  VALUES (v_default_group_id, v_product_id, NEW.customer_id)
  ON CONFLICT (product_id, customer_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_assign_group ON customer_access;
CREATE TRIGGER trg_auto_assign_group
  AFTER INSERT ON customer_access
  FOR EACH ROW EXECUTE FUNCTION auto_assign_to_default_group();

-- Backfill: распределить уже существующих учеников по дефолтным группам
INSERT INTO product_group_members (group_id, product_id, customer_id)
SELECT DISTINCT pg.id, t.product_id, ca.customer_id
FROM customer_access ca
JOIN tariffs t ON t.id = ca.tariff_id
JOIN product_groups pg ON pg.product_id = t.product_id AND pg.is_default = true
ON CONFLICT (product_id, customer_id) DO NOTHING;

-- (e) Авто-генератор уникального certificate_number в формате STUDENCY-XXXX-NNN
CREATE OR REPLACE FUNCTION generate_certificate_number() RETURNS trigger AS $$
DECLARE
  v_prefix text;
  v_seq int;
BEGIN
  IF NEW.certificate_number IS NOT NULL AND NEW.certificate_number <> '' THEN
    RETURN NEW;
  END IF;
  v_prefix := upper(substring(replace(NEW.course_id::text,'-','') from 1 for 4));
  SELECT COALESCE(MAX(CAST(SUBSTRING(certificate_number FROM '\d+$') AS INT)), 0) + 1
    INTO v_seq FROM course_certificates WHERE course_id = NEW.course_id;
  NEW.certificate_number := 'STUDENCY-' || v_prefix || '-' || lpad(v_seq::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_certificate_number ON course_certificates;
CREATE TRIGGER trg_certificate_number
  BEFORE INSERT ON course_certificates
  FOR EACH ROW EXECUTE FUNCTION generate_certificate_number();

-- ===========================================================================
-- 18. RLS — через is_project_member() (паттерн из фазы 6)
-- ===========================================================================

-- Включаем RLS на новых таблицах
ALTER TABLE lesson_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_video_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE tariff_content_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_group_curators ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_certificates ENABLE ROW LEVEL SECURITY;

-- Helper: получить project_id урока через цепочку module → course
CREATE OR REPLACE FUNCTION lesson_project_id(p_lesson_id uuid) RETURNS uuid AS $$
  SELECT c.project_id
  FROM course_lessons l
  LEFT JOIN course_modules m ON m.id = l.module_id
  LEFT JOIN courses c ON c.id = COALESCE(l.course_id, m.course_id)
  WHERE l.id = p_lesson_id;
$$ LANGUAGE sql STABLE;

-- Helper: получить project_id задания
CREATE OR REPLACE FUNCTION assignment_project_id(p_assignment_id uuid) RETURNS uuid AS $$
  SELECT lesson_project_id(a.lesson_id)
  FROM lesson_assignments a WHERE a.id = p_assignment_id;
$$ LANGUAGE sql STABLE;

-- Helper: получить project_id продукта
CREATE OR REPLACE FUNCTION product_project_id(p_product_id uuid) RETURNS uuid AS $$
  SELECT project_id FROM products WHERE id = p_product_id;
$$ LANGUAGE sql STABLE;

-- lesson_blocks
DROP POLICY IF EXISTS "lesson_blocks_member_all" ON lesson_blocks;
CREATE POLICY "lesson_blocks_member_all" ON lesson_blocks
  FOR ALL USING (is_project_member(lesson_project_id(lesson_id)))
  WITH CHECK (is_project_member(lesson_project_id(lesson_id)));

-- lesson_assignments
DROP POLICY IF EXISTS "lesson_assignments_member_all" ON lesson_assignments;
CREATE POLICY "lesson_assignments_member_all" ON lesson_assignments
  FOR ALL USING (is_project_member(lesson_project_id(lesson_id)))
  WITH CHECK (is_project_member(lesson_project_id(lesson_id)));

-- quiz_questions
DROP POLICY IF EXISTS "quiz_questions_member_all" ON quiz_questions;
CREATE POLICY "quiz_questions_member_all" ON quiz_questions
  FOR ALL USING (is_project_member(assignment_project_id(assignment_id)))
  WITH CHECK (is_project_member(assignment_project_id(assignment_id)));

-- assignment_submissions: project member видит все, ученик — только свои
DROP POLICY IF EXISTS "submissions_member_all" ON assignment_submissions;
CREATE POLICY "submissions_member_all" ON assignment_submissions
  FOR ALL USING (is_project_member(assignment_project_id(assignment_id)))
  WITH CHECK (is_project_member(assignment_project_id(assignment_id)));

-- assignment_messages
DROP POLICY IF EXISTS "assignment_messages_member_all" ON assignment_messages;
CREATE POLICY "assignment_messages_member_all" ON assignment_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM assignment_submissions s
      WHERE s.id = submission_id
        AND is_project_member(assignment_project_id(s.assignment_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM assignment_submissions s
      WHERE s.id = submission_id
        AND is_project_member(assignment_project_id(s.assignment_id))
    )
  );

-- quiz_attempts
DROP POLICY IF EXISTS "quiz_attempts_member_all" ON quiz_attempts;
CREATE POLICY "quiz_attempts_member_all" ON quiz_attempts
  FOR ALL USING (is_project_member(assignment_project_id(assignment_id)))
  WITH CHECK (is_project_member(assignment_project_id(assignment_id)));

-- lesson_progress
DROP POLICY IF EXISTS "lesson_progress_member_all" ON lesson_progress;
CREATE POLICY "lesson_progress_member_all" ON lesson_progress
  FOR ALL USING (is_project_member(lesson_project_id(lesson_id)))
  WITH CHECK (is_project_member(lesson_project_id(lesson_id)));

-- lesson_video_views
DROP POLICY IF EXISTS "video_views_member_all" ON lesson_video_views;
CREATE POLICY "video_views_member_all" ON lesson_video_views
  FOR ALL USING (is_project_member(lesson_project_id(lesson_id)))
  WITH CHECK (is_project_member(lesson_project_id(lesson_id)));

-- tariff_content_access
DROP POLICY IF EXISTS "tariff_access_member_all" ON tariff_content_access;
CREATE POLICY "tariff_access_member_all" ON tariff_content_access
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tariffs t
      JOIN products p ON p.id = t.product_id
      WHERE t.id = tariff_id AND is_project_member(p.project_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tariffs t
      JOIN products p ON p.id = t.product_id
      WHERE t.id = tariff_id AND is_project_member(p.project_id)
    )
  );

-- product_groups
DROP POLICY IF EXISTS "product_groups_member_all" ON product_groups;
CREATE POLICY "product_groups_member_all" ON product_groups
  FOR ALL USING (is_project_member(product_project_id(product_id)))
  WITH CHECK (is_project_member(product_project_id(product_id)));

-- product_group_curators
DROP POLICY IF EXISTS "group_curators_member_all" ON product_group_curators;
CREATE POLICY "group_curators_member_all" ON product_group_curators
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM product_groups g
      WHERE g.id = group_id AND is_project_member(product_project_id(g.product_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM product_groups g
      WHERE g.id = group_id AND is_project_member(product_project_id(g.product_id))
    )
  );

-- product_group_members
DROP POLICY IF EXISTS "group_members_member_all" ON product_group_members;
CREATE POLICY "group_members_member_all" ON product_group_members
  FOR ALL USING (is_project_member(product_project_id(product_id)))
  WITH CHECK (is_project_member(product_project_id(product_id)));

-- course_certificates
DROP POLICY IF EXISTS "certificates_member_all" ON course_certificates;
CREATE POLICY "certificates_member_all" ON course_certificates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM courses c WHERE c.id = course_id AND is_project_member(c.project_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses c WHERE c.id = course_id AND is_project_member(c.project_id)
    )
  );

-- ===========================================================================
-- 19. PERMISSIONS — добавить новые learning.* permissions для ролей
-- ===========================================================================
-- В фазе 6 добавлены: learning.courses.view/create/edit/delete
-- Добавляем расширение для домашек, групп, статистики

INSERT INTO permissions (code, category, label, description, is_dangerous, sort_order) VALUES
  ('learning.lessons.view',     'learning', 'Уроки — смотреть',           'Видит содержимое уроков',                         FALSE, 510),
  ('learning.lessons.edit',     'learning', 'Уроки — редактировать',      'Редактирует содержимое уроков',                   FALSE, 511),
  ('learning.assignments.review','learning','Домашки — проверять',         'Видит и проверяет ДЗ учеников',                   FALSE, 520),
  ('learning.groups.manage',    'learning', 'Группы — управлять',         'Создаёт группы, перераспределяет учеников',       FALSE, 530),
  ('learning.curators.assign',  'learning', 'Кураторы — назначать',       'Закрепляет кураторов за группами',                FALSE, 531),
  ('learning.stats.view',       'learning', 'Статистика — смотреть',      'Видит дашборды по урокам/модулям/курсам',         FALSE, 540),
  ('learning.access.grant',     'learning', 'Доступ — выдавать вручную',  'Может выдать доступ к продукту без оплаты',       FALSE, 550),
  ('learning.access.extend',    'learning', 'Доступ — продлевать вручную','Может продлить/сократить доступ ученика',         FALSE, 551)
ON CONFLICT (code) DO NOTHING;

-- Раздать новые permissions системным ролям:
-- Owner, Super Admin, Admin — всё
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM roles r
CROSS JOIN permissions p
WHERE r.id IN (
  '00000000-0000-0000-0000-000000000001'::uuid,  -- owner
  '00000000-0000-0000-0000-000000000002'::uuid,  -- super_admin
  '00000000-0000-0000-0000-000000000003'::uuid   -- admin
)
AND p.code IN (
  'learning.lessons.view','learning.lessons.edit',
  'learning.assignments.review',
  'learning.groups.manage','learning.curators.assign',
  'learning.stats.view',
  'learning.access.grant','learning.access.extend'
)
ON CONFLICT DO NOTHING;

-- Куратор — view, проверка ДЗ, статистика
INSERT INTO role_permissions (role_id, permission_code)
SELECT '00000000-0000-0000-0000-000000000007'::uuid, code
FROM permissions
WHERE code IN ('learning.lessons.view','learning.assignments.review','learning.stats.view')
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 20. VIEW для удобства запросов из админки
-- ===========================================================================

-- Карта курса: курс → модули → подмодули → уроки в одном виде
CREATE OR REPLACE VIEW course_tree_view AS
SELECT
  c.id AS course_id,
  c.project_id,
  c.name AS course_name,
  m.id AS module_id,
  m.parent_module_id,
  m.name AS module_name,
  m.is_bonus AS module_is_bonus,
  m.order_position AS module_order,
  l.id AS lesson_id,
  l.name AS lesson_name,
  l.is_bonus AS lesson_is_bonus,
  l.is_exam,
  l.order_position AS lesson_order,
  COALESCE(l.module_id, NULL) AS lesson_module_id,
  CASE
    WHEN l.course_id IS NOT NULL THEN 'course'
    WHEN m.parent_module_id IS NOT NULL THEN 'submodule'
    ELSE 'module'
  END AS lesson_parent_type
FROM courses c
LEFT JOIN course_modules m ON m.course_id = c.id
LEFT JOIN course_lessons l ON
  (l.module_id = m.id) OR (l.course_id = c.id AND l.module_id IS NULL);

-- Сводка по курсу (счётчики)
CREATE OR REPLACE VIEW course_summary_view AS
SELECT
  c.id AS course_id,
  c.project_id,
  c.name,
  c.cover_url,
  c.is_published,
  c.product_id,
  c.certificate_enabled,
  COUNT(DISTINCT m1.id) FILTER (WHERE m1.parent_module_id IS NULL) AS module_count,
  COUNT(DISTINCT m1.id) FILTER (WHERE m1.parent_module_id IS NOT NULL) AS submodule_count,
  COUNT(DISTINCT l.id) FILTER (WHERE l.is_bonus = false AND l.is_exam = false) AS lesson_count,
  COUNT(DISTINCT l.id) FILTER (WHERE l.is_bonus = true) AS bonus_lesson_count,
  COUNT(DISTINCT l.id) FILTER (WHERE l.is_exam = true) AS exam_count
FROM courses c
LEFT JOIN course_modules m1 ON m1.course_id = c.id
LEFT JOIN course_lessons l ON (l.module_id = m1.id OR l.course_id = c.id)
GROUP BY c.id;

-- ===========================================================================
-- ВСЁ. Миграция применяется идемпотентно.
-- ===========================================================================
