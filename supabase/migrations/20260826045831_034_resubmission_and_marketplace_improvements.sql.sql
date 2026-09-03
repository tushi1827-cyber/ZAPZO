/*
# Task Marketplace Improvements — Resubmission, Notifications, 10MB Proofs

## Purpose
Unblocks resubmission after rejection, increases proof file size limit to 10MB,
and sends user notifications when submissions are approved or rejected.

## Changes

### 1. Resubmission After Rejection
- Drops the existing UNIQUE(task_id, user_id) constraint on task_submissions
  that permanently blocked users from resubmitting after rejection.
- Adds a partial UNIQUE index on (task_id, user_id) WHERE status IN ('pending','approved')
  so users can have only one active submission per task, but can create a new
  submission after the previous one is rejected.
- All previous submission history is preserved (rejected rows remain in the table).

### 2. Updated submit_task_safe RPC
- Changed duplicate check: now only blocks if an existing submission has
  status='pending' or status='approved' (not 'rejected').
- All anti-fraud checks preserved: auth, suspension, proof text length, image
  path validation, task active/full checks, rate limits (5/hr, 15/day),
  rapid submission detection, excessive rejection blocking (5+ on same task),
  risk score >= 80 blocking, risk event logging.

### 3. Proof File Size Increase
- Updates task-proofs storage bucket file_size_limit from 5MB to 10MB.

### 4. Notifications on Approve/Reject
- Updates approve_task_submission to insert a notification for the user.
- Updates reject_task_submission to insert a notification for the user.

### 5. Automatic Verification Interface
- Creates a stub function auto_verify_submission(p_submission_id uuid) that
  returns boolean, currently always returns false with a NOTICE.
  This provides a clean hook for future automatic verification implementation
  without breaking the manual system.
- Execute granted to authenticated (for future use).

## Security
- No RLS policies changed.
- submit_task_safe remains SECURITY DEFINER with search_path = public.
- approve_task_submission remains SECURITY DEFINER.
- reject_task_submission remains SECURITY DEFINER.
- No direct INSERT policy added to task_submissions.
- Migration 031 security (revoke direct insert) preserved.
*/

-- 1. Drop the old unique constraint that blocked resubmission
ALTER TABLE public.task_submissions DROP CONSTRAINT IF EXISTS task_submissions_task_id_user_id_key;

-- 2. Add partial unique index: only one active (pending/approved) submission per user per task
CREATE UNIQUE INDEX IF NOT EXISTS task_submissions_one_active_per_user_task
ON public.task_submissions (task_id, user_id)
WHERE status IN ('pending', 'approved');

-- 3. Update storage bucket file size limit to 10MB
UPDATE storage.buckets
SET file_size_limit = 10485760
WHERE id = 'task-proofs';

