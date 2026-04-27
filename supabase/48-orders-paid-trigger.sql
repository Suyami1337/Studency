-- =====================================================================
-- Migration 48: Триггер автовыдачи доступа при переходе orders.status -> paid
-- =====================================================================
-- Срабатывает когда заказ помечается оплаченным:
--   - через Prodamus webhook (резервный путь — webhook уже вызывает RPC)
--   - вручную в UI заказов (менеджер изменил статус)
--   - через создание заказа со status=paid (free grant)
--
-- grant_tariff_access идемпотентен — если у customer уже есть active
-- доступ к этому tariff, возвращает его id без дубликата.
-- =====================================================================

CREATE OR REPLACE FUNCTION trg_grant_access_on_order_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Стартует только при переходе в paid (или сразу при INSERT с paid)
  IF NEW.status = 'paid'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid')
     AND NEW.tariff_id IS NOT NULL
     AND NEW.customer_id IS NOT NULL
  THEN
    PERFORM grant_tariff_access(
      NEW.project_id,
      NEW.customer_id,
      NEW.tariff_id,
      'order'::text,
      NEW.id,
      NULL,
      'Автовыдача при переходе заказа в paid'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_grant_access ON orders;
CREATE TRIGGER trg_orders_grant_access
  AFTER INSERT OR UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trg_grant_access_on_order_paid();
