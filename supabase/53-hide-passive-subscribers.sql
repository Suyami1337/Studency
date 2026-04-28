-- =====================================================================
-- Migration 53: Backfill — спрятать накопленных «пассивных подписчиков»
-- =====================================================================
-- До миграции 52 любая подписка на канал создавала customer с crm_visible=true
-- (по дефолту true для существующих). После 52 новые подписки приходят сразу
-- скрытыми, но накопившиеся ранее — всё ещё видимы.
--
-- Этот backfill переключает crm_visible=false у тех customer-ов, кто:
--   - НЕ имеет связки с auth.user (нет user_id)
--   - НЕ имеет контактов (email + phone оба null)
--   - НЕ имеет actionable активности:
--     * нет chatbot_conversation (не писал /start боту)
--     * нет landing_visit (не был на лендинге с UTM)
--     * нет lead_submission (не заполнял форму)
--     * нет orders (не покупал)
--
-- То есть: у клиента нет НИ контактов, НИ events, НИ регистрации в платформе.
-- Это «просто подписчик канала» — в CRM не нужен.
-- =====================================================================

UPDATE customers c
SET crm_visible = false
WHERE c.crm_visible = true
  AND c.user_id IS NULL
  AND c.email IS NULL
  AND c.phone IS NULL
  AND NOT EXISTS (SELECT 1 FROM chatbot_conversations cc WHERE cc.customer_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM landing_visits lv WHERE lv.customer_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM lead_submissions ls WHERE ls.customer_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);
