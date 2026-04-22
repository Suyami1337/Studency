-- =====================================================
-- Нормализация order_position у сообщений сценария
-- =====================================================
-- После создания/удаления через AI-агента позиции могут иметь дыры
-- (0,1,2,3,7,11 вместо 0,1,2,3,4,5). Функция пересчитывает последовательно.
-- Работает только на сообщениях основного пула (parent_trigger_group_id IS NULL),
-- триггерные сообщения имеют свою раскладку.

CREATE OR REPLACE FUNCTION normalize_scenario_message_positions(p_scenario_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY order_position, created_at) - 1 AS new_pos
    FROM scenario_messages
    WHERE scenario_id = p_scenario_id
      AND parent_trigger_group_id IS NULL
  )
  UPDATE scenario_messages m
  SET order_position = o.new_pos::int
  FROM ordered o
  WHERE m.id = o.id AND m.order_position <> o.new_pos::int;
END;
$$;
