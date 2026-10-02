/*
# Task Approval / Rejection Emails

## Purpose
When a task submission's status changes to 'approved' or 'rejected',
automatically enqueue a "task_approved" or "task_rejected" email into
public.email_queue via public.enqueue_email().
The existing process-email-queue Edge Function picks it up and sends it
through Resend.

## Approach
Modify the existing public.notify_submission_status() trigger function
(AFTER UPDATE on task_submissions) to also enqueue an email when the
status transitions to approved or rejected.  This is the single point
that already fires on every status change — manual admin approval,
manual rejection, and auto-verification — so no new triggers are needed
and neither approve_task_submission() nor reject_task_submission() needs
to change.

## Changes

### 1. Modified function: public.notify_submission_status()
- All existing in-app notification logic is preserved exactly as-is.
- After the notification inserts, two new blocks enqueue emails:
  - On approved: enqueue_email(NEW.user_id, 'task_approved',
      jsonb with user_name, task_title, amount, 'task_email_approved:' || NEW.id)
  - On rejected: enqueue_email(NEW.user_id, 'task_rejected',
      jsonb with user_name, task_title, reason, 'task_email_rejected:' || NEW.id)
- The user's display name is fetched from public.profiles.
- The task title is already available in v_task.
- enqueue_email is wrapped in BEGIN/EXCEPTION so that an email failure
  never rolls back the approval/rejection or the in-app notification.

### 2. No new triggers
- trg_notify_submission already calls notify_submission_status().
- CREATE OR REPLACE picks up the new logic automatically.

### 3. No other changes
- No changes to email_queue, enqueue_email, approve_task_submission,
  reject_task_submission, process-email-queue Edge Function, auth.users,
  RLS, or frontend code.

## Safety
- Function remains SECURITY DEFINER with search_path = 'public'.
- dedup_key ('task_email_approved:' || submission_id) guarantees one
  email per submission per outcome, even if the trigger fires twice.
- enqueue_email is also SECURITY DEFINER and resolves the recipient
  email from auth.users internally.
- Exception isolation ensures email failures never block approvals.
*/

CREATE OR REPLACE FUNCTION public.notify_submission_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_task public.tasks%rowtype;
  v_existing int;
  v_user_name text;
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

    -- Resolve user display name for email payload
    select name into v_user_name from public.profiles where id = NEW.user_id;

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

      -- Enqueue approval email (exception-isolated so email failure never blocks approval)
      begin
        perform public.enqueue_email(
          NEW.user_id,
          'task_approved',
          jsonb_build_object(
            'user_name', nullif(v_user_name, ''),
            'task_title', v_task.title,
            'amount', NEW.reward_amount
          ),
          'task_email_approved:' || NEW.id::text
        );
      exception when others then
        null;
      end;

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

      -- Enqueue rejection email (exception-isolated so email failure never blocks rejection)
      begin
        perform public.enqueue_email(
          NEW.user_id,
          'task_rejected',
          jsonb_build_object(
            'user_name', nullif(v_user_name, ''),
            'task_title', v_task.title,
            'reason', NEW.rejection_reason
          ),
          'task_email_rejected:' || NEW.id::text
        );
      exception when others then
        null;
      end;

    end if;
  end if;
  return NEW;
end;
$function$;
