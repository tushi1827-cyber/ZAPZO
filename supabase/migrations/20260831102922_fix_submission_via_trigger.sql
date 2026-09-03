/*
# Fix task submission via BEFORE INSERT trigger on task_submissions

## Problem
PostgREST schema cache is frozen — cannot see `submit_task_safe` function (PGRST202).
NOTIFY pgrst reload does not work. Even new tables are invisible to PostgREST.
Only objects created in early migrations (OID < ~17731) are visible.

## Solution
The `task_submissions` table was created in migration 002 and IS visible to PostgREST.
Re-add the INSERT RLS policy (dropped in migration 031) so authenticated users can insert.
Add a BEFORE INSERT trigger that runs ALL the same validation logic as submit_task_safe:
- auth check, suspension check, proof validation, image path validation
- task validation (exists, active, not full, date range)
- duplicate submission prevention
- rate limiting (hourly, daily, rapid)
- excessive rejection check
- risk score check
- automatic verification (if configured)
- reward credit, referral qualification, notifications

The trigger runs in the DB engine, NOT through PostgREST RPC, so schema cache is irrelevant.
If validation fails, the trigger raises an exception which prevents the insert and
returns the error message to the frontend.

## Changes
1. Re-add INSERT policy on task_submissions for authenticated users (owner-scoped)
2. Create `validate_task_submission()` trigger function with full validation logic
3. Create `trg_validate_task_submission` BEFORE INSERT trigger
4. The trigger modifies NEW.proof_image_url with the validated path
5. The trigger handles auto-verification inline (same as submit_task_safe)
*/

-- Re-add INSERT policy (was dropped in migration 031)
DROP POLICY IF EXISTS "submissions_insert_own" ON public.task_submissions;
CREATE POLICY "submissions_insert_own"
  ON public.task_submissions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create the validation trigger function with the SAME logic as submit_task_safe
-- This runs as a BEFORE INSERT trigger, so it can modify NEW and raise exceptions
CREATE OR REPLACE FUNCTION public.validate_task_submission()
RETURNS trigger
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
  v_user_id uuid := auth.uid();
  v_image_url text;
  v_auto_result jsonb;
  v_reward numeric;
begin
  -- Must be authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Ensure user_id is set correctly
  NEW.user_id := v_user_id;

  -- Check suspension
  SELECT is_suspended INTO v_suspended FROM public.profiles WHERE id = v_user_id;
  IF v_suspended THEN
    RAISE EXCEPTION 'Your account is suspended. Contact support if you believe this is an error.';
  END IF;

  -- Validate proof text
  IF NEW.proof_text IS NULL OR length(trim(NEW.proof_text)) < 10 THEN
    RAISE EXCEPTION 'Please provide detailed proof (at least 10 characters).';
  END IF;
  NEW.proof_text := trim(NEW.proof_text);

  -- Validate image URL if provided
  -- Path is bucket-relative: <uid>/<filename>.ext
  -- Must start with the user's own UID folder
  IF NEW.proof_image_url IS NOT NULL AND length(trim(NEW.proof_image_url)) > 0 THEN
    v_image_url := trim(NEW.proof_image_url);
    IF v_image_url NOT LIKE v_user_id::text || '/%' THEN
      RAISE EXCEPTION 'Invalid proof image path';
    END IF;
    NEW.proof_image_url := v_image_url;
  ELSE
    NEW.proof_image_url := NULL;
  END IF;

  -- Fetch task
  SELECT * INTO v_task FROM public.tasks WHERE id = NEW.task_id FOR UPDATE;
  IF NOT found THEN
    RAISE EXCEPTION 'Task not found';
  END IF;
  IF v_task.status <> 'active' THEN
    RAISE EXCEPTION 'This task is not currently accepting submissions.';
  END IF;
  IF v_task.approved_count >= v_task.max_completions THEN
    RAISE EXCEPTION 'This task has reached its maximum completions.';
  END IF;

  -- Date validation
  IF v_task.start_date IS NOT NULL AND now() < v_task.start_date THEN
    RAISE EXCEPTION 'This task has not started yet.';
  END IF;
  IF v_task.end_date IS NOT NULL AND now() > v_task.end_date THEN
    UPDATE public.tasks SET status = 'expired' WHERE id = v_task.id;
    RAISE EXCEPTION 'This task has expired and is no longer accepting submissions.';
  END IF;

  -- Check for existing ACTIVE submission (pending or approved)
  SELECT * INTO v_existing FROM public.task_submissions
  WHERE task_id = NEW.task_id AND user_id = v_user_id AND status IN ('pending', 'approved');
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

  -- Rapid submission detection
  SELECT count(*) INTO v_recent_count FROM public.task_submissions
  WHERE user_id = v_user_id AND created_at > now() - interval '2 minutes';
  IF v_recent_count >= 3 THEN
    INSERT INTO public.risk_events (user_id, event_type, description, risk_points)
    VALUES (v_user_id, 'rapid_submission',
      'Rapid submission detected: ' || (v_recent_count + 1) || ' submissions within 2 minutes', 10);
    PERFORM public.recalculate_risk_score(v_user_id);
  END IF;

  -- Excessive rejection check
  SELECT count(*) INTO v_rejected_count FROM public.task_submissions
  WHERE user_id = v_user_id AND task_id = NEW.task_id AND status = 'rejected';
  IF v_rejected_count >= 5 THEN
    INSERT INTO public.risk_events (user_id, event_type, description, risk_points, task_id)
    VALUES (v_user_id, 'excessive_rejection',
      'Excessive rejections on task: ' || v_task.title, 20, NEW.task_id);
    PERFORM public.recalculate_risk_score(v_user_id);
    RAISE EXCEPTION 'You have had too many rejections on this task. Please contact support.';
  END IF;

  -- Check risk score
  SELECT risk_score INTO v_risk_score FROM public.user_risk_profiles WHERE user_id = v_user_id;
  IF v_risk_score IS NOT NULL AND v_risk_score >= 80 THEN
    RAISE EXCEPTION 'Your account is flagged for review. Please contact support to resolve this.';
  END IF;

  -- Set default status
  NEW.status := 'pending';
  NEW.reward_amount := 0;

  RETURN NEW;
