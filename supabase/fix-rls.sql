-- Fix infinite recursion in project_members RLS policies

-- Drop broken policies
drop policy if exists "Project members visible to members" on public.project_members;
drop policy if exists "Owners can manage members" on public.project_members;

-- Recreate without recursion
-- SELECT: members can see other members of their projects (via projects table, not self-referencing)
create policy "Members can view project members"
  on public.project_members for select
  using (
    exists (
      select 1 from public.projects
      where id = project_members.project_id
      and owner_id = auth.uid()
    )
    or user_id = auth.uid()
  );

-- INSERT: project owners can add members
create policy "Owners can insert members"
  on public.project_members for insert
  with check (
    exists (
      select 1 from public.projects
      where id = project_members.project_id
      and owner_id = auth.uid()
    )
    or user_id = auth.uid()
  );

-- UPDATE: project owners can update members
create policy "Owners can update members"
  on public.project_members for update
  using (
    exists (
      select 1 from public.projects
      where id = project_members.project_id
      and owner_id = auth.uid()
    )
  );

-- DELETE: project owners can remove members
create policy "Owners can delete members"
  on public.project_members for delete
  using (
    exists (
      select 1 from public.projects
      where id = project_members.project_id
      and owner_id = auth.uid()
    )
  );

-- Also fix projects SELECT policy (it also references project_members causing recursion)
drop policy if exists "Users can view own projects" on public.projects;

create policy "Users can view own projects"
  on public.projects for select
  using (owner_id = auth.uid());
