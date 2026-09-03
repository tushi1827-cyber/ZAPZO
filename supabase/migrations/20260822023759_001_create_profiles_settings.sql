/*
# Create profiles and settings tables

## Overview
Creates the foundational tables for ZAPZO:
- `profiles` — user profile data linked to Supabase Auth, including referral codes and admin/suspend flags.
- `settings` — single-row application configuration (min withdrawal, referral reward, etc.).

## New Tables

### profiles
- `id` uuid PK — matches auth.users.id
- `name` text — display name
- `referral_code` text UNIQUE — unique per-user code (e.g. ZAPZO-X7K29)
- `referred_by` uuid — the referrer's profile id (nullable)
- `is_admin` boolean — admin flag (user-immutable via app_metadata)
- `is_suspended` boolean — suspend flag controlled by admin only
- `fraud_signals` int — count of suspicious-activity signals
- `created_at`, `updated_at` timestamps

### settings
- `id` int PK — always 1 (singleton)
- `min_withdrawal` numeric — minimum withdrawal amount
- `referral_reward` numeric — reward paid to referrer on qualification
- `site_name` text
- `updated_at` timestamp

## Security (RLS)
- profiles: users read/update own row only; admins read all (via is_admin_admin() function). No user-controlled admin/suspend columns.
- settings: anyone authenticated can read (needed for dashboard display); only admins can update.

## Notes
- `is_admin` is stored in profiles but the trusted source is auth.users.raw_app_meta_data.is_admin. The is_admin() SQL function reads raw_app_meta_data so it cannot be spoofed by a user editing their profile.
- We do NOT allow users to update is_admin / is_suspended / fraud_signals via the profiles UPDATE policy — those columns are excluded by a trigger that rejects non-admin changes to protected columns.
*/

-- Helper function: is the current user an admin?
-- Reads from auth.jwt() -> app_metadata -> is_admin (user-immutable).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean,
    false
  );
$$;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  referral_code text unique not null,
  referred_by uuid references public.profiles(id) on delete set null,
  is_admin boolean not null default false,
  is_suspended boolean not null default false,
  fraud_signals int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Admin-only update of any profile (suspend/activate, fraud)
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Protect admin-only columns from user edits.
create or replace function public.guard_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.is_admin is distinct from old.is_admin then
      raise exception 'Not allowed to change is_admin';
    end if;
    if new.is_suspended is distinct from old.is_suspended then
      raise exception 'Not allowed to change is_suspended';
    end if;
    if new.fraud_signals is distinct from old.fraud_signals then
      raise exception 'Not allowed to change fraud_signals';
    end if;
    if new.referral_code is distinct from old.referral_code then
      raise exception 'Not allowed to change referral_code';
    end if;
    if new.referred_by is distinct from old.referred_by then
      raise exception 'Not allowed to change referred_by';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_guard_profiles on public.profiles;
create trigger trg_guard_profiles
  before update on public.profiles
  for each row execute function public.guard_profile_columns();

-- ---------- settings ----------
create table if not exists public.settings (
  id int primary key default 1,
  min_withdrawal numeric not null default 5.00,
  referral_reward numeric not null default 1.00,
  site_name text not null default 'ZAPZO',
  updated_at timestamptz not null default now(),
  constraint settings_singleton check (id = 1)
);

alter table public.settings enable row level security;

drop policy if exists "settings_select_any_auth" on public.settings;
create policy "settings_select_any_auth"
  on public.settings for select
  to authenticated
  using (true);

drop policy if exists "settings_update_admin" on public.settings;
create policy "settings_update_admin"
  on public.settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Seed singleton settings row if missing.
insert into public.settings (id) values (1)
  on conflict (id) do nothing;
