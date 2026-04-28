-- =====================================================================
-- Migration 55: customer_aggregates — добавить paid_orders_count и total_amount
-- =====================================================================
-- Раньше было:
--   orders_count — всего заказов
--   revenue — sum(paid_amount) только по статусу paid
-- Теперь добавляем:
--   paid_orders_count — count заказов со статусом paid
--   total_amount — sum(amount) по ВСЕМ заказам (сколько было выставлено)
-- =====================================================================

DROP VIEW IF EXISTS customer_aggregates;
CREATE VIEW customer_aggregates AS
SELECT
  c.id AS customer_id,
  c.project_id,
  GREATEST(
    c.created_at,
    COALESCE(
      (SELECT max(e.ts) FROM customer_timeline_events e WHERE e.customer_id = c.id),
      c.created_at
    )
  ) AS last_activity_at,
  -- всего заказов (любой статус)
  (SELECT count(*)::int FROM orders o WHERE o.customer_id = c.id) AS orders_count,
  -- оплаченных заказов
  (SELECT count(*)::int FROM orders o WHERE o.customer_id = c.id AND o.status::text = 'paid') AS paid_orders_count,
  -- сумма ВСЕХ выставленных заказов (amount)
  (SELECT COALESCE(sum(o.amount), 0)::int FROM orders o WHERE o.customer_id = c.id) AS total_amount,
  -- сумма ОПЛАЧЕННЫХ (paid_amount, статус = paid) — историческое имя revenue
  (SELECT COALESCE(sum(o.paid_amount), 0)::int FROM orders o WHERE o.customer_id = c.id AND o.status::text = 'paid') AS revenue,
  EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.status::text = 'paid') AS has_paid,
  EXISTS (SELECT 1 FROM customer_funnel_positions cfp WHERE cfp.customer_id = c.id) AS in_funnel
FROM customers c;
