/*
# Fix notification column name in approve/reject functions

## Purpose
The notifications table uses column 'body' not 'message'.
This fixes the approve_task_submission and reject_task_submission functions
to use the correct column name.

## Changes
- Updates approve_task_submission to INSERT into notifications with 'body' column.
- Updates reject_task_submission to INSERT into notifications with 'body' column.
*/

CREATE OR REPLACE FUNCTION public.approve_task_submission(p_submission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Notify user of approval
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_sub.user_id, 'success', 'Submission Approved',
  'Your submission for "' || v_task.title || '" has been approved. Reward credited to your wallet.',
  '/dashboard/wallet');
end;
$function$;

CREATE OR REPLACE FUNCTION public.reject_task_submission(p_submission_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_sub public.task_submissions%rowtype;
  v_task public.tasks%rowtype;
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

  select title into v_task from public.tasks where id = v_sub.task_id;

  update public.task_submissions
  set status = 'rejected', rejection_reason = p_reason, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_submission_id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'task_rejection', 'submission', p_submission_id,
  jsonb_build_object('user_id', v_sub.user_id, 'reason', p_reason));

  -- Notify user of rejection
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_sub.user_id, 'danger', 'Submission Rejected',
  'Your submission for "' || COALESCE(v_task.title, 'a task') || '" was rejected: ' || p_reason,
  '/dashboard/tasks');
end;
$function$;
