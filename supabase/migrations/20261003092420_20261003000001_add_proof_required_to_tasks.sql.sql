/*
# Add proof_required column to tasks table

1. Changes
- Added `proof_required` boolean column to `public.tasks`.
- NOT NULL, DEFAULT true — preserves the current proof workflow for all existing tasks.
- Existing tasks automatically get `proof_required = true`.

2. Security
- No RLS policy changes. Existing RLS policies on `tasks` remain intact.
- No changes to admin authorization or permissions.
- The column is writable by the same roles that can already INSERT/UPDATE tasks (admins via existing policies).

3. Important Notes
- This is a purely additive change — no columns dropped, no types changed, no tables renamed.
- The `guard_submission_insert` trigger function is updated to skip proof_text validation
  when the task's `proof_required` is false, allowing submissions without proof text.
- The `submit-task` edge function is updated to skip client-side proof validation
  when the task's `proof_required` is false.
- Admin approval/rejection flow remains unchanged — tasks without proof still go through
  the same review process.
*/

-- Add proof_required column to tasks table
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS proof_required boolean NOT NULL DEFAULT true;

-- Update guard_submission_insert to respect proof_required
-- When proof_required = false, skip the minimum proof_text length check
CREATE OR REPLACE FUNCTION public.guard_submission_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_call_context   text;
  v_user_id        uuid := auth.uid();
  v_task           public.tasks%rowtype;
  v_existing       public.task_submissions%rowtype;
  v_hourly_count   integer;
  v_daily_count    integer;
  v_recent_count   integer;
  v_rejected_count integer;
  v_suspended      boolean;
  v_risk_score     integer;
  v_image_url      text;
