-- =============================================
-- Block 2 Fix: недостающие enum values + индексы
-- =============================================

-- Добавляем недостающие типы действий в enum action_type
-- (INSERT через customer_actions с этими значениями молча падал)
ALTER TYPE public.action_type ADD VALUE IF NOT EXISTS 'form_submit';
ALTER TYPE public.action_type ADD VALUE IF NOT EXISTS 'button_click';
ALTER TYPE public.action_type ADD VALUE IF NOT EXISTS 'link_click';
ALTER TYPE public.action_type ADD VALUE IF NOT EXISTS 'page_view';
ALTER TYPE public.action_type ADD VALUE IF NOT EXISTS 'source_linked';
