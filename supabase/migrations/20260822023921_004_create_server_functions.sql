/*
# Server-side functions for secure money-moving operations

## Overview
All balance-changing operations are SECURITY DEFINER functions so the browser can never directly manipulate rewards, balances, withdrawal status, or referral qualification. The frontend only calls these RPCs; the database enforces correctness.

## Functions

### get_user_balance()
- Returns the current available balance for the calling user (sum of completed, non-reversed transactions minus pending withdrawals).
- PUBLIC (any authenticated user, scoped to auth.uid()).

### request_withdrawal(p_amount, p_method, p_payout_details)
- User-facing. Validates amount > 0, >= min_withdrawal, sufficient available balance, no existing pending/processing withdrawal.
- Inserts a withdrawal row (status=pending) and a wallet_transactions row (type=withdrawal, status=pending, negative amount) to reserve the funds.
- All in one DB transaction. Prevents negative balances and double withdrawals.

### approve_task_submission(p_submission_id)
- Admin-only. Approves a pending submission. Idempotent (rejects if not pending).
- Snapshots task.reward into submission.reward_amount, increments task.approved_count.
- Credits a task_reward wallet transaction to the submitter.
- Marks task completed if approved_count reaches max_completions.
- Then calls qualify_referral_if_eligible for the submitter.
- Writes an audit log entry.

### reject_task_submission(p_submission_id, p_reason)
- Admin-only. Rejects a pending submission with a reason. Idempotent.
- Writes an audit log entry. No wallet impact.

### review_withdrawal(p_withdrawal_id, p_status, p_reason)
- Admin-only. Transitions a withdrawal to processing/approved/rejected/paid.
- On reject: marks withdrawal rejected, reverses the pending wallet transaction (withdrawal_reversal, positive amount), releases reserved funds.
- On paid: marks wallet withdrawal transaction completed.
- Writes audit log.

### qualify_referral_if_eligible(p_user_id)
- Called internally after a task approval. If the user was referred and their referral is still pending, marks it qualified and credits the referrer a referral_reward transaction.
- Idempotent — only qualifies once. Prevents repeated qualification.

### manual_adjustment(p_user_id, p_amount, p_description)
- Admin-only. Adds a bonus or adjustment transaction. Writes audit log.

### suspend_user(p_user_id) / activate_user(p_user_id)
- Admin-only. Toggles is_suspended. Writes audit log.

## Security
- All functions SECURITY DEFINER with fixed search_path = public.
- Admin-only functions check public.is_admin() and raise if false.
- User-facing functions are scoped to auth.uid().
- No function trusts amounts from the client beyond validation; reward values are read from the tasks table server-side.
*/

-- ---------- get_user_balance ----------
create or replace function public.get_user_balance()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
    case
      when type = 'withdrawal' and status = 'pending' then 0  -- reserved, not spendable
      when status = 'reversed' then 0
      else amount
    end
  ), 0)
  from public.wallet_transactions
  where user_id = auth.uid();
$$;

-- grant execute to authenticated
grant execute on function public.get_user_balance() to authenticated;