begin
  -- Double-execution guard: skip if submit_task_safe is the caller
  GET DIAGNOSTICS v_call_context = PG_CONTEXT;
  IF v_call_context LIKE '%function submit_task_safe(%' THEN
    RETURN NEW;
  END IF;

  -- Authentication
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Force safe column values
  NEW.user_id                  := v_user_id;
  NEW.status                   := 'pending';
  NEW.reward_amount            := 0;
  NEW.reviewed_by              := NULL;
  NEW.reviewed_at              := NULL;
  NEW.is_auto_verified         := false;
  NEW.auto_verification_result := NULL;
  NEW.created_at               := now();
  NEW.updated_at               := now();

  -- Suspended user check
  SELECT is_suspended INTO v_suspended
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_suspended THEN
    RAISE EXCEPTION 'Your account is suspended. Contact support if you believe this is an error.';
  END IF;

  -- Task validation (lock row to serialize concurrent submissions)
  SELECT * INTO v_task
  FROM public.tasks
  WHERE id = NEW.task_id
  FOR UPDATE;

  IF NOT found THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  IF v_task.status <> 'active' THEN
    RAISE EXCEPTION 'This task is not currently accepting submissions.';
  END IF;

  IF v_task.approved_count >= v_task.max_completions THEN
    RAISE EXCEPTION 'This task has reached its maximum completions.';
  END IF;

  IF v_task.start_date IS NOT NULL AND now() < v_task.start_date THEN
    RAISE EXCEPTION 'This task has not started yet.';
  END IF;

  IF v_task.end_date IS NOT NULL AND now() > v_task.end_date THEN
    UPDATE public.tasks SET status = 'expired' WHERE id = v_task.id;
    RAISE EXCEPTION 'This task has expired and is no longer accepting submissions.';
  END IF;

  -- Proof text validation: only require minimum length when proof_required is true
  IF v_task.proof_required THEN
    IF length(trim(COALESCE(NEW.proof_text, ''))) < 10 THEN
      RAISE EXCEPTION 'Please provide detailed proof (at least 10 characters).';
    END IF;
    NEW.proof_text := trim(NEW.proof_text);
  ELSE
    -- Proof not required — allow empty or short proof text
    NEW.proof_text := trim(COALESCE(NEW.proof_text, ''));
  END IF;

  -- Proof image path ownership validation (unchanged)
  IF NEW.proof_image_url IS NOT NULL AND length(trim(NEW.proof_image_url)) > 0 THEN
    v_image_url := trim(NEW.proof_image_url);
    IF v_image_url NOT LIKE v_user_id::text || '/%' THEN
      RAISE EXCEPTION 'Invalid proof image path';
    END IF;
    NEW.proof_image_url := v_image_url;
  ELSE
    NEW.proof_image_url := NULL;
  END IF;

  -- Duplicate submission check
  SELECT * INTO v_existing
  FROM public.task_submissions
  WHERE task_id = NEW.task_id
    AND user_id = v_user_id
    AND status IN ('pending', 'approved');

  IF found THEN
    INSERT INTO public.risk_events (user_id, event_type, description, risk_points, task_id)
    VALUES (v_user_id, 'duplicate_submission',
            'Attempted to re-submit task: ' || v_task.title, 15, NEW.task_id);
    PERFORM public.recalculate_risk_score(v_user_id);

    IF v_existing.status = 'approved' THEN
      RAISE EXCEPTION 'Your submission for this task has already been approved.';
    ELSE
      RAISE EXCEPTION 'You have a pending submission for this task. Please wait for review.';
    END IF;
  END IF;

  -- Hourly rate limit (max 5 per hour)
  SELECT count(*) INTO v_hourly_count
  FROM public.task_submissions
  WHERE user_id = v_user_id
    AND created_at > now() - interval '1 hour';

  IF v_hourly_count >= 5 THEN
    INSERT INTO public.risk_events (user_id, event_type, description, risk_points)
    VALUES (v_user_id, 'rate_limit_block',
            'Blocked: ' || v_hourly_count || ' submissions in the last hour', 10);
    PERFORM public.recalculate_risk_score(v_user_id);
    RAISE EXCEPTION 'You have submitted too many tasks recently. Please wait a while before trying again.';
  END IF;

  -- Daily rate limit (max 15 per 24 hours)
  SELECT count(*) INTO v_daily_count
  FROM public.task_submissions
  WHERE user_id = v_user_id
    AND created_at > now() - interval '24 hours';

  IF v_daily_count >= 15 THEN
    INSERT INTO public.risk_events (user_id, event_type, description, risk_points)
    VALUES (v_user_id, 'rate_limit_block',
            'Blocked: ' || v_daily_count || ' submissions in the last 24 hours', 10);
    PERFORM public.recalculate_risk_score(v_user_id);
    RAISE EXCEPTION 'Daily submission limit reached. Please try again tomorrow.';
  END IF;

  -- Rapid submission detection (3 in 2 minutes — logged but not blocked)
  SELECT count(*) INTO v_recent_count
  FROM public.task_submissions
  WHERE user_id = v_user_id
    AND created_at > now() - interval '2 minutes';

  IF v_recent_count >= 3 THEN
    INSERT INTO public.risk_events (user_id, event_type, description, risk_points)
    VALUES (v_user_id, 'rapid_submission',
            'Rapid submission detected: ' || (v_recent_count + 1) || ' submissions within 2 minutes', 10);
    PERFORM public.recalculate_risk_score(v_user_id);
  END IF;

  -- Excessive rejections on same task (5 rejected -> blocked)
  SELECT count(*) INTO v_rejected_count
  FROM public.task_submissions
  WHERE user_id = v_user_id
    AND task_id = NEW.task_id
    AND status = 'rejected';

  IF v_rejected_count >= 5 THEN
    INSERT INTO public.risk_events (user_id, event_type, description, risk_points, task_id)
    VALUES (v_user_id, 'excessive_rejection',
            'Excessive rejections on task: ' || v_task.title, 20, NEW.task_id);
    PERFORM public.recalculate_risk_score(v_user_id);
    RAISE EXCEPTION 'You have had too many rejections on this task. Please contact support.';
  END IF;

  -- Risk score check (>= 80 -> blocked)
  SELECT risk_score INTO v_risk_score
  FROM public.user_risk_profiles
  WHERE user_id = v_user_id;

  IF v_risk_score IS NOT NULL AND v_risk_score >= 80 THEN
    RAISE EXCEPTION 'Your account is flagged for review. Please contact support to resolve this.';
  END IF;

  RETURN NEW;
end;
$function$;

-- Revoke EXECUTE from anon and authenticated (preserve existing security)
REVOKE EXECUTE ON FUNCTION public.guard_submission_insert() FROM anon, authenticated;
