-- TaskBoard Supabase Schema
-- Run this in your Supabase SQL editor to set up the database

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================
-- Users (synced with Google Auth)
-- ============================================
create table public.users (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  name text not null,
  initials text not null,
  color text not null default '#00BCD4',
  avatar_url text,
  created_at timestamptz default now()
);

-- ============================================
-- Projects
-- ============================================
create table public.projects (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  color text not null default '#00BCD4',
  created_by uuid references public.users(id),
  created_at timestamptz default now()
);

-- ============================================
-- Tasks
-- ============================================
create type task_status as enum ('backlog', 'doing', 'waiting', 'done');
create type task_source as enum ('app_chat', 'manual', 'whatsapp');

create table public.tasks (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  client text,
  assignee_id uuid references public.users(id) not null,
  project_id uuid references public.projects(id),
  status task_status not null default 'backlog',
  priority integer not null default 3 check (priority between 1 and 4),
  due_at timestamptz,
  checkin_target_id uuid references public.users(id),
  created_by_id uuid references public.users(id) not null,
  created_via task_source not null default 'manual',
  drive_links text[] default '{}',
  notes text[] default '{}',
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- Task Sections (structured brief sections)
-- ============================================
create table public.task_sections (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid references public.tasks(id) on delete cascade not null,
  heading text not null,
  content text not null default '',
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- ============================================
-- Task Updates (activity feed / check-in responses)
-- ============================================
create type update_source as enum ('user', 'bot', 'system');
create type status_signal as enum ('on_track', 'blocked', 'done');

create table public.task_updates (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid references public.tasks(id) on delete cascade not null,
  author_id uuid references public.users(id),
  source update_source not null default 'user',
  body text not null,
  status_signal status_signal,
  created_at timestamptz default now()
);

-- ============================================
-- Check-ins (scheduled follow-ups)
-- ============================================
create table public.checkins (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid references public.tasks(id) on delete cascade not null,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  responded_at timestamptz,
  response text,
  cancelled boolean default false,
  created_at timestamptz default now()
);

-- ============================================
-- Indexes
-- ============================================
create index idx_tasks_assignee on public.tasks(assignee_id);
create index idx_tasks_project on public.tasks(project_id);
create index idx_tasks_status on public.tasks(status);
create index idx_tasks_due on public.tasks(due_at);
create index idx_task_sections_task on public.task_sections(task_id);
create index idx_task_updates_task on public.task_updates(task_id);
create index idx_checkins_task on public.checkins(task_id);
create index idx_checkins_scheduled on public.checkins(scheduled_for) where not cancelled;

-- ============================================
-- Row Level Security (RLS)
-- ============================================
alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_sections enable row level security;
alter table public.task_updates enable row level security;
alter table public.checkins enable row level security;

-- Allow authenticated users to read everything (team app)
create policy "Authenticated users can read all" on public.users for select using (auth.role() = 'authenticated');
create policy "Authenticated users can read all" on public.projects for select using (auth.role() = 'authenticated');
create policy "Authenticated users can read all" on public.tasks for select using (auth.role() = 'authenticated');
create policy "Authenticated users can read all" on public.task_sections for select using (auth.role() = 'authenticated');
create policy "Authenticated users can read all" on public.task_updates for select using (auth.role() = 'authenticated');
create policy "Authenticated users can read all" on public.checkins for select using (auth.role() = 'authenticated');

-- Allow authenticated users to insert/update/delete (team app — everyone can manage tasks)
create policy "Authenticated users can insert" on public.tasks for insert with check (auth.role() = 'authenticated');
create policy "Authenticated users can update" on public.tasks for update using (auth.role() = 'authenticated');
create policy "Authenticated users can delete" on public.tasks for delete using (auth.role() = 'authenticated');

create policy "Authenticated users can insert" on public.task_sections for insert with check (auth.role() = 'authenticated');
create policy "Authenticated users can update" on public.task_sections for update using (auth.role() = 'authenticated');
create policy "Authenticated users can delete" on public.task_sections for delete using (auth.role() = 'authenticated');

create policy "Authenticated users can insert" on public.projects for insert with check (auth.role() = 'authenticated');
create policy "Authenticated users can update" on public.projects for update using (auth.role() = 'authenticated');

create policy "Authenticated users can insert" on public.task_updates for insert with check (auth.role() = 'authenticated');
create policy "Authenticated users can insert" on public.checkins for insert with check (auth.role() = 'authenticated');
create policy "Authenticated users can update" on public.checkins for update using (auth.role() = 'authenticated');

-- ============================================
-- Auto-update updated_at trigger
-- ============================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function update_updated_at();

-- ============================================
-- Realtime (enable for live updates)
-- ============================================
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.task_sections;
alter publication supabase_realtime add table public.projects;
