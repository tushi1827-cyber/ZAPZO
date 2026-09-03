/*
# Create tasks and task_submissions tables

## Overview
- `tasks` — reward tasks created by admins that users can complete.
- `task_submissions` — proof submissions by users for a task, with manual verification status.

## New Tables

### tasks
- `id` uuid PK
- `title`, `description`, `instructions` text
- `category` text (social, survey, website, app, learning, other)
- `reward` numeric — amount paid on approval (admin-controlled only)
- `max_completions` int — cap on approved submissions
- `approved_count` int — running count of approved submissions
- `verification_type` text (manual / automatic) — V1 = manual
- `status` text (draft, active, paused, completed, expired)
- `start_date`, `end_date` timestamptz
- `created_by` uuid — admin who created it
- `created_at`, `updated_at`

### task_submissions
- `id` uuid PK
- `task_id` uuid FK -> tasks
- `user_id` uuid FK -> auth.users (defaults to auth.uid())
- `proof_text` text — user-submitted proof
- `status` text (pending, approved, rejected)
- `rejection_reason` text
- `reward_amount` numeric — snapshot of reward at approval time (admin set)
- `reviewed_by` uuid — admin
- `reviewed_at` timestamptz
- `created_at`, `updated_at`
- Unique constraint on (task_id, user_id) to prevent duplicate submissions

## Security
- tasks: any authenticated user can SELECT active/published tasks (needed to browse). Admins can do all CRUD. Users never set reward.
- task_submissions: users can SELECT/INSERT their own; admins can SELECT all and UPDATE (review). Users cannot update after submit (no update policy for users).

## Notes
- A unique partial index enforces one submission per task per user.
- approved_count is maintained by a trigger on task_submissions so the frontend can never inflate it.
- reward_amount is set by the admin-approval function, never by the client.
*/

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  instructions text not null default '',
  category text not null default 'other',
  reward numeric not null default 0 check (reward >= 0),
  max_completions int not null default 100 check (max_completions >= 0),
  approved_count int not null default 0,
  verification_type text not null default 'manual' check (verification_type in ('manual','automatic')),
  status text not null default 'draft' check (status in ('draft','active','paused','completed','expired')),
  start_date timestamptz,
  end_date timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

-- Users can read non-draft tasks; admins can read all.
drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select"
  on public.tasks for select
  to authenticated
  using (status <> 'draft' or public.is_admin());

drop policy if exists "tasks_insert_admin" on public.tasks;
create policy "tasks_insert_admin"
  on public.tasks for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "tasks_update_admin" on public.tasks;
create policy "tasks_update_admin"
  on public.tasks for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "tasks_delete_admin" on public.tasks;
create policy "tasks_delete_admin"
  on public.tasks for delete
  to authenticated
  using (public.is_admin());

create index if not exists idx_tasks_status on public.tasks(status);
create index if not exists idx_tasks_category on public.tasks(category);

-- ---------- task_submissions ----------
create table if not exists public.task_submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  proof_text text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  rejection_reason text,
  reward_amount numeric not null default 0,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, user_id)
);

alter table public.task_submissions enable row level security;

drop policy if exists "submissions_select_own_or_admin" on public.task_submissions;
create policy "submissions_select_own_or_admin"
  on public.task_submissions for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "submissions_insert_own" on public.task_submissions;
create policy "submissions_insert_own"
  on public.task_submissions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "submissions_update_admin" on public.task_submissions;
create policy "submissions_update_admin"
  on public.task_submissions for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists idx_submissions_task on public.task_submissions(task_id);
create index if not exists idx_submissions_user on public.task_submissions(user_id);
create index if not exists idx_submissions_status on public.task_submissions(status);

-- Prevent users from editing submissions after insert (only admin updates).
create or replace function public.guard_submission_user_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Users cannot edit submissions after creating them';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_guard_submission on public.task_submissions;
create trigger trg_guard_submission
  before update on public.task_submissions
  for each row execute function public.guard_submission_user_edit();
