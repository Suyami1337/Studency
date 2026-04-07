-- =============================================
-- Studency Database Schema
-- Phase 2: Auth + Projects (core tables for ALL modules)
-- =============================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- =============================================
-- PROFILES (extends Supabase auth.users)
-- =============================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  phone text,
  telegram_id text,
  telegram_username text,
  instagram text,
  vk text,
  whatsapp text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================
-- PROJECTS
-- =============================================
create table public.projects (
  id uuid default uuid_generate_v4() primary key,
  owner_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  domain text,
  settings jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =============================================
-- PROJECT MEMBERS (roles per project)
-- =============================================
create type public.project_role as enum ('owner', 'admin', 'curator', 'client', 'user');

create table public.project_members (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role public.project_role default 'user' not null,
  is_blocked boolean default false,
  block_reason text,
  created_at timestamptz default now(),
  unique(project_id, user_id)
);

-- =============================================
-- Row Level Security
-- =============================================

-- Profiles: users can read/update own profile
alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Projects: owners and members can see their projects
alter table public.projects enable row level security;

create policy "Users can view own projects"
  on public.projects for select
  using (
    owner_id = auth.uid() or
    exists (
      select 1 from public.project_members
      where project_id = projects.id and user_id = auth.uid()
    )
  );

create policy "Users can create projects"
  on public.projects for insert
  with check (owner_id = auth.uid());

create policy "Owners can update projects"
  on public.projects for update
  using (owner_id = auth.uid());

create policy "Owners can delete projects"
  on public.projects for delete
  using (owner_id = auth.uid());

-- Project members: visible to project owners/admins
alter table public.project_members enable row level security;

create policy "Project members visible to members"
  on public.project_members for select
  using (
    exists (
      select 1 from public.project_members pm
      where pm.project_id = project_members.project_id
      and pm.user_id = auth.uid()
    )
  );

create policy "Owners can manage members"
  on public.project_members for all
  using (
    exists (
      select 1 from public.projects
      where id = project_members.project_id
      and owner_id = auth.uid()
    )
  );
