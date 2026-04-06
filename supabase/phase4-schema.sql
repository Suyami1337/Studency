-- =============================================
-- Phase 4: Chatbots (Telegram)
-- =============================================

-- =============================================
-- TELEGRAM BOT INTEGRATIONS (в настройках проекта)
-- =============================================
create table public.telegram_bots (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  name text not null,
  token text not null,
  bot_username text,
  is_active boolean default true,
  webhook_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_telegram_bots_project on public.telegram_bots(project_id);

-- =============================================
-- CHATBOT SCENARIOS (сценарии внутри раздела чат-боты)
-- =============================================
create type public.scenario_status as enum ('draft', 'active', 'paused');

create table public.chatbot_scenarios (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  telegram_bot_id uuid references public.telegram_bots(id) on delete set null,
  name text not null,
  description text,
  status public.scenario_status default 'draft',
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_scenarios_project on public.chatbot_scenarios(project_id);
create index idx_scenarios_bot on public.chatbot_scenarios(telegram_bot_id);

-- =============================================
-- SCENARIO STEPS (шаги сценария)
-- =============================================
create type public.step_type as enum ('message', 'button', 'delay', 'condition', 'action');

create table public.scenario_steps (
  id uuid default uuid_generate_v4() primary key,
  scenario_id uuid references public.chatbot_scenarios(id) on delete cascade not null,
  order_position integer not null default 0,
  step_type public.step_type default 'message',
  content text,
  delay_seconds integer default 0,
  condition_rule jsonb default '{}',
  button_text text,
  button_url text,
  created_at timestamptz default now()
);

create index idx_steps_scenario on public.scenario_steps(scenario_id);

-- =============================================
-- CHATBOT CONVERSATIONS (диалоги с пользователями)
-- =============================================
create table public.chatbot_conversations (
  id uuid default uuid_generate_v4() primary key,
  telegram_bot_id uuid references public.telegram_bots(id) on delete cascade not null,
  customer_id uuid references public.customers(id) on delete cascade,
  telegram_chat_id bigint not null,
  telegram_user_id bigint,
  telegram_username text,
  telegram_first_name text,
  current_scenario_id uuid references public.chatbot_scenarios(id) on delete set null,
  current_step_position integer default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(telegram_bot_id, telegram_chat_id)
);

create index idx_conversations_bot on public.chatbot_conversations(telegram_bot_id);
create index idx_conversations_customer on public.chatbot_conversations(customer_id);

-- =============================================
-- CHATBOT MESSAGES (история сообщений)
-- =============================================
create table public.chatbot_messages (
  id uuid default uuid_generate_v4() primary key,
  conversation_id uuid references public.chatbot_conversations(id) on delete cascade not null,
  direction text not null check (direction in ('incoming', 'outgoing')),
  content text,
  message_type text default 'text',
  telegram_message_id bigint,
  created_at timestamptz default now()
);

create index idx_messages_conversation on public.chatbot_messages(conversation_id);
create index idx_messages_created on public.chatbot_messages(created_at);

-- =============================================
-- BROADCASTS (рассылки)
-- =============================================
create type public.broadcast_status as enum ('draft', 'scheduled', 'sending', 'sent', 'cancelled');

create table public.broadcasts (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  telegram_bot_id uuid references public.telegram_bots(id) on delete cascade not null,
  name text not null,
  content text not null,
  status public.broadcast_status default 'draft',
  scheduled_at timestamptz,
  sent_at timestamptz,
  total_recipients integer default 0,
  delivered integer default 0,
  failed integer default 0,
  filter_tags text[] default '{}',
  created_at timestamptz default now()
);

create index idx_broadcasts_project on public.broadcasts(project_id);

-- =============================================
-- RLS POLICIES
-- =============================================

alter table public.telegram_bots enable row level security;
create policy "Project members can manage telegram bots"
  on public.telegram_bots for all
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

alter table public.chatbot_scenarios enable row level security;
create policy "Project members can manage scenarios"
  on public.chatbot_scenarios for all
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

alter table public.scenario_steps enable row level security;
create policy "Project members can manage steps"
  on public.scenario_steps for all
  using (exists (
    select 1 from public.chatbot_scenarios s
    where s.id = scenario_steps.scenario_id
    and public.is_project_member(s.project_id)
  ));

alter table public.chatbot_conversations enable row level security;
create policy "Project members can view conversations"
  on public.chatbot_conversations for all
  using (exists (
    select 1 from public.telegram_bots b
    where b.id = chatbot_conversations.telegram_bot_id
    and public.is_project_member(b.project_id)
  ));

alter table public.chatbot_messages enable row level security;
create policy "Project members can view messages"
  on public.chatbot_messages for all
  using (exists (
    select 1 from public.chatbot_conversations c
    join public.telegram_bots b on b.id = c.telegram_bot_id
    where c.id = chatbot_messages.conversation_id
    and public.is_project_member(b.project_id)
  ));

alter table public.broadcasts enable row level security;
create policy "Project members can manage broadcasts"
  on public.broadcasts for all
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));
