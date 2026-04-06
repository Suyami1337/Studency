-- =============================================
-- Phase 3: CRM + Funnels + Core Analytics
-- =============================================

-- =============================================
-- CUSTOMERS (единая карточка клиента)
-- =============================================
create table public.customers (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  email text,
  phone text,
  full_name text,
  telegram_id text,
  telegram_username text,
  instagram text,
  vk text,
  whatsapp text,
  tags text[] default '{}',
  notes text,
  is_blocked boolean default false,
  block_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(project_id, email)
);

create index idx_customers_project on public.customers(project_id);
create index idx_customers_email on public.customers(email);
create index idx_customers_telegram on public.customers(telegram_id);

-- =============================================
-- CUSTOMER ACTIONS (лог действий)
-- =============================================
create type public.action_type as enum (
  'bot_start', 'bot_message', 'bot_button_click',
  'landing_visit', 'landing_button_click',
  'video_watched', 'video_partial',
  'order_created', 'order_paid', 'order_refund',
  'lesson_started', 'lesson_completed', 'homework_submitted',
  'funnel_stage_entered', 'funnel_stage_exited',
  'tag_added', 'tag_removed',
  'note_added', 'manual_action'
);

create table public.customer_actions (
  id uuid default uuid_generate_v4() primary key,
  customer_id uuid references public.customers(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete cascade not null,
  action action_type not null,
  data jsonb default '{}',
  created_at timestamptz default now()
);

create index idx_actions_customer on public.customer_actions(customer_id);
create index idx_actions_project on public.customer_actions(project_id);
create index idx_actions_created on public.customer_actions(created_at);

-- =============================================
-- FUNNELS (воронки)
-- =============================================
create type public.funnel_status as enum ('draft', 'active', 'archived');

create table public.funnels (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  name text not null,
  description text,
  status public.funnel_status default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_funnels_project on public.funnels(project_id);

-- =============================================
-- FUNNEL STAGES (этапы воронки)
-- =============================================
create type public.stage_type as enum ('bot', 'landing', 'order', 'payment', 'learning', 'custom');

create table public.funnel_stages (
  id uuid default uuid_generate_v4() primary key,
  funnel_id uuid references public.funnels(id) on delete cascade not null,
  name text not null,
  stage_type public.stage_type default 'custom',
  order_position integer not null default 0,
  tool_id uuid, -- ссылка на конкретный бот/лендинг/курс (будет в будущих фазах)
  settings jsonb default '{}',
  created_at timestamptz default now()
);

create index idx_stages_funnel on public.funnel_stages(funnel_id);

-- =============================================
-- CUSTOMER FUNNEL POSITION (где клиент в воронке)
-- =============================================
create table public.customer_funnel_positions (
  id uuid default uuid_generate_v4() primary key,
  customer_id uuid references public.customers(id) on delete cascade not null,
  funnel_id uuid references public.funnels(id) on delete cascade not null,
  stage_id uuid references public.funnel_stages(id) on delete set null,
  entered_at timestamptz default now(),
  unique(customer_id, funnel_id)
);

create index idx_cfp_customer on public.customer_funnel_positions(customer_id);
create index idx_cfp_funnel on public.customer_funnel_positions(funnel_id);
create index idx_cfp_stage on public.customer_funnel_positions(stage_id);

-- =============================================
-- CRM BOARDS (CRM-доски)
-- =============================================
create table public.crm_boards (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  name text not null,
  funnel_id uuid references public.funnels(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_crm_boards_project on public.crm_boards(project_id);

-- =============================================
-- CRM BOARD STAGES (колонки CRM-доски)
-- =============================================
create table public.crm_board_stages (
  id uuid default uuid_generate_v4() primary key,
  board_id uuid references public.crm_boards(id) on delete cascade not null,
  name text not null,
  color text default '#94A3B8',
  order_position integer not null default 0,
  funnel_stage_id uuid references public.funnel_stages(id) on delete set null,
  created_at timestamptz default now()
);

create index idx_board_stages_board on public.crm_board_stages(board_id);

-- =============================================
-- CUSTOMER CRM POSITION (где клиент на CRM-доске)
-- =============================================
create table public.customer_crm_positions (
  id uuid default uuid_generate_v4() primary key,
  customer_id uuid references public.customers(id) on delete cascade not null,
  board_id uuid references public.crm_boards(id) on delete cascade not null,
  stage_id uuid references public.crm_board_stages(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(customer_id, board_id)
);

-- =============================================
-- CUSTOMER NOTES (заметки менеджеров)
-- =============================================
create table public.customer_notes (
  id uuid default uuid_generate_v4() primary key,
  customer_id uuid references public.customers(id) on delete cascade not null,
  author_id uuid references public.profiles(id) on delete set null,
  text text not null,
  created_at timestamptz default now()
);

create index idx_notes_customer on public.customer_notes(customer_id);

-- =============================================
-- RLS POLICIES
-- =============================================

-- Helper: check if user is project member
create or replace function public.is_project_member(p_project_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.projects
    where id = p_project_id and owner_id = auth.uid()
  ) or exists (
    select 1 from public.project_members
    where project_id = p_project_id and user_id = auth.uid()
  );
$$ language sql security definer stable;

-- Customers
alter table public.customers enable row level security;
create policy "Project members can manage customers"
  on public.customers for all
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

-- Customer actions
alter table public.customer_actions enable row level security;
create policy "Project members can manage actions"
  on public.customer_actions for all
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

-- Funnels
alter table public.funnels enable row level security;
create policy "Project members can manage funnels"
  on public.funnels for all
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

-- Funnel stages
alter table public.funnel_stages enable row level security;
create policy "Project members can manage funnel stages"
  on public.funnel_stages for all
  using (exists (
    select 1 from public.funnels f
    where f.id = funnel_stages.funnel_id
    and public.is_project_member(f.project_id)
  ));

-- Customer funnel positions
alter table public.customer_funnel_positions enable row level security;
create policy "Project members can manage funnel positions"
  on public.customer_funnel_positions for all
  using (exists (
    select 1 from public.funnels f
    where f.id = customer_funnel_positions.funnel_id
    and public.is_project_member(f.project_id)
  ));

-- CRM boards
alter table public.crm_boards enable row level security;
create policy "Project members can manage crm boards"
  on public.crm_boards for all
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

-- CRM board stages
alter table public.crm_board_stages enable row level security;
create policy "Project members can manage board stages"
  on public.crm_board_stages for all
  using (exists (
    select 1 from public.crm_boards b
    where b.id = crm_board_stages.board_id
    and public.is_project_member(b.project_id)
  ));

-- Customer CRM positions
alter table public.customer_crm_positions enable row level security;
create policy "Project members can manage crm positions"
  on public.customer_crm_positions for all
  using (exists (
    select 1 from public.crm_boards b
    where b.id = customer_crm_positions.board_id
    and public.is_project_member(b.project_id)
  ));

-- Customer notes
alter table public.customer_notes enable row level security;
create policy "Project members can manage notes"
  on public.customer_notes for all
  using (exists (
    select 1 from public.customers c
    where c.id = customer_notes.customer_id
    and public.is_project_member(c.project_id)
  ));