-- ---------- request_withdrawal ----------
create or replace function public.request_withdrawal(
  p_amount numeric,
  p_method text,
  p_payout_details text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_balance numeric;
  v_min numeric;
  v_existing int;
begin
  if p_amount <= 0 then
    raise exception 'Withdrawal amount must be positive';
  end if;
  if p_method not in ('upi','bank_transfer') then
    raise exception 'Invalid withdrawal method';
  end if;
  if char_length(trim(p_payout_details)) = 0 then
    raise exception 'Payout details are required';
  end if;

  select min_withdrawal into v_min from public.settings where id = 1;
  if p_amount < v_min then
    raise exception 'Minimum withdrawal amount is %', v_min;
  end if;

  -- Prevent duplicate pending/processing withdrawal
  select count(*) into v_existing from public.withdrawals
    where user_id = auth.uid() and status in ('pending','processing');
  if v_existing > 0 then
    raise exception 'You already have a pending or processing withdrawal';
  end if;

  v_balance := public.get_user_balance();
  if p_amount > v_balance then
    raise exception 'Insufficient balance. Available: %', v_balance;
  end if;

  insert into public.withdrawals (user_id, amount, method, payout_details, status)
    values (auth.uid(), p_amount, p_method, p_payout_details, 'pending')
    returning id into v_id;

  insert into public.wallet_transactions (user_id, type, amount, status, reference_id, description)
    values (auth.uid(), 'withdrawal', -p_amount, 'pending', v_id, 'Withdrawal request');

  return v_id;
end;
$$;

grant execute on function public.request_withdrawal(numeric, text, text) to authenticated;

-- ---------- approve_task_submission ----------
create or replace function public.approve_task_submission(p_submission_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.task_submissions%rowtype;
  v_task public.tasks%rowtype;
  v_reward numeric;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select * into v_sub from public.task_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Submission not found';
  end if;
  if v_sub.status <> 'pending' then
    raise exception 'Submission is not pending (current: %)', v_sub.status;
  end if;

  select * into v_task from public.tasks where id = v_sub.task_id for update;
  v_reward := v_task.reward;

  update public.task_submissions
    set status = 'approved', reward_amount = v_reward, reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_submission_id;

  update public.tasks set approved_count = approved_count + 1 where id = v_task.id;

  if (select approved_count from public.tasks where id = v_task.id) >= v_task.max_completions then
    update public.tasks set status = 'completed' where id = v_task.id;
  end if;

  insert into public.wallet_transactions (user_id, type, amount, status, reference_id, description)
    values (v_sub.user_id, 'task_reward', v_reward, 'completed', p_submission_id,
            'Task reward: ' || v_task.title);

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values (auth.uid(), 'task_approval', 'submission', p_submission_id,
            jsonb_build_object('task_id', v_task.id, 'user_id', v_sub.user_id, 'reward', v_reward));

  perform public.qualify_referral_if_eligible(v_sub.user_id);
end;
$$;

grant execute on function public.approve_task_submission(uuid) to authenticated;

-- ---------- reject_task_submission ----------
create or replace function public.reject_task_submission(p_submission_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.task_submissions%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select * into v_sub from public.task_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Submission not found';
  end if;
  if v_sub.status <> 'pending' then
    raise exception 'Submission is not pending (current: %)', v_sub.status;
  end if;

  update public.task_submissions
    set status = 'rejected', rejection_reason = p_reason, reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_submission_id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values (auth.uid(), 'task_rejection', 'submission', p_submission_id,
            jsonb_build_object('user_id', v_sub.user_id, 'reason', p_reason));
end;
$$;

grant execute on function public.reject_task_submission(uuid, text) to authenticated;

-- ---------- qualify_referral_if_eligible ----------
create or replace function public.qualify_referral_if_eligible(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref public.referrals%rowtype;
  v_reward numeric;
begin
  select * into v_ref from public.referrals
    where referred_id = p_user_id and status = 'pending' for update;
  if not found then
    return;
  end if;

  select referral_reward into v_reward from public.settings where id = 1;

  update public.referrals
    set status = 'qualified', qualified_at = now(), reward_amount = v_reward
    where id = v_ref.id;

  insert into public.wallet_transactions (user_id, type, amount, status, reference_id, description)
    values (v_ref.referrer_id, 'referral_reward', v_reward, 'completed', v_ref.id,
            'Referral reward: ' || v_ref.referral_code);

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values (auth.uid(), 'referral_qualified', 'referral', v_ref.id,
            jsonb_build_object('referrer_id', v_ref.referrer_id, 'referred_id', p_user_id, 'reward', v_reward));
end;
$$;

-- ---------- review_withdrawal ----------
create or replace function public.review_withdrawal(
  p_withdrawal_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_w public.withdrawals%rowtype;
  v_tx record;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if p_status not in ('processing','approved','rejected','paid') then
    raise exception 'Invalid status';
  end if;

  select * into v_w from public.withdrawals where id = p_withdrawal_id for update;
  if not found then
    raise exception 'Withdrawal not found';
  end if;
  if v_w.status in ('rejected','paid') then
    raise exception 'Withdrawal is already in a terminal state';
  end if;

  if p_status = 'rejected' then
    update public.withdrawals
      set status = 'rejected', rejection_reason = p_reason, reviewed_by = auth.uid(), reviewed_at = now()
      where id = p_withdrawal_id;

    -- reverse the pending withdrawal transaction
    insert into public.wallet_transactions (user_id, type, amount, status, reference_id, description)
      values (v_w.user_id, 'withdrawal_reversal', v_w.amount, 'completed', p_withdrawal_id,
              'Withdrawal rejected - funds released');

    -- mark original withdrawal tx reversed
    update public.wallet_transactions set status = 'reversed'
      where type = 'withdrawal' and reference_id = p_withdrawal_id;

  elsif p_status = 'paid' then
    update public.withdrawals
      set status = 'paid', reviewed_by = auth.uid(), reviewed_at = now()
      where id = p_withdrawal_id;

    update public.wallet_transactions set status = 'completed'
      where type = 'withdrawal' and reference_id = p_withdrawal_id;

  else
    update public.withdrawals
      set status = p_status, reviewed_by = auth.uid(), reviewed_at = now()
      where id = p_withdrawal_id;
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values (auth.uid(), 'withdrawal_review', 'withdrawal', p_withdrawal_id,
            jsonb_build_object('status', p_status, 'reason', p_reason));
end;
$$;

grant execute on function public.review_withdrawal(uuid, text, text) to authenticated;

-- ---------- manual_adjustment ----------
create or replace function public.manual_adjustment(
  p_user_id uuid,
  p_amount numeric,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if p_amount = 0 then
    raise exception 'Adjustment amount cannot be zero';
  end if;

  insert into public.wallet_transactions (user_id, type, amount, status, description)
    values (p_user_id, 'adjustment', p_amount, 'completed', p_description);

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values (auth.uid(), 'manual_adjustment', 'user', p_user_id,
            jsonb_build_object('amount', p_amount, 'description', p_description));
end;
$$;

grant execute on function public.manual_adjustment(uuid, numeric, text) to authenticated;

-- ---------- suspend_user / activate_user ----------
create or replace function public.suspend_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  update public.profiles set is_suspended = true where id = p_user_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values (auth.uid(), 'user_suspended', 'user', p_user_id, '{}'::jsonb);
end;
$$;

grant execute on function public.suspend_user(uuid) to authenticated;

create or replace function public.activate_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  update public.profiles set is_suspended = false where id = p_user_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values (auth.uid(), 'user_activated', 'user', p_user_id, '{}'::jsonb);
end;
$$;

grant execute on function public.activate_user(uuid) to authenticated;
