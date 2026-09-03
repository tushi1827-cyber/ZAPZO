/*
# Create referrals, wallet_transactions, withdrawals, audit_logs tables

## Overview
- `referrals` — records referral relationships and qualification status.
- `wallet_transactions` — immutable ledger of all balance changes (append-only for users).
- `withdrawals` — user withdrawal requests with admin-review status.
- `audit_logs` — admin action audit trail.

## New Tables

### referrals
- `id` uuid PK
- `referrer_id` uuid FK -> profiles
- `referred_id` uuid FK -> profiles (unique — one referral record per referred user)
- `referral_code` text — the code used at signup
- `status` text (pending, qualified, reversed)
- `qualified_at` timestamptz
- `reward_amount` numeric — snapshot of reward at qualification
- `created_at`
- Unique on referred_id prevents duplicate referral records and self-referral loops.

### wallet_transactions
- `id` uuid PK
- `user_id` uuid FK -> auth.users (default auth.uid())
- `type` text (task_reward, referral_reward, bonus, adjustment, withdrawal, withdrawal_reversal)
- `amount` numeric — positive = credit, negative = debit
- `status` text (pending, completed, reversed)
- `reference_id` uuid — optional link to submission/referral/withdrawal
- `description` text
- `created_at`
- Append-only for users: no UPDATE/DELETE policy for users. Admins can insert adjustments.

### withdrawals
- `id` uuid PK
- `user_id` uuid FK
- `amount` numeric (positive)
- `method` text (upi, bank_transfer)
- `payout_details` text
- `status` text (pending, processing, approved, rejected, paid)
- `reviewed_by` uuid
- `reviewed_at` timestamptz
- `rejection_reason` text
- `created_at`, `updated_at`

### audit_logs
- `id` uuid PK
- `actor_id` uuid — admin user id
- `action` text
- `target_type` text
- `target_id` uuid
- `details` jsonb
- `created_at`
- Admin-only read; admin-only write (via function).

## Security
- referrals: users read own (as referrer or referred); admins read all. Users never insert/update directly — handled by server functions.
- wallet_transactions: users read own; admin read all; users never insert/update/delete — all via SECURITY DEFINER functions.
- withdrawals: users read own + insert own (request); admins read all + update (review). A trigger prevents duplicate pending withdrawals.
- audit_logs: admin read + admin insert via function.

## Fraud protection
- `referrals` unique on referred_id prevents self-referral and duplicate referral records.
- A trigger on withdrawals prevents a user from having two non-terminal withdrawals.
- All money-moving operations are in SECURITY DEFINER functions (next migration).
*/

-- ---------- referrals ----------
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_id uuid not null references public.profiles(id) on delete cascade,
  referral_code text not null,
  status text not null default 'pending' check (status in ('pending','qualified','reversed')),
  qualified_at timestamptz,
  reward_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (referred_id),
  check (referrer_id <> referred_id)
);

alter table public.referrals enable row level security;

drop policy if exists "referrals_select_own_or_admin" on public.referrals;
create policy "referrals_select_own_or_admin"
  on public.referrals for select
  to authenticated
  using (auth.uid() = referrer_id or auth.uid() = referred_id or public.is_admin());

drop policy if exists "referrals_update_admin" on public.referrals;
create policy "referrals_update_admin"
  on public.referrals for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists idx_referrals_referrer on public.referrals(referrer_id);

-- ---------- wallet_transactions ----------
create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('task_reward','referral_reward','bonus','adjustment','withdrawal','withdrawal_reversal')),
  amount numeric not null,
  status text not null default 'completed' check (status in ('pending','completed','reversed')),
  reference_id uuid,
  description text not null default '',
  created_at timestamptz not null default now()
);

alter table public.wallet_transactions enable row level security;

drop policy if exists "wallet_select_own_or_admin" on public.wallet_transactions;
create policy "wallet_select_own_or_admin"
  on public.wallet_transactions for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

-- Users CANNOT insert/update/delete wallet transactions directly.
-- Only SECURITY DEFINER functions (admin actions / approval flow) write here.
drop policy if exists "wallet_insert_admin" on public.wallet_transactions;
create policy "wallet_insert_admin"
  on public.wallet_transactions for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "wallet_update_admin" on public.wallet_transactions;
create policy "wallet_update_admin"
  on public.wallet_transactions for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists idx_wallet_user on public.wallet_transactions(user_id);
create index if not exists idx_wallet_type on public.wallet_transactions(type);
create index if not exists idx_wallet_reference on public.wallet_transactions(reference_id);

-- ---------- withdrawals ----------
create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  amount numeric not null check (amount > 0),
  method text not null check (method in ('upi','bank_transfer')),
  payout_details text not null default '',
  status text not null default 'pending' check (status in ('pending','processing','approved','rejected','paid')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.withdrawals enable row level security;

drop policy if exists "wd_select_own_or_admin" on public.withdrawals;
create policy "wd_select_own_or_admin"
  on public.withdrawals for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "wd_insert_own" on public.withdrawals;
create policy "wd_insert_own"
  on public.withdrawals for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "wd_update_admin" on public.withdrawals;
create policy "wd_update_admin"
  on public.withdrawals for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists idx_wd_user on public.withdrawals(user_id);
create index if not exists idx_wd_status on public.withdrawals(status);

-- Prevent duplicate pending/processing withdrawals (only one non-terminal at a time).
create or replace function public.prevent_duplicate_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('pending','processing') then
    if exists (
      select 1 from public.withdrawals w
      where w.user_id = new.user_id
        and w.id <> new.id
        and w.status in ('pending','processing')
    ) then
      raise exception 'A pending or processing withdrawal already exists for this user';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_prevent_dup_wd on public.withdrawals;
create trigger trg_prevent_dup_wd
  before insert or update on public.withdrawals
  for each row execute function public.prevent_duplicate_withdrawal();

-- ---------- audit_logs ----------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

drop policy if exists "audit_select_admin" on public.audit_logs;
create policy "audit_select_admin"
  on public.audit_logs for select
  to authenticated
  using (public.is_admin());

drop policy if exists "audit_insert_admin" on public.audit_logs;
create policy "audit_insert_admin"
  on public.audit_logs for insert
  to authenticated
  with check (public.is_admin());

create index if not exists idx_audit_actor on public.audit_logs(actor_id);
create index if not exists idx_audit_target on public.audit_logs(target_type, target_id);
