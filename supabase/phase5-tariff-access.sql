-- =============================================
-- Tariff access rules (что открывает тариф)
-- =============================================

create table public.tariff_access (
  id uuid default uuid_generate_v4() primary key,
  tariff_id uuid references public.tariffs(id) on delete cascade not null,
  -- Что открывает
  course_id uuid references public.courses(id) on delete cascade,
  module_id uuid references public.course_modules(id) on delete cascade,
  lesson_id uuid references public.course_lessons(id) on delete cascade,
  -- Срок доступа
  access_days integer, -- null = бессрочно
  created_at timestamptz default now()
);

create index idx_tariff_access_tariff on public.tariff_access(tariff_id);
create index idx_tariff_access_course on public.tariff_access(course_id);

-- RLS
alter table public.tariff_access enable row level security;
create policy "Project members can manage tariff access"
  on public.tariff_access for all
  using (exists (
    select 1 from public.tariffs t
    join public.products p on p.id = t.product_id
    where t.id = tariff_access.tariff_id
    and public.is_project_member(p.project_id)
  ));
