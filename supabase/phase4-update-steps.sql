-- =============================================
-- Phase 4 Update: Richer scenario messages
-- =============================================

-- Drop old scenario_steps and recreate with better structure
drop table if exists public.scenario_steps cascade;

-- SCENARIO MESSAGES (каждое сообщение — полноценная карточка)
create table public.scenario_messages (
  id uuid default uuid_generate_v4() primary key,
  scenario_id uuid references public.chatbot_scenarios(id) on delete cascade not null,
  order_position integer not null default 0,

  -- Content
  text text,

  -- Type
  is_start boolean default false,
  trigger_word text, -- /start, привет, кодовое слово
  is_followup boolean default false, -- дожим

  -- Timing
  delay_minutes integer default 0, -- задержка перед отправкой (0 = сразу)
  followup_condition text, -- 'no_action' / 'no_button_click' / custom

  -- Links
  next_message_id uuid references public.scenario_messages(id) on delete set null,
  parent_message_id uuid references public.scenario_messages(id) on delete set null, -- для дожимов: от какого сообщения

  created_at timestamptz default now()
);

create index idx_scenario_msgs_scenario on public.scenario_messages(scenario_id);
create index idx_scenario_msgs_trigger on public.scenario_messages(trigger_word);

-- SCENARIO BUTTONS (кнопки внутри сообщения)
create table public.scenario_buttons (
  id uuid default uuid_generate_v4() primary key,
  message_id uuid references public.scenario_messages(id) on delete cascade not null,
  order_position integer not null default 0,
  text text not null,

  -- Action
  action_type text not null default 'url', -- 'url' / 'trigger' / 'goto_message'
  action_url text,
  action_trigger_word text,
  action_goto_message_id uuid references public.scenario_messages(id) on delete set null,

  created_at timestamptz default now()
);

create index idx_buttons_message on public.scenario_buttons(message_id);

-- RLS
alter table public.scenario_messages enable row level security;
create policy "Project members can manage scenario messages"
  on public.scenario_messages for all
  using (exists (
    select 1 from public.chatbot_scenarios s
    where s.id = scenario_messages.scenario_id
    and public.is_project_member(s.project_id)
  ));

alter table public.scenario_buttons enable row level security;
create policy "Project members can manage buttons"
  on public.scenario_buttons for all
  using (exists (
    select 1 from public.scenario_messages m
    join public.chatbot_scenarios s on s.id = m.scenario_id
    where m.id = scenario_buttons.message_id
    and public.is_project_member(s.project_id)
  ));
