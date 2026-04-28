-- ============================================================================
-- 57-certificate-trigger.sql
-- Phase 7.10 — Авто-выдача сертификата при сдаче экзамена
--
-- Когда ученик отмечает урок-экзамен (is_exam=true) как завершённый
-- (completed_at IS NOT NULL), и у курса включён certificate_enabled —
-- автоматически создаётся course_certificates запись.
-- Авто-номер генерится через trigger из миграции 56.
-- ============================================================================

CREATE OR REPLACE FUNCTION issue_certificate_on_exam_complete() RETURNS trigger AS $$
DECLARE
  v_lesson record;
  v_course record;
  v_student record;
BEGIN
  -- Выдаём только при первом completed_at
  IF NEW.completed_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.completed_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT id, course_id, module_id, is_exam INTO v_lesson FROM course_lessons WHERE id = NEW.lesson_id;
  IF v_lesson IS NULL OR v_lesson.is_exam = false THEN RETURN NEW; END IF;

  -- Найти курс через course_id или через модуль
  SELECT c.id, c.name, c.certificate_enabled INTO v_course FROM courses c
    LEFT JOIN course_modules m ON m.id = v_lesson.module_id
    WHERE c.id = COALESCE(v_lesson.course_id, m.course_id);
  IF v_course IS NULL OR v_course.certificate_enabled = false THEN RETURN NEW; END IF;

  -- Идемпотентность: не создаём дубликат
  IF EXISTS (SELECT 1 FROM course_certificates WHERE course_id = v_course.id AND customer_id = NEW.customer_id) THEN
    RETURN NEW;
  END IF;

  SELECT cu.full_name INTO v_student FROM customers cu WHERE cu.id = NEW.customer_id;

  INSERT INTO course_certificates (course_id, customer_id, student_name_snapshot, course_name_snapshot)
  VALUES (v_course.id, NEW.customer_id, COALESCE(v_student.full_name, 'Студент'), v_course.name);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_issue_certificate ON lesson_progress;
CREATE TRIGGER trg_issue_certificate
  AFTER INSERT OR UPDATE OF completed_at ON lesson_progress
  FOR EACH ROW EXECUTE FUNCTION issue_certificate_on_exam_complete();
