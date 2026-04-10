-- =============================================
-- CRM Tracking: связка cookie с карточкой клиента
-- =============================================

-- Добавляем поля трекинга в customers
alter table public.customers
  add column if not exists visitor_token text,         -- cookie stud_vid
  add column if not exists source_slug text,           -- "ig-reels"
  add column if not exists source_name text,           -- "Instagram Reels"
  add column if not exists source_id uuid references public.traffic_sources(id) on delete set null;

create index if not exists idx_customers_visitor_token on public.customers(visitor_token);
create index if not exists idx_customers_source_id on public.customers(source_id);

-- action_type уже включает 'landing_visit' из phase3, но добавим если не хватает
-- (безопасно если тип уже есть — просто пропустим)
