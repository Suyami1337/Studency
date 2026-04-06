-- =============================================
-- Phase 6: Landings (сайты/лендинги)
-- =============================================

-- LANDINGS (сайты)
create type public.landing_status as enum ('draft', 'published', 'archived');

create table public.landings (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  name text not null,
  slug text,
  html_content text default '',
  status public.landing_status default 'draft',
  meta_title text,
  meta_description text,
  visits integer default 0,
  conversions integer default 0,
  funnel_id uuid references public.funnels(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_landings_project on public.landings(project_id);
create index idx_landings_slug on public.landings(slug);

-- LANDING BUTTONS (для отслеживания конверсий по кнопкам)
create table public.landing_buttons (
  id uuid default uuid_generate_v4() primary key,
  landing_id uuid references public.landings(id) on delete cascade not null,
  name text not null,
  clicks integer default 0,
  conversions integer default 0,
  created_at timestamptz default now()
);

create index idx_landing_buttons_landing on public.landing_buttons(landing_id);

-- LANDING VISITS (лог посещений)
create table public.landing_visits (
  id uuid default uuid_generate_v4() primary key,
  landing_id uuid references public.landings(id) on delete cascade not null,
  customer_id uuid references public.customers(id) on delete set null,
  visitor_id text, -- для незарегистрированных
  ip_address text,
  user_agent text,
  referrer text,
  created_at timestamptz default now()
);

create index idx_landing_visits_landing on public.landing_visits(landing_id);
create index idx_landing_visits_created on public.landing_visits(created_at);

-- RLS
alter table public.landings enable row level security;
create policy "Project members can manage landings"
  on public.landings for all
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

alter table public.landing_buttons enable row level security;
create policy "Project members can manage landing buttons"
  on public.landing_buttons for all
  using (exists (
    select 1 from public.landings l
    where l.id = landing_buttons.landing_id
    and public.is_project_member(l.project_id)
  ));

alter table public.landing_visits enable row level security;
create policy "Project members can manage landing visits"
  on public.landing_visits for all
  using (exists (
    select 1 from public.landings l
    where l.id = landing_visits.landing_id
    and public.is_project_member(l.project_id)
  ));
