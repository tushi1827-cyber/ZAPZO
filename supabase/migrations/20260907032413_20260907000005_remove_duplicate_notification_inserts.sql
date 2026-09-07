/*
# Remove duplicate notification inserts from business functions

## Summary
The business functions approve_task_submission, reject_task_submission, submit_task_safe,
and review_withdrawal all had direct INSERT INTO notifications statements. Now that the
trigger functions handle all notifications with proper dedup and richer messages, these
direct inserts cause duplicate notifications. This migration removes them.

Also adds a missing is_admin() check to review_withdrawal for security.

## 1. Modified Functions
- approve_task_submission — removed direct notification INSERT (trigger handles it)
- reject_task_submission — removed direct notification INSERT (trigger handles it)
- submit_task_safe — removed direct notification INSERTs for auto-approve and auto-reject (trigger handles it)
- review_withdrawal — removed direct notification INSERT (trigger handles it) + added is_admin() check

## 2. Security
- review_withdrawal now requires admin access (was previously callable by any authenticated user)
- All functions remain SECURITY DEFINER with search_path = public

## 3. Important Notes
1. No tables or columns changed
2. No existing data modified
3. Triggers on task_submissions, withdrawals, referrals, and wallet_transactions now handle ALL notifications
4. The unique index on (user_id, type, related_id) prevents any remaining duplicates
*/

-- Recreate approve_task_submission without direct notification insert
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

  -- Notification handled by trg_notify_submission trigger
end;
$function$;

-- Recreate reject_task_submission without direct notification insert
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

  -- Notification handled by trg_notify_submission trigger
end;
$function$;

-- Recreate review_withdrawal with admin check, without direct notification insert
CREATE OR REPLACE FUNCTION public.review_withdrawal(p_withdrawal_id uuid, p_status text, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  UPDATE public.withdrawals
  SET status = p_status,
      reviewed_at = now(),
      rejection_reason = CASE WHEN p_status = 'rejected' THEN p_reason ELSE NULL END
  WHERE id = p_withdrawal_id;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'review_withdrawal', 'withdrawal', p_withdrawal_id,
  jsonb_build_object('status', p_status, 'reason', p_reason));

  -- Notification handled by trg_notify_withdrawal trigger
end;
$function$;

-- Recreate submit_task_safe without direct notification inserts
CREATE OR REPLACE FUNCTION public.submit_task_safe(p_task_id uuid, p_proof_text text, p_proof_image_url text)
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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT is_suspended INTO v_suspended FROM public.profiles WHERE id = v_user_id;
  IF v_suspended THEN
    RAISE EXCEPTION 'Your account is suspended. Contact support if you believe this is an error.';
  END IF;

  IF length(trim(p_proof_text)) < 10 THEN
    RAISE EXCEPTION 'Please provide detailed proof (at least 10 characters).';
  END IF;

  IF p_proof_image_url IS NOT NULL AND length(trim(p_proof_image_url)) > 0 THEN
    v_image_url := trim(p_proof_image_url);
    IF v_image_url NOT LIKE v_user_id::text || '/%' THEN
      RAISE EXCEPTION 'Invalid proof image path';
    END IF;
  ELSE
    v_image_url := NULL;
  END IF;

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

  IF v_task.start_date IS NOT NULL AND now() < v_task.start_date THEN
    RAISE EXCEPTION 'This task has not started yet.';
  END IF;
  IF v_task.end_date IS NOT NULL AND now() > v_task.end_date THEN
    UPDATE public.tasks SET status = 'expired' WHERE id = v_task.id;
    RAISE EXCEPTION 'This task has expired and is no longer accepting submissions.';
  END IF;

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

  SELECT count(*) INTO v_hourly_count FROM public.task_submissions
  WHERE user_id = v_user_id AND created_at > now() - interval '1 hour';
  IF v_hourly_count >= 5 THEN
    INSERT INTO public.risk_events (user_id, event_type, description, risk_points)
    VALUES (v_user_id, 'rate_limit_block',
    'Blocked: ' || v_hourly_count || ' submissions in the last hour', 10);
    PERFORM public.recalculate_risk_score(v_user_id);
    RAISE EXCEPTION 'You have submitted too many tasks recently. Please wait a while before trying again.';
  END IF;

  SELECT count(*) INTO v_daily_count FROM public.task_submissions
  WHERE user_id = v_user_id AND created_at > now() - interval '24 hours';
  IF v_daily_count >= 15 THEN
    INSERT INTO public.risk_events (user_id, event_type, description, risk_points)
    VALUES (v_user_id, 'rate_limit_block',
    'Blocked: ' || v_daily_count || ' submissions in the last 24 hours', 10);
    PERFORM public.recalculate_risk_score(v_user_id);
    RAISE EXCEPTION 'Daily submission limit reached. Please try again tomorrow.';
  END IF;

  SELECT count(*) INTO v_recent_count FROM public.task_submissions
  WHERE user_id = v_user_id AND created_at > now() - interval '2 minutes';
  IF v_recent_count >= 3 THEN
    INSERT INTO public.risk_events (user_id, event_type, description, risk_points)
    VALUES (v_user_id, 'rapid_submission',
    'Rapid submission detected: ' || (v_recent_count + 1) || ' submissions within 2 minutes', 10);
    PERFORM public.recalculate_risk_score(v_user_id);
  END IF;

  SELECT count(*) INTO v_rejected_count FROM public.task_submissions
  WHERE user_id = v_user_id AND task_id = p_task_id AND status = 'rejected';
  IF v_rejected_count >= 5 THEN
    INSERT INTO public.risk_events (user_id, event_type, description, risk_points, task_id)
    VALUES (v_user_id, 'excessive_rejection',
    'Excessive rejections on task: ' || v_task.title, 20, p_task_id);
    PERFORM public.recalculate_risk_score(v_user_id);
    RAISE EXCEPTION 'You have had too many rejections on this task. Please contact support.';
  END IF;

  SELECT risk_score INTO v_risk_score FROM public.user_risk_profiles WHERE user_id = v_user_id;
  IF v_risk_score IS NOT NULL AND v_risk_score >= 80 THEN
    RAISE EXCEPTION 'Your account is flagged for review. Please contact support to resolve this.';
  END IF;

  INSERT INTO public.task_submissions (task_id, user_id, proof_text, proof_image_url)
  VALUES (p_task_id, v_user_id, trim(p_proof_text), v_image_url)
  RETURNING id INTO v_new_id;

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

      -- Notifications handled by triggers
    ELSE
      UPDATE public.task_submissions
      SET status = 'rejected', rejection_reason = v_auto_result->>'reason',
      reviewed_at = now()
      WHERE id = v_new_id;

      INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
      VALUES (v_user_id, 'auto_rejection', 'submission', v_new_id,
      jsonb_build_object('task_id', v_task.id, 'result', v_auto_result));

      -- Notification handled by trigger
    END IF;
  END IF;

  RETURN v_new_id;
end;
$function$;

-- Preserve grants
GRANT EXECUTE ON FUNCTION public.approve_task_submission(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_task_submission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_withdrawal(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_task_safe(uuid, text, text) TO authenticated;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
