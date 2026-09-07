/*
# Notification System Enhancement — Add related_id, dedup, and improve triggers

## Summary
This migration enhances the existing notification system by:
1. Adding a `related_id` column to link notifications to specific events
2. Adding a unique constraint for duplicate prevention
3. Replacing all 4 trigger functions with enhanced versions that include richer messages
4. Adding new trigger functions for task submission and withdrawal request events
5. Adding new triggers for INSERT events on task_submissions and withdrawals

## 1. Modified Table: notifications
- Added `related_id` (uuid, nullable) — links notification to the event that triggered it
- Added unique index on (user_id, type, related_id) to prevent duplicate notifications

## 2. Modified Trigger Functions (enhanced messages)
- `notify_submission_status()` — now includes task title and reward amount in approval message
- `notify_withdrawal_status()` — now includes amount in ₹ format, handles gift_card_fulfilled type
- `notify_referral_qualified()` — now includes reward amount
- `notify_wallet_adjustment()` — unchanged (only fires for bonus/adjustment, not task rewards)

## 3. New Trigger Functions
- `notify_submission_created()` — fires on INSERT to task_submissions, creates task_submitted notification
- `notify_withdrawal_requested()` — fires on INSERT to withdrawals, creates withdrawal_requested notification

## 4. New Triggers
- `trg_notify_submission_insert` — AFTER INSERT on task_submissions
- `trg_notify_withdrawal_insert` — AFTER INSERT on withdrawals

## 5. Duplicate Prevention
- Unique index prevents duplicate notifications for the same (user_id, type, related_id) combination
- Trigger functions check for existing notifications before inserting (belt and suspenders)

## 6. Security
- All trigger functions remain SECURITY DEFINER with search_path = public
- RLS policies unchanged — users can still only read/update their own notifications
- INSERT policy remains scoped to authenticated users (trigger functions bypass RLS as SECURITY DEFINER)

## 7. Important Notes
1. No existing data is lost — related_id is nullable
2. Existing notifications get NULL related_id (won't conflict with new dedup)
3. The unique index is partial (WHERE related_id IS NOT NULL) so it only deduplicates new structured notifications
4. All notification types are consistent: task_submitted, task_approved, task_rejected, reward_received, withdrawal_requested, withdrawal_processing, withdrawal_paid, withdrawal_rejected, gift_card_fulfilled, referral_reward
*/

-- Step 1: Add related_id column
ALTER TABLE public.notifications 
ADD COLUMN IF NOT EXISTS related_id uuid;

-- Step 2: Add unique index for dedup (partial — only when related_id is present)
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_idx
ON public.notifications (user_id, type, related_id)
WHERE related_id IS NOT NULL;

-- Step 3: Replace notify_submission_status with enhanced version
CREATE OR REPLACE FUNCTION public.notify_submission_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_task public.tasks%rowtype;
  v_existing int;
begin
  if TG_OP = 'UPDATE' and OLD.status != NEW.status then
    -- Check for existing notification to prevent duplicates
    select count(*) into v_existing from public.notifications
    where user_id = NEW.user_id and type in ('task_approved', 'task_rejected')
    and related_id = NEW.id;
    if v_existing > 0 then
      return NEW;
    end if;

    select * into v_task from public.tasks where id = NEW.task_id;

    if NEW.status = 'approved' then
      insert into public.notifications (user_id, type, title, body, link, related_id)
      values (
        NEW.user_id,
        'task_approved',
        'Task Approved 🎉',
        'Your task "' || coalesce(v_task.title, 'a task') || '" was approved. ₹' || NEW.reward_amount || ' has been added to your wallet.',
        '/dashboard/submissions',
        NEW.id
      );

      -- Also create reward_received notification
      insert into public.notifications (user_id, type, title, body, link, related_id)
      values (
        NEW.user_id,
        'reward_received',
        'Reward Received 💰',
        '₹' || NEW.reward_amount || ' has been credited to your wallet for "' || coalesce(v_task.title, 'a task') || '".',
        '/dashboard/wallet',
        NEW.id
      );
    elsif NEW.status = 'rejected' then
      insert into public.notifications (user_id, type, title, body, link, related_id)
      values (
        NEW.user_id,
        'task_rejected',
        'Task Rejected',
        'Your task "' || coalesce(v_task.title, 'a task') || '" was rejected. ' || coalesce('Reason: ' || NEW.rejection_reason, 'No reason provided.'),
        '/dashboard/submissions',
        NEW.id
      );
    end if;
  end if;
  return NEW;
end;
$function$;

-- Step 4: Replace notify_withdrawal_status with enhanced version
CREATE OR REPLACE FUNCTION public.notify_withdrawal_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_existing int;
  v_type text;
  v_title text;
  v_body text;
