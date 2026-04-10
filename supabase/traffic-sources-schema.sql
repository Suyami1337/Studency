-- =============================================
-- Traffic Sources (UTM-метки) + Tracking
-- =============================================

-- Источники трафика
create table if not exists public.traffic_sources (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  name text not null,           -- "Instagram Reels", "Telegram посты", "Meta Ads"
  slug text not null,           -- "ig-reels", "tg-posts" — уникальный в рамках проекта
  destination_url text not null, -- куда редиректить
  description text,
  click_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(project_id, slug)
);

create index idx_traffic_sources_project on public.traffic_sources(project_id);
create index idx_traffic_sources_slug on public.traffic_sources(slug);

-- События трекинга (клики по ссылкам)
create table if not exists public.tracking_events (
  id uuid default uuid_generate_v4() primary key,
  source_id uuid references public.traffic_sources(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete cascade not null,
  visitor_token text not null,  -- анонимный токен из cookie
  ip_hash text,                 -- хэш IP для дедупликации
  referrer text,                -- откуда пришёл запрос
  user_agent text,
  created_at timestamptz default now()
);

create index idx_tracking_events_source on public.tracking_events(source_id);
create index idx_tracking_events_project on public.tracking_events(project_id);
create index idx_tracking_events_visitor on public.tracking_events(visitor_token);
create index idx_tracking_events_created on public.tracking_events(created_at);

-- RLS
alter table public.traffic_sources enable row level security;
alter table public.tracking_events enable row level security;

create policy "Users can manage their project traffic sources"
  on public.traffic_sources for all
  using (
    project_id in (
      select id from public.projects where owner_id = auth.uid()
    )
  );

create policy "Users can view their project tracking events"
  on public.tracking_events for select
  using (
    project_id in (
      select id from public.projects where owner_id = auth.uid()
    )
  );

-- Публичная вставка tracking events (анонимные посетители)
create policy "Public tracking events insert"
  on public.tracking_events for insert
  with check (true);

-- Функция обновления updated_at
create or replace function update_traffic_sources_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_traffic_sources_updated_at
  before update on public.traffic_sources
  for each row execute function update_traffic_sources_updated_at();

-- Функция инкремента счётчика кликов (вызывается из /go/[slug])
create or replace function increment_source_clicks(source_id uuid)
returns void as $$
begin
  update public.traffic_sources
  set click_count = click_count + 1
  where id = source_id;
end;
$$ language plpgsql security definer;
