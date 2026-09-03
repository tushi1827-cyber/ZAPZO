
-- Recreate submit_task_safe with exact same signature and body
-- This migration forces a schema cache reload by DROP + CREATE
-- The function was previously recreated but PostgREST schema cache was stale

-- First, drop the existing function
DROP FUNCTION IF EXISTS public.submit_task_safe(uuid, text, text);

-- Recreate with exact same signature - no DEFAULT arguments
CREATE OR REPLACE FUNCTION public.submit_task_safe(
  p_task_id uuid,
  p_proof_text text,
  p_proof_image_url text
)
RETURNS uuid
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
  v_auto_result jsonb;
  v_reward numeric;
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

  -- Validate image URL if provided
  -- Path is bucket-relative: <uid>/<filename>.ext
  -- Must start with the user's own UID folder
  IF p_proof_image_url IS NOT NULL AND length(trim(p_proof_image_url)) > 0 THEN
    v_image_url := trim(p_proof_image_url);
    IF v_image_url NOT LIKE v_user_id::text || '/%' THEN
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

  -- Date validation: check task is within its active date range
  IF v_task.start_date IS NOT NULL AND now() < v_task.start_date THEN
    RAISE EXCEPTION 'This task has not started yet.';
  END IF;
  IF v_task.end_date IS NOT NULL AND now() > v_task.end_date THEN
    UPDATE public.tasks SET status = 'expired' WHERE id = v_task.id;
    RAISE EXCEPTION 'This task has expired and is no longer accepting submissions.';
  END IF;

  -- Check for existing ACTIVE submission (pending or approved)
  SELECT * INTO v_existing FROM public.task_submissions
  WHERE task_id = p_task_id AND user_id = v_user_id AND status IN ('pending', 'approved');
  IF found THEN
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
  WHERE user_id = v_user_id AND task_id = p_task_id AND status = 'rejected';
  IF v_rejected_count >= 5 THEN
    INSERT INTO public.risk_events (user_id, event_type, description, risk_points, task_id)
    VALUES (v_user_id, 'excessive_rejection',
      'Excessive rejections on task: ' || v_task.title, 20, p_task_id);
    PERFORM public.recalculate_risk_score(v_user_id);
    RAISE EXCEPTION 'You have had too many rejections on this task. Please contact support.';
  END IF;

  -- Check risk score
  SELECT risk_score INTO v_risk_score FROM public.user_risk_profiles WHERE user_id = v_user_id;
  IF v_risk_score IS NOT NULL AND v_risk_score >= 80 THEN
    RAISE EXCEPTION 'Your account is flagged for review. Please contact support to resolve this.';
  END IF;

  -- Insert the submission
  INSERT INTO public.task_submissions (task_id, user_id, proof_text, proof_image_url)
  VALUES (p_task_id, v_user_id, trim(p_proof_text), v_image_url)
  RETURNING id INTO v_new_id;

  -- If automatic verification, run it immediately
  IF v_task.verification_type = 'automatic' THEN
    v_auto_result := public.auto_verify_submission(
      v_new_id,
      v_task.auto_verification_config,
      trim(p_proof_text),
      v_image_url
    );

    UPDATE public.task_submissions
    SET auto_verification_result = v_auto_result, is_auto_verified = true
    WHERE id = v_new_id;

    IF (v_auto_result->>'verified')::boolean = true THEN
      v_reward := v_task.reward;

      UPDATE public.task_submissions
      SET status = 'approved', reward_amount = v_reward, reviewed_at = now(),
        rejection_reason = NULL
      WHERE id = v_new_id;

      UPDATE public.tasks SET approved_count = approved_count + 1 WHERE id = v_task.id;

      IF (SELECT approved_count FROM public.tasks WHERE id = v_task.id) >= v_task.max_completions THEN
        UPDATE public.tasks SET status = 'completed' WHERE id = v_task.id;
      END IF;

      INSERT INTO public.wallet_transactions (user_id, type, amount, status, reference_id, description)
      VALUES (v_user_id, 'task_reward', v_reward, 'completed', v_new_id,
        'Task reward (auto-verified): ' || v_task.title);

      INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
      VALUES (v_user_id, 'auto_approval', 'submission', v_new_id,
        jsonb_build_object('task_id', v_task.id, 'reward', v_reward, 'result', v_auto_result));

      PERFORM public.qualify_referral_if_eligible(v_user_id);

      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (v_user_id, 'success', 'Submission Auto-Approved',
        'Your submission for "' || v_task.title || '" was automatically verified and approved. Reward credited to your wallet.',
        '/dashboard/wallet');
    ELSE
      UPDATE public.task_submissions
      SET status = 'rejected', rejection_reason = v_auto_result->>'reason',
        reviewed_at = now()
      WHERE id = v_new_id;

      INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
      VALUES (v_user_id, 'auto_rejection', 'submission', v_new_id,
        jsonb_build_object('task_id', v_task.id, 'result', v_auto_result));

      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (v_user_id, 'danger', 'Submission Auto-Rejected',
        'Your submission for "' || v_task.title || '" was automatically rejected: ' || (v_auto_result->>'reason'),
        '/dashboard/tasks');
    END IF;
  END IF;

  RETURN v_new_id;
end;
$function$;

-- Grant execute to authenticated and anon (matching original permissions)
-- anon was granted in the original function, authenticated is the primary user
GRANT EXECUTE ON FUNCTION public.submit_task_safe(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_task_safe(uuid, text, text) TO anon;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