-- 4. Recreate submit_task_safe with updated duplicate check (allows resubmission after rejection)
CREATE OR REPLACE FUNCTION public.submit_task_safe(
  p_task_id uuid,
  p_proof_text text,
  p_proof_image_url text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_task public.tasks%rowtype;
  v_existing public.task_submissions%rowtype;
  v_recent_count integer;
  v_hourly_count integer;
  v_daily_count integer;
  v_rejected_count integer;
  v_suspended boolean;
  v_risk_score integer;
  v_new_id uuid;
  v_user_id uuid := auth.uid();
  v_image_url text;
begin
  -- Must be authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Check suspension
  SELECT is_suspended INTO v_suspended FROM public.profiles WHERE id = v_user_id;
  IF v_suspended THEN
    RAISE EXCEPTION 'Your account is suspended. Contact support if you believe this is an error.';
  END IF;

  -- Validate proof text
  IF length(trim(p_proof_text)) < 10 THEN
    RAISE EXCEPTION 'Please provide detailed proof (at least 10 characters).';
  END IF;

  -- Validate image URL if provided — must be in task-proofs bucket and owned by user
  IF p_proof_image_url IS NOT NULL AND length(trim(p_proof_image_url)) > 0 THEN
    v_image_url := trim(p_proof_image_url);
    -- Must contain the task-proofs bucket path and user's own folder
    IF v_image_url NOT LIKE '%task-proofs/' || v_user_id::text || '/%' THEN
      RAISE EXCEPTION 'Invalid proof image path';
    END IF;
  ELSE
    v_image_url := NULL;
  END IF;

  -- Fetch task
  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT found THEN
    RAISE EXCEPTION 'Task not found';
  END IF;
  IF v_task.status <> 'active' THEN
    RAISE EXCEPTION 'This task is not currently accepting submissions.';
  END IF;
  IF v_task.approved_count >= v_task.max_completions THEN
    RAISE EXCEPTION 'This task has reached its maximum completions.';
  END IF;

  -- Check for existing ACTIVE submission (pending or approved)
  -- Rejected submissions do NOT block resubmission
  SELECT * INTO v_existing FROM public.task_submissions
  WHERE task_id = p_task_id AND user_id = v_user_id AND status IN ('pending', 'approved');
  IF found THEN
    -- Log duplicate attempt as risk event
    INSERT INTO public.risk_events (user_id, event_type, description, risk_points, task_id)
    VALUES (v_user_id, 'duplicate_submission',
    'Attempted to re-submit task: ' || v_task.title, 15, p_task_id);
    PERFORM public.recalculate_risk_score(v_user_id);
    IF v_existing.status = 'approved' THEN
      RAISE EXCEPTION 'Your submission for this task has already been approved.';
    ELSE
      RAISE EXCEPTION 'You have a pending submission for this task. Please wait for review.';
    END IF;
  END IF;

  -- Rate limit: max 5 submissions per hour
  SELECT count(*) INTO v_hourly_count FROM public.task_submissions
  WHERE user_id = v_user_id AND created_at > now() - interval '1 hour';
  IF v_hourly_count >= 5 THEN
    INSERT INTO public.risk_events (user_id, event_type, description, risk_points)
    VALUES (v_user_id, 'rate_limit_block',
    'Blocked: ' || v_hourly_count || ' submissions in the last hour', 10);
    PERFORM public.recalculate_risk_score(v_user_id);
    RAISE EXCEPTION 'You have submitted too many tasks recently. Please wait a while before trying again.';
  END IF;

  -- Rate limit: max 15 submissions per day
  SELECT count(*) INTO v_daily_count FROM public.task_submissions
  WHERE user_id = v_user_id AND created_at > now() - interval '24 hours';
  IF v_daily_count >= 15 THEN
    INSERT INTO public.risk_events (user_id, event_type, description, risk_points)
    VALUES (v_user_id, 'rate_limit_block',
    'Blocked: ' || v_daily_count || ' submissions in the last 24 hours', 10);
    PERFORM public.recalculate_risk_score(v_user_id);
    RAISE EXCEPTION 'Daily submission limit reached. Please try again tomorrow.';
  END IF;

  -- Rapid submission detection: 3+ submissions within 2 minutes
  SELECT count(*) INTO v_recent_count FROM public.task_submissions
  WHERE user_id = v_user_id AND created_at > now() - interval '2 minutes';
  IF v_recent_count >= 3 THEN
    INSERT INTO public.risk_events (user_id, event_type, description, risk_points)
    VALUES (v_user_id, 'rapid_submission',
    'Rapid submission detected: ' || (v_recent_count + 1) || ' submissions within 2 minutes', 10);
    PERFORM public.recalculate_risk_score(v_user_id);
    -- Don't block, but flag — let admin review
  END IF;

  -- Excessive rejection check: 5+ rejections on the same task
  SELECT count(*) INTO v_rejected_count FROM public.task_submissions
  WHERE user_id = v_user_id AND task_id = p_task_id AND status = 'rejected';
  IF v_rejected_count >= 5 THEN
    INSERT INTO public.risk_events (user_id, event_type, description, risk_points, task_id)
    VALUES (v_user_id, 'excessive_rejection',
    'Excessive rejections on task: ' || v_task.title, 20, p_task_id);
    PERFORM public.recalculate_risk_score(v_user_id);
    RAISE EXCEPTION 'You have had too many rejections on this task. Please contact support.';
  END IF;

  -- Check risk score — if critical, block submission
  SELECT risk_score INTO v_risk_score FROM public.user_risk_profiles WHERE user_id = v_user_id;
  IF v_risk_score IS NOT NULL AND v_risk_score >= 80 THEN
    RAISE EXCEPTION 'Your account is flagged for review. Please contact support to resolve this.';
  END IF;

  -- Insert the submission (with optional image URL)
  INSERT INTO public.task_submissions (task_id, user_id, proof_text, proof_image_url)
  VALUES (p_task_id, v_user_id, trim(p_proof_text), v_image_url)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
end;
$function$;

-- 5. Update approve_task_submission to send notification
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
  INSERT INTO public.notifications (user_id, type, title, message, link)
  VALUES (v_sub.user_id, 'success', 'Submission Approved',
  'Your submission for "' || v_task.title || '" has been approved. ₹' || v_reward || ' has been credited to your wallet.',
  '/dashboard/wallet');
end;
$function$;

-- 6. Update reject_task_submission to send notification
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
  INSERT INTO public.notifications (user_id, type, title, message, link)
  VALUES (v_sub.user_id, 'danger', 'Submission Rejected',
  'Your submission for "' || COALESCE(v_task.title, 'a task') || '" was rejected: ' || p_reason,
  '/dashboard/tasks');
end;
$function$;

-- 7. Automatic verification stub (clean interface for future implementation)
CREATE OR REPLACE FUNCTION public.auto_verify_submission(p_submission_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_sub public.task_submissions%rowtype;
  v_task public.tasks%rowtype;
begin
  -- Stub: always returns false (not yet implemented)
  -- Future implementation will check task-specific verification criteria
  -- (e.g., social media API verification, link click tracking, etc.)
  raise notice 'auto_verify_submission: automatic verification not yet implemented for submission %', p_submission_id;
  return false;
end;
$function$;

-- Grant execute on the stub to authenticated
GRANT EXECUTE ON FUNCTION public.auto_verify_submission(uuid) TO authenticated;
