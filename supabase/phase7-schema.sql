-- =============================================
-- Phase 7: Learning Platform
-- =============================================

-- COURSES
create table public.courses (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  name text not null,
  description text,
  is_published boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_courses_project on public.courses(project_id);

-- COURSE MODULES
create table public.course_modules (
  id uuid default uuid_generate_v4() primary key,
  course_id uuid references public.courses(id) on delete cascade not null,
  name text not null,
  order_position integer default 0,
  created_at timestamptz default now()
);

create index idx_modules_course on public.course_modules(course_id);

-- COURSE LESSONS
create table public.course_lessons (
  id uuid default uuid_generate_v4() primary key,
  module_id uuid references public.course_modules(id) on delete cascade not null,
  name text not null,
  content text default '',
  video_url text,
  has_homework boolean default false,
  homework_description text,
  order_position integer default 0,
  created_at timestamptz default now()
);

create index idx_lessons_module on public.course_lessons(module_id);

-- STUDENT PROGRESS
create table public.student_progress (
  id uuid default uuid_generate_v4() primary key,
  customer_id uuid references public.customers(id) on delete cascade not null,
  lesson_id uuid references public.course_lessons(id) on delete cascade not null,
  completed boolean default false,
  homework_submitted boolean default false,
  homework_text text,
  completed_at timestamptz,
  created_at timestamptz default now(),
  unique(customer_id, lesson_id)
);

create index idx_progress_customer on public.student_progress(customer_id);
create index idx_progress_lesson on public.student_progress(lesson_id);

-- RLS
alter table public.courses enable row level security;
create policy "Project members can manage courses"
  on public.courses for all
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

alter table public.course_modules enable row level security;
create policy "Project members can manage modules"
  on public.course_modules for all
  using (exists (
    select 1 from public.courses c
    where c.id = course_modules.course_id
    and public.is_project_member(c.project_id)
  ));

alter table public.course_lessons enable row level security;
create policy "Project members can manage lessons"
  on public.course_lessons for all
  using (exists (
    select 1 from public.course_modules m
    join public.courses c on c.id = m.course_id
    where m.id = course_lessons.module_id
    and public.is_project_member(c.project_id)
  ));

alter table public.student_progress enable row level security;
create policy "Project members can manage progress"
  on public.student_progress for all
  using (exists (
    select 1 from public.course_lessons l
    join public.course_modules m on m.id = l.module_id
    join public.courses c on c.id = m.course_id
    where l.id = student_progress.lesson_id
    and public.is_project_member(c.project_id)
  ));
