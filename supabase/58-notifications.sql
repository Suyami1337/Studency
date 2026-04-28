-- ============================================================================
-- 58-notifications.sql
-- Phase 7.12 — Уведомления внутри платформы
--
-- Минимальная универсальная таблица notifications. Получатель: либо user_id
-- (для куратора/админа), либо customer_id (для ученика).
-- Триггеры: новая ДЗ → куратору. Изменение статуса ДЗ → ученику.
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Адресат: один из двух
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  -- Тип события: homework_submitted, homework_status_changed, certificate_issued, module_opened, deadline_warning
  type text NOT NULL,
  title text NOT NULL,
  body text,
  -- Куда вести при клике: например /project/<id>/learning/homework или /learn/course/.../lesson/...
  link text,
  -- Доп. данные о событии
  data jsonb DEFAULT '{}'::jsonb,
  is_read boolean DEFAULT false,
  read_at timestamptz,
  created_at timestamptz DEFAULT now(),

  CHECK ( (recipient_user_id IS NOT NULL) OR (recipient_customer_id IS NOT NULL) )
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(recipient_user_id, is_read, created_at DESC) WHERE recipient_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_customer ON notifications(recipient_customer_id, is_read, created_at DESC) WHERE recipient_customer_id IS NOT NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Юзеры видят свои уведомления
DROP POLICY IF EXISTS "notifications_user_own" ON notifications;
CREATE POLICY "notifications_user_own" ON notifications
  FOR ALL USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

-- Customer-уведомления видны через user_id связку (customers.user_id = auth.uid())
DROP POLICY IF EXISTS "notifications_customer_own" ON notifications;
CREATE POLICY "notifications_customer_own" ON notifications
  FOR ALL USING (
    recipient_customer_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM customers c WHERE c.id = recipient_customer_id AND c.user_id = auth.uid())
  )
  WITH CHECK (
    recipient_customer_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM customers c WHERE c.id = recipient_customer_id AND c.user_id = auth.uid())
  );

-- ── Триггер 1: новая ДЗ → уведомление куратору группы ──────────────────────
CREATE OR REPLACE FUNCTION notify_homework_submitted() RETURNS trigger AS $$
DECLARE
  v_assignment record;
  v_lesson record;
  v_course record;
  v_product_id uuid;
  v_group_id uuid;
  v_curator record;
  v_customer record;
