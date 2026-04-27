-- =====================================================================
-- Migration 45: Перекройка RLS на проверку через project_members
-- =====================================================================
-- Заменяем старый паттерн RLS:
--   project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
-- на:
--   is_project_member(project_id)
--
-- После миграции 44 владелец гарантированно имеет запись в project_members
-- с ролью owner (через триггер seed_project_roles_and_owner и backfill),
-- так что переход безопасен.
--
-- Decision doc: knowledge/decisions/roles-and-access-architecture-2026-04-27
-- Phase: 6.2 RLS-перекройка
-- =====================================================================


-- =====================================================================
-- BLOCK A: обновить функцию is_project_member (одно-аргументная версия)
-- =====================================================================
-- Старая версия проверяла projects.owner_id ИЛИ project_members без status.
-- Новая версия проверяет только project_members со status='active'.
-- Owner-проверка не нужна — после backfill владелец уже в project_members.

CREATE OR REPLACE FUNCTION is_project_member(p_project_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;


-- =====================================================================
-- BLOCK B: PROJECTS table — основные политики
-- =====================================================================
-- SELECT: видит любой член проекта (включая владельца через project_members)
-- UPDATE: только с permission settings.project.edit
-- DELETE: только с permission danger.delete_project
-- INSERT: только если can_create_projects=TRUE в users_meta
-- =====================================================================

DROP POLICY IF EXISTS "Users can view own projects" ON projects;
CREATE POLICY "Members can view their projects" ON projects
  FOR SELECT USING (is_project_member(id));

DROP POLICY IF EXISTS "Owners can update projects" ON projects;
CREATE POLICY "Members with permission can update projects" ON projects
  FOR UPDATE USING (
    has_permission(id, auth.uid(), 'settings.project.edit')
  );

DROP POLICY IF EXISTS "Owners can delete projects" ON projects;
CREATE POLICY "Members with danger permission can delete projects" ON projects
  FOR DELETE USING (
    has_permission(id, auth.uid(), 'danger.delete_project')
  );

DROP POLICY IF EXISTS "Users can create projects" ON projects;
CREATE POLICY "Users with can_create_projects can insert projects" ON projects
  FOR INSERT WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM users_meta
      WHERE user_id = auth.uid() AND can_create_projects = TRUE
    )
  );


-- =====================================================================
-- BLOCK C: ТАБЛИЦЫ С ПРЯМЫМ project_id
-- =====================================================================

-- C.1 customer_custom_fields
DROP POLICY IF EXISTS "Users manage their custom fields" ON customer_custom_fields;
CREATE POLICY "Members manage custom fields" ON customer_custom_fields
  FOR ALL USING (is_project_member(project_id));

-- C.2 customer_notes
DROP POLICY IF EXISTS "Users manage their customer notes" ON customer_notes;
CREATE POLICY "Members manage customer notes" ON customer_notes
  FOR ALL USING (is_project_member(project_id));

-- C.3 customer_segments — уже была переименована, но qual старый. Пересоздаём.
DROP POLICY IF EXISTS "Project members manage segments" ON customer_segments;
CREATE POLICY "Project members manage segments" ON customer_segments
  FOR ALL USING (is_project_member(project_id));

-- C.4 customer_touchpoints
DROP POLICY IF EXISTS "Project members read touchpoints" ON customer_touchpoints;
CREATE POLICY "Project members read touchpoints" ON customer_touchpoints
  FOR ALL USING (is_project_member(project_id));

-- C.5 email_unsubscribes
DROP POLICY IF EXISTS "Users see their unsubscribes" ON email_unsubscribes;
CREATE POLICY "Members see unsubscribes" ON email_unsubscribes
  FOR SELECT USING (is_project_member(project_id));

-- C.6 events
DROP POLICY IF EXISTS "Users see their project events" ON events;
CREATE POLICY "Members see project events" ON events
  FOR SELECT USING (is_project_member(project_id));

-- C.7 broadcasts
DROP POLICY IF EXISTS "Users manage their broadcasts" ON broadcasts;
CREATE POLICY "Members manage broadcasts (legacy)" ON broadcasts
  FOR ALL USING (is_project_member(project_id));

-- C.8 scheduled_triggers (две политики)
DROP POLICY IF EXISTS "Users manage their project scheduled triggers" ON scheduled_triggers;
DROP POLICY IF EXISTS "Users see their project scheduled triggers" ON scheduled_triggers;
CREATE POLICY "Members manage scheduled triggers" ON scheduled_triggers
  FOR ALL USING (is_project_member(project_id));