begin
  if TG_OP = 'UPDATE' and OLD.status != NEW.status then
    -- Determine notification type and content
    if NEW.status = 'paid' then
      if NEW.method in ('amazon_gift_card', 'flipkart_gift_card', 'google_play_gift_card') then
        v_type := 'gift_card_fulfilled';
        v_title := 'Gift Card Fulfilled 🎁';
        v_body := 'Your ' || replace(replace(replace(NEW.method, '_gift_card', ''), '_', ' '), 'amazon', 'Amazon') || ' Gift Card worth ₹' || NEW.amount || ' has been fulfilled and sent to your email.';
      else
        v_type := 'withdrawal_paid';
        v_title := 'Payment Received 🎉';
        v_body := 'Your ₹' || NEW.amount || ' withdrawal has been completed.';
      end if;
    elsif NEW.status = 'rejected' then
      v_type := 'withdrawal_rejected';
      v_title := 'Withdrawal Rejected';
      v_body := 'Your ₹' || NEW.amount || ' withdrawal request was rejected. ' || coalesce('Reason: ' || NEW.rejection_reason, 'Reserved funds have been released back to your wallet.');
    elsif NEW.status = 'processing' then
      v_type := 'withdrawal_processing';
      v_title := 'Withdrawal Processing';
      v_body := 'Your ₹' || NEW.amount || ' withdrawal is being processed.';
    else
      return NEW;
    end if;

    -- Check for existing notification to prevent duplicates
    select count(*) into v_existing from public.notifications
    where user_id = NEW.user_id and type = v_type and related_id = NEW.id;
    if v_existing > 0 then
      return NEW;
    end if;

    insert into public.notifications (user_id, type, title, body, link, related_id)
    values (
      NEW.user_id,
      v_type,
      v_title,
      v_body,
      '/dashboard/withdraw',
      NEW.id
    );
  end if;
  return NEW;
end;
$function$;

-- Step 5: Replace notify_referral_qualified with enhanced version
CREATE OR REPLACE FUNCTION public.notify_referral_qualified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_existing int;
begin
  if TG_OP = 'UPDATE' and OLD.status != NEW.status and NEW.status = 'qualified' then
    -- Check for existing notification to prevent duplicates
    select count(*) into v_existing from public.notifications
    where user_id = NEW.referrer_id and type = 'referral_reward' and related_id = NEW.id;
    if v_existing > 0 then
      return NEW;
    end if;

    insert into public.notifications (user_id, type, title, body, link, related_id)
    values (
      NEW.referrer_id,
      'referral_reward',
      'Referral Reward 🎁',
      '₹' || NEW.reward_amount || ' referral reward has been credited to your wallet.',
      '/dashboard/referrals',
      NEW.id
    );
  end if;
  return NEW;
end;
$function$;

-- Step 6: notify_wallet_adjustment — keep as-is but add dedup
CREATE OR REPLACE FUNCTION public.notify_wallet_adjustment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_existing int;
begin
  if TG_OP = 'INSERT' and NEW.type in ('bonus', 'adjustment') and NEW.status = 'completed' then
    -- Check for existing notification to prevent duplicates
    select count(*) into v_existing from public.notifications
    where user_id = NEW.user_id and type = 'wallet_adjustment' and related_id = NEW.id;
    if v_existing > 0 then
      return NEW;
    end if;

    insert into public.notifications (user_id, type, title, body, link, related_id)
    values (
      NEW.user_id,
      'wallet_adjustment',
      case when NEW.amount >= 0 then 'Wallet Credited' else 'Wallet Debited' end,
      NEW.description || ' — ₹' || abs(NEW.amount)::text,
      '/dashboard/wallet',
      NEW.id
    );
  end if;
  return NEW;
end;
$function$;

-- Step 7: New trigger function for task submission INSERT
CREATE OR REPLACE FUNCTION public.notify_submission_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_task public.tasks%rowtype;
  v_existing int;
begin
  if TG_OP = 'INSERT' then
    -- Check for existing notification to prevent duplicates
    select count(*) into v_existing from public.notifications
    where user_id = NEW.user_id and type = 'task_submitted' and related_id = NEW.id;
    if v_existing > 0 then
      return NEW;
    end if;

    select * into v_task from public.tasks where id = NEW.task_id;

    insert into public.notifications (user_id, type, title, body, link, related_id)
    values (
      NEW.user_id,
      'task_submitted',
      'Task Submitted',
      'Your task submission for "' || coalesce(v_task.title, 'a task') || '" has been received and is waiting for review.',
      '/dashboard/submissions',
      NEW.id
    );
  end if;
  return NEW;
end;
$function$;

-- Step 8: New trigger function for withdrawal INSERT
CREATE OR REPLACE FUNCTION public.notify_withdrawal_requested()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_existing int;
begin
  if TG_OP = 'INSERT' then
    -- Check for existing notification to prevent duplicates
    select count(*) into v_existing from public.notifications
    where user_id = NEW.user_id and type = 'withdrawal_requested' and related_id = NEW.id;
    if v_existing > 0 then
      return NEW;
    end if;

    insert into public.notifications (user_id, type, title, body, link, related_id)
    values (
      NEW.user_id,
      'withdrawal_requested',
      'Withdrawal Requested',
      'Your ₹' || NEW.amount || ' withdrawal request has been received.',
      '/dashboard/withdraw',
      NEW.id
    );
  end if;
  return NEW;
end;
$function$;

-- Step 9: Create new triggers
DROP TRIGGER IF EXISTS trg_notify_submission_insert ON public.task_submissions;
CREATE TRIGGER trg_notify_submission_insert
AFTER INSERT ON public.task_submissions
FOR EACH ROW EXECUTE FUNCTION notify_submission_created();

DROP TRIGGER IF EXISTS trg_notify_withdrawal_insert ON public.withdrawals;
CREATE TRIGGER trg_notify_withdrawal_insert
AFTER INSERT ON public.withdrawals
FOR EACH ROW EXECUTE FUNCTION notify_withdrawal_requested();

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
