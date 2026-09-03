-- Notifications table
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index on public.notifications (user_id, created_at desc);
create index on public.notifications (user_id, is_read) where is_read = false;

alter table public.notifications enable row level security;

create policy "notifications_select_own"
  on public.notifications for select
  to authenticated using (auth.uid() = user_id);

create policy "notifications_insert_own"
  on public.notifications for insert
  to authenticated with check (auth.uid() = user_id);

create policy "notifications_update_own"
  on public.notifications for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "notifications_delete_own"
  on public.notifications for delete
  to authenticated using (auth.uid() = user_id);

-- Allow the service role (used by triggers) to insert regardless of RLS
-- Triggers run with the table owner's privileges, bypassing RLS.

-- Trigger: notify on task submission approval/rejection
create or replace function public.notify_submission_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' and OLD.status != NEW.status then
    if NEW.status = 'approved' then
      insert into notifications (user_id, type, title, body, link)
      values (
        NEW.user_id,
        'submission_approved',
        'Task Submission Approved',
        'Your submission has been approved. Reward credited to your wallet.',
        '/dashboard/tasks/' || NEW.task_id
      );
    elsif NEW.status = 'rejected' then
      insert into notifications (user_id, type, title, body, link)
      values (
        NEW.user_id,
        'submission_rejected',
        'Task Submission Rejected',
        coalesce(NEW.rejection_reason, 'Your submission was rejected.'),
        '/dashboard/tasks/' || NEW.task_id
      );
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_submission on public.task_submissions;
create trigger trg_notify_submission
  after update on public.task_submissions
  for each row execute function public.notify_submission_status();

-- Trigger: notify on withdrawal status change
create or replace function public.notify_withdrawal_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' and OLD.status != NEW.status then
    if NEW.status = 'paid' then
      insert into notifications (user_id, type, title, body, link)
      values (
        NEW.user_id,
        'withdrawal_paid',
        'Withdrawal Completed',
        'Your withdrawal of ' || NEW.amount::text || ' has been paid.',
        '/dashboard/withdraw'
      );
    elsif NEW.status = 'rejected' then
      insert into notifications (user_id, type, title, body, link)
      values (
        NEW.user_id,
        'withdrawal_rejected',
        'Withdrawal Rejected',
        coalesce(NEW.rejection_reason, 'Your withdrawal request was rejected. Funds released back to your wallet.'),
        '/dashboard/withdraw'
      );
    elsif NEW.status = 'processing' then
      insert into notifications (user_id, type, title, body, link)
      values (
        NEW.user_id,
        'withdrawal_processing',
        'Withdrawal Processing',
        'Your withdrawal of ' || NEW.amount::text || ' is being processed.',
        '/dashboard/withdraw'
      );
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_withdrawal on public.withdrawals;
create trigger trg_notify_withdrawal
  after update on public.withdrawals
  for each row execute function public.notify_withdrawal_status();

-- Trigger: notify on referral qualification
create or replace function public.notify_referral_qualified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' and OLD.status != NEW.status and NEW.status = 'qualified' then
    insert into notifications (user_id, type, title, body, link)
    values (
      NEW.referrer_id,
      'referral_qualified',
      'Referral Qualified!',
      'Your referral has qualified. Reward credited to your wallet.',
      '/dashboard/referrals'
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_referral on public.referrals;
create trigger trg_notify_referral
  after update on public.referrals
  for each row execute function public.notify_referral_qualified();

-- Trigger: notify on wallet adjustment (bonus/adjustment types only)
create or replace function public.notify_wallet_adjustment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' and NEW.type in ('bonus', 'adjustment') and NEW.status = 'completed' then
    insert into notifications (user_id, type, title, body, link)
    values (
      NEW.user_id,
      'wallet_adjustment',
      case when NEW.amount >= 0 then 'Wallet Credited' else 'Wallet Debited' end,
      NEW.description || ' — ' || NEW.amount::text,
      '/dashboard/wallet'
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_wallet_adj on public.wallet_transactions;
create trigger trg_notify_wallet_adj
  after insert on public.wallet_transactions
  for each row execute function public.notify_wallet_adjustment();

-- Revoke execute on trigger functions from anon/public
revoke execute on function public.notify_submission_status() from anon, authenticated;
revoke execute on function public.notify_withdrawal_status() from anon, authenticated;
revoke execute on function public.notify_referral_qualified() from anon, authenticated;
revoke execute on function public.notify_wallet_adjustment() from anon, authenticated;