end;
$function$;

-- Create AFTER INSERT trigger for auto-verification
CREATE OR REPLACE FUNCTION public.after_task_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_task public.tasks%rowtype;
  v_auto_result jsonb;
  v_reward numeric;
begin
  -- Fetch task for auto-verification config
  SELECT * INTO v_task FROM public.tasks WHERE id = NEW.task_id;

  -- If automatic verification, run it immediately
  IF v_task.verification_type = 'automatic' THEN
    v_auto_result := public.auto_verify_submission(
      NEW.id,
      v_task.auto_verification_config,
      NEW.proof_text,
      NEW.proof_image_url
    );

    UPDATE public.task_submissions
    SET auto_verification_result = v_auto_result, is_auto_verified = true
    WHERE id = NEW.id;

    IF (v_auto_result->>'verified')::boolean = true THEN
      v_reward := v_task.reward;

      UPDATE public.task_submissions
      SET status = 'approved', reward_amount = v_reward, reviewed_at = now(),
        rejection_reason = NULL
      WHERE id = NEW.id;

      UPDATE public.tasks SET approved_count = approved_count + 1 WHERE id = v_task.id;

      IF (SELECT approved_count FROM public.tasks WHERE id = v_task.id) >= v_task.max_completions THEN
        UPDATE public.tasks SET status = 'completed' WHERE id = v_task.id;
      END IF;

      INSERT INTO public.wallet_transactions (user_id, type, amount, status, reference_id, description)
      VALUES (NEW.user_id, 'task_reward', v_reward, 'completed', NEW.id,
        'Task reward (auto-verified): ' || v_task.title);

      INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
      VALUES (NEW.user_id, 'auto_approval', 'submission', NEW.id,
        jsonb_build_object('task_id', v_task.id, 'reward', v_reward, 'result', v_auto_result));

      PERFORM public.qualify_referral_if_eligible(NEW.user_id);

      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (NEW.user_id, 'success', 'Submission Auto-Approved',
        'Your submission for "' || v_task.title || '" was automatically verified and approved. Reward credited to your wallet.',
        '/dashboard/wallet');
    ELSE
      UPDATE public.task_submissions
      SET status = 'rejected', rejection_reason = v_auto_result->>'reason',
        reviewed_at = now()
      WHERE id = NEW.id;

      INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
      VALUES (NEW.user_id, 'auto_rejection', 'submission', NEW.id,
        jsonb_build_object('task_id', v_task.id, 'result', v_auto_result));

      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (NEW.user_id, 'danger', 'Submission Auto-Rejected',
        'Your submission for "' || v_task.title || '" was automatically rejected: ' || (v_auto_result->>'reason'),
        '/dashboard/tasks');
    END IF;
  END IF;

  RETURN NEW;
end;
$function$;

-- Drop old guard trigger (it prevents ALL updates, which is fine for users,
-- but we need the after insert trigger for auto-verification)
-- Keep the guard trigger for updates - it only blocks non-admin updates
-- We just need to add our new triggers

DROP TRIGGER IF EXISTS trg_validate_task_submission ON public.task_submissions;
CREATE TRIGGER trg_validate_task_submission
  BEFORE INSERT ON public.task_submissions
  FOR EACH ROW EXECUTE FUNCTION public.validate_task_submission();

DROP TRIGGER IF EXISTS trg_after_task_submission ON public.task_submissions;
CREATE TRIGGER trg_after_task_submission
  AFTER INSERT ON public.task_submissions
  FOR EACH ROW EXECUTE FUNCTION public.after_task_submission();

-- Clean up the submission_queue table (no longer needed)
DROP TABLE IF EXISTS public.submission_queue CASCADE;

NOTIFY pgrst, 'reload schema';