-- C.9 social_accounts
DROP POLICY IF EXISTS "Users see their project social_accounts" ON social_accounts;
CREATE POLICY "Members manage social_accounts" ON social_accounts
  FOR ALL USING (is_project_member(project_id));

-- C.10 social_mtproto_login_flows
DROP POLICY IF EXISTS "Users see their project mtproto flows" ON social_mtproto_login_flows;
CREATE POLICY "Members manage mtproto flows" ON social_mtproto_login_flows
  FOR ALL USING (is_project_member(project_id));

-- C.11 tracking_events
DROP POLICY IF EXISTS "Users can view their project tracking events" ON tracking_events;
CREATE POLICY "Members view tracking events" ON tracking_events
  FOR SELECT USING (is_project_member(project_id));

-- C.12 traffic_sources
DROP POLICY IF EXISTS "Users can manage their project traffic sources" ON traffic_sources;
CREATE POLICY "Members manage traffic sources" ON traffic_sources
  FOR ALL USING (is_project_member(project_id));

-- C.13 usage_events
DROP POLICY IF EXISTS "Users see their usage" ON usage_events;
CREATE POLICY "Members see usage events" ON usage_events
  FOR SELECT USING (is_project_member(project_id));

-- C.14 video_views
DROP POLICY IF EXISTS "Users see their project views" ON video_views;
CREATE POLICY "Members see video views" ON video_views
  FOR SELECT USING (is_project_member(project_id));

-- C.15 videos (3 политики: SELECT, UPDATE, DELETE, INSERT)
DROP POLICY IF EXISTS "Users see their project videos" ON videos;
DROP POLICY IF EXISTS "Users update their project videos" ON videos;
DROP POLICY IF EXISTS "Users delete their project videos" ON videos;
DROP POLICY IF EXISTS "Users insert to their projects" ON videos;
CREATE POLICY "Members see videos" ON videos
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "Members update videos" ON videos
  FOR UPDATE USING (is_project_member(project_id));
CREATE POLICY "Members delete videos" ON videos
  FOR DELETE USING (is_project_member(project_id));
CREATE POLICY "Members insert videos" ON videos
  FOR INSERT WITH CHECK (is_project_member(project_id));

-- C.16 media_library (4 политики)
DROP POLICY IF EXISTS "Users can view media from their projects" ON media_library;
DROP POLICY IF EXISTS "Users can insert media to their projects" ON media_library;
DROP POLICY IF EXISTS "Users can delete media from their projects" ON media_library;
CREATE POLICY "Members view media_library" ON media_library
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "Members insert media_library" ON media_library
  FOR INSERT WITH CHECK (is_project_member(project_id));
CREATE POLICY "Members delete media_library" ON media_library
  FOR DELETE USING (is_project_member(project_id));


-- =====================================================================
-- BLOCK D: ТАБЛИЦЫ С НЕПРЯМОЙ СВЯЗЬЮ (через FK)
-- =====================================================================

-- D.1 broadcast_deliveries (через broadcast_id)
DROP POLICY IF EXISTS "Users see their deliveries" ON broadcast_deliveries;
CREATE POLICY "Members see deliveries" ON broadcast_deliveries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM broadcasts b
      WHERE b.id = broadcast_deliveries.broadcast_id
        AND is_project_member(b.project_id)
    )
  );

-- D.2 customer_field_values (через customer_id)
DROP POLICY IF EXISTS "Users manage their field values" ON customer_field_values;
CREATE POLICY "Members manage field values" ON customer_field_values
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = customer_field_values.customer_id
        AND is_project_member(c.project_id)
    )
  );

-- D.3 crm_movement_log (через board_id → crm_boards.project_id)
DROP POLICY IF EXISTS "Users see their movement logs" ON crm_movement_log;
CREATE POLICY "Members see movement logs" ON crm_movement_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM crm_boards b
      WHERE b.id = crm_movement_log.board_id
        AND is_project_member(b.project_id)
    )
  );

-- D.4 crm_stage_rule_fired (через customer_id → customers.project_id)
DROP POLICY IF EXISTS "Users see their fired rules" ON crm_stage_rule_fired;
CREATE POLICY "Members see fired rules" ON crm_stage_rule_fired
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = crm_stage_rule_fired.customer_id
        AND is_project_member(c.project_id)
    )
  );