BEGIN
  -- Только при переходе в in_review (новая сдача или пере-сдача)
  IF NEW.status <> 'in_review' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'in_review' THEN RETURN NEW; END IF;

  SELECT a.id, a.title, a.lesson_id INTO v_assignment FROM lesson_assignments a WHERE a.id = NEW.assignment_id;
  IF v_assignment IS NULL THEN RETURN NEW; END IF;

  SELECT l.id, l.name, l.course_id, l.module_id INTO v_lesson FROM course_lessons l WHERE l.id = v_assignment.lesson_id;
  IF v_lesson IS NULL THEN RETURN NEW; END IF;

  SELECT c.id, c.name, c.project_id, c.product_id INTO v_course FROM courses c
    LEFT JOIN course_modules m ON m.id = v_lesson.module_id
    WHERE c.id = COALESCE(v_lesson.course_id, m.course_id);
  IF v_course IS NULL THEN RETURN NEW; END IF;
  v_product_id := v_course.product_id;

  -- Найти группу куратора для этого ученика и продукта
  IF v_product_id IS NOT NULL THEN
    SELECT pgm.group_id INTO v_group_id FROM product_group_members pgm
      WHERE pgm.product_id = v_product_id AND pgm.customer_id = NEW.customer_id LIMIT 1;
  END IF;

  SELECT cu.full_name INTO v_customer FROM customers cu WHERE cu.id = NEW.customer_id;

  -- Уведомления кураторам этой группы (или всем кураторам проекта если группы нет)
  IF v_group_id IS NOT NULL THEN
    FOR v_curator IN SELECT user_id FROM product_group_curators WHERE group_id = v_group_id
    LOOP
      INSERT INTO notifications (recipient_user_id, project_id, type, title, body, link, data)
      VALUES (
        v_curator.user_id, v_course.project_id, 'homework_submitted',
        'Новая домашка от ' || COALESCE(v_customer.full_name, 'студента'),
        v_assignment.title || ' · ' || v_lesson.name,
        '/project/' || v_course.project_id || '/learning/homework',
        jsonb_build_object('submission_id', NEW.id, 'course_id', v_course.id, 'lesson_id', v_lesson.id)
      );
    END LOOP;
  ELSE
    -- Fallback: уведомить всех с правом curator/admin/owner в проекте
    FOR v_curator IN
      SELECT pm.user_id FROM project_members pm
      JOIN roles r ON r.id = pm.role_id
      WHERE pm.project_id = v_course.project_id AND pm.status = 'active'
        AND r.code IN ('curator', 'admin', 'super_admin', 'owner')
    LOOP
      INSERT INTO notifications (recipient_user_id, project_id, type, title, body, link, data)
      VALUES (
        v_curator.user_id, v_course.project_id, 'homework_submitted',
        'Новая домашка от ' || COALESCE(v_customer.full_name, 'студента'),
        v_assignment.title || ' · ' || v_lesson.name,
        '/project/' || v_course.project_id || '/learning/homework',
        jsonb_build_object('submission_id', NEW.id, 'course_id', v_course.id, 'lesson_id', v_lesson.id)
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_homework_submitted ON assignment_submissions;
CREATE TRIGGER trg_notify_homework_submitted
  AFTER INSERT OR UPDATE OF status ON assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION notify_homework_submitted();

-- ── Триггер 2: статус ДЗ изменён куратором → уведомление ученику ───────────
CREATE OR REPLACE FUNCTION notify_homework_status_changed() RETURNS trigger AS $$
DECLARE
  v_assignment record;
  v_lesson record;
  v_course record;
  v_status_label text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN RETURN NEW; END IF;
  -- Уведомления только о терминальных или revision статусах
  IF NEW.status NOT IN ('accepted', 'needs_revision', 'rejected') THEN RETURN NEW; END IF;

  SELECT a.id, a.title, a.lesson_id INTO v_assignment FROM lesson_assignments a WHERE a.id = NEW.assignment_id;
  SELECT l.id, l.name, l.course_id, l.module_id INTO v_lesson FROM course_lessons l WHERE l.id = v_assignment.lesson_id;
  SELECT c.id, c.name, c.project_id INTO v_course FROM courses c
    LEFT JOIN course_modules m ON m.id = v_lesson.module_id
    WHERE c.id = COALESCE(v_lesson.course_id, m.course_id);

  v_status_label := CASE NEW.status
    WHEN 'accepted' THEN 'принята'
    WHEN 'needs_revision' THEN 'отправлена на доработку'
    WHEN 'rejected' THEN 'отклонена'
    ELSE NEW.status
  END;

  INSERT INTO notifications (recipient_customer_id, project_id, type, title, body, link, data)
  VALUES (
    NEW.customer_id, v_course.project_id, 'homework_status_changed',
    'Ваша домашка ' || v_status_label,
    v_assignment.title || ' · ' || v_lesson.name,
    '/learn/course/' || v_course.id || '/lesson/' || v_lesson.id,
    jsonb_build_object('submission_id', NEW.id, 'status', NEW.status)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_homework_status ON assignment_submissions;
CREATE TRIGGER trg_notify_homework_status
  AFTER UPDATE OF status ON assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION notify_homework_status_changed();

-- ── Триггер 3: сертификат выдан → уведомление ученику ──────────────────────
CREATE OR REPLACE FUNCTION notify_certificate_issued() RETURNS trigger AS $$
DECLARE
  v_course record;
BEGIN
  SELECT id, name, project_id INTO v_course FROM courses WHERE id = NEW.course_id;
  INSERT INTO notifications (recipient_customer_id, project_id, type, title, body, link, data)
  VALUES (
    NEW.customer_id, v_course.project_id, 'certificate_issued',
    '🎓 Сертификат выдан',
    'Поздравляем! Вы завершили курс «' || v_course.name || '»',
    '/certificate/' || NEW.certificate_number,
    jsonb_build_object('certificate_number', NEW.certificate_number)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_certificate ON course_certificates;
CREATE TRIGGER trg_notify_certificate
  AFTER INSERT ON course_certificates
  FOR EACH ROW EXECUTE FUNCTION notify_certificate_issued();