-- D.5 crm_stage_rules (через stage_id → crm_board_stages → crm_boards.project_id)
DROP POLICY IF EXISTS "Users manage their stage rules" ON crm_stage_rules;
CREATE POLICY "Members manage stage rules" ON crm_stage_rules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM crm_board_stages s
      JOIN crm_boards b ON s.board_id = b.id
      WHERE s.id = crm_stage_rules.stage_id
        AND is_project_member(b.project_id)
    )
  );

-- D.6 landing_blocks (через landing_id → landings.project_id)
DROP POLICY IF EXISTS "landing_blocks_read" ON landing_blocks;
DROP POLICY IF EXISTS "landing_blocks_write" ON landing_blocks;
CREATE POLICY "Members read landing_blocks" ON landing_blocks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM landings l
      WHERE l.id = landing_blocks.landing_id
        AND is_project_member(l.project_id)
    )
  );
CREATE POLICY "Members write landing_blocks" ON landing_blocks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM landings l
      WHERE l.id = landing_blocks.landing_id
        AND is_project_member(l.project_id)
    )
  );

-- D.7 media_usages (через media_id → media_library.project_id)
DROP POLICY IF EXISTS "Users can view their usages" ON media_usages;
DROP POLICY IF EXISTS "Users can insert their usages" ON media_usages;
DROP POLICY IF EXISTS "Users can delete their usages" ON media_usages;
CREATE POLICY "Members view media_usages" ON media_usages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM media_library m
      WHERE m.id = media_usages.media_id
        AND is_project_member(m.project_id)
    )
  );
CREATE POLICY "Members insert media_usages" ON media_usages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM media_library m
      WHERE m.id = media_usages.media_id
        AND is_project_member(m.project_id)
    )
  );
CREATE POLICY "Members delete media_usages" ON media_usages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM media_library m
      WHERE m.id = media_usages.media_id
        AND is_project_member(m.project_id)
    )
  );

-- D.8 scenario_event_triggers (через scenario_id → chatbot_scenarios → telegram_bots.project_id)
DROP POLICY IF EXISTS "Users manage their project triggers" ON scenario_event_triggers;
DROP POLICY IF EXISTS "Users see their project triggers" ON scenario_event_triggers;
CREATE POLICY "Members manage scenario triggers" ON scenario_event_triggers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM chatbot_scenarios s
      JOIN telegram_bots tb ON s.telegram_bot_id = tb.id
      WHERE s.id = scenario_event_triggers.scenario_id
        AND is_project_member(tb.project_id)
    )
  );

-- D.9 social_content_items (через account_id → social_accounts.project_id)
DROP POLICY IF EXISTS "Users see their project social_content" ON social_content_items;
CREATE POLICY "Members manage social_content" ON social_content_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM social_accounts sa
      WHERE sa.id = social_content_items.account_id
        AND is_project_member(sa.project_id)
    )
  );

-- D.10 social_subscribers_log (через account_id)
DROP POLICY IF EXISTS "Users see their project social_subs_log" ON social_subscribers_log;
CREATE POLICY "Members see subscribers_log" ON social_subscribers_log
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM social_accounts sa
      WHERE sa.id = social_subscribers_log.account_id
        AND is_project_member(sa.project_id)
    )
  );

-- D.11 social_subscribers_snapshots (через account_id)
DROP POLICY IF EXISTS "Users see their project social_subs_snap" ON social_subscribers_snapshots;
CREATE POLICY "Members see subscribers_snapshots" ON social_subscribers_snapshots
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM social_accounts sa
      WHERE sa.id = social_subscribers_snapshots.account_id
        AND is_project_member(sa.project_id)
    )
  );


-- =====================================================================
-- DONE
-- =====================================================================
-- После применения:
-- - Все политики читают через is_project_member() (без owner_id вложенного)
-- - projects.SELECT — через is_project_member(id) (любой член видит)
-- - projects.UPDATE — has_permission(settings.project.edit)
-- - projects.DELETE — has_permission(danger.delete_project)
-- - projects.INSERT — только при can_create_projects=TRUE в users_meta
--
-- Все остальные политики (CRM, чат-боты, сайты, обучение и пр.) уже были
-- переписаны раньше через is_project_member(uuid). Они продолжают работать
-- без изменений с обновлённой версией функции (status='active').
-- =====================================================================
