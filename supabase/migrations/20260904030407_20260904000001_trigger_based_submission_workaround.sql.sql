-- ──────────────────────────────────────────────────────────────────────────────
-- Trigger-based workaround for PostgREST schema cache freeze
--
-- PostgREST 14.5 cannot see submit_task_safe (PGRST202) or the
-- notifications/risk_events/user_risk_profiles tables (PGRST205).
-- This migration adds database-level triggers that enforce the exact
-- same validation and side-effects as submit_task_safe, allowing the
-- frontend to INSERT directly into task_submissions.
--
-- DOUBLE-EXECUTION PREVENTION:
--   Both trigger functions use GET DIAGNOSTICS PG_CONTEXT to detect
--   whether the INSERT originated from submit_task_safe. If so, the
--   triggers skip all logic because submit_task_safe already handles
--   validation, auto-verification, wallet crediting, and notifications.
--   This makes the workaround safe BOTH:
--     1. While submit_task_safe is invisible (frontend uses direct INSERT)
--     2. After PostgREST is fixed and submit_task_safe becomes visible
--
-- SAFETY PRINCIPLES:
--   - submit_task_safe is NOT modified, dropped, or recreated.
--   - No existing RLS policies, triggers, or functions are modified.
--   - New trigger functions are SECURITY DEFINER (run as postgres).
--   - Reuses auto_verify_submission, recalculate_risk_score, and
--     qualify_referral_if_eligible — no logic duplication for those.
--   - The existing partial unique index
--     task_submissions_one_active_per_user_task prevents duplicate
--     pending/approved submissions at the storage level.
--   - Forces created_at/updated_at to now() to prevent timestamp
--     manipulation that could bypass rate limits.
-- ──────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. INSERT RLS policy on task_submissions
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "submissions_insert_own"
  ON public.task_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. BEFORE INSERT trigger function: guard_submission_insert()
-- ═══════════════════════════════════════════════════════════════════════════
-- Replicates ALL pre-INSERT validation from submit_task_safe.
-- Skips entirely if the INSERT originated from submit_task_safe
-- (detected via PG_CONTEXT call stack inspection).

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
  -- ── Double-execution guard: skip if submit_task_safe is the caller ──
  -- submit_task_safe already performs all validation before its INSERT,
  -- so we must not re-validate or insert risk events.
  GET DIAGNOSTICS v_call_context = PG_CONTEXT;
  IF v_call_context LIKE '%function submit_task_safe(%' THEN
    RETURN NEW;
  END IF;

  -- ── Authentication ──
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- ── Force safe column values (prevent client manipulation) ──
  NEW.user_id                  := v_user_id;
  NEW.status                   := 'pending';
  NEW.reward_amount            := 0;
  NEW.reviewed_by              := NULL;
  NEW.reviewed_at              := NULL;
  NEW.is_auto_verified         := false;
  NEW.auto_verification_result := NULL;
  NEW.created_at               := now();
  NEW.updated_at               := now();

  -- ── Suspended user check ──
  SELECT is_suspended INTO v_suspended
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_suspended THEN
    RAISE EXCEPTION 'Your account is suspended. Contact support if you believe this is an error.';
  END IF;

  -- ── Proof text validation ──
  IF length(trim(COALESCE(NEW.proof_text, ''))) < 10 THEN
    RAISE EXCEPTION 'Please provide detailed proof (at least 10 characters).';
  END IF;
  NEW.proof_text := trim(NEW.proof_text);

  -- ── Proof image path ownership validation ──
  IF NEW.proof_image_url IS NOT NULL AND length(trim(NEW.proof_image_url)) > 0 THEN
    v_image_url := trim(NEW.proof_image_url);
    IF v_image_url NOT LIKE v_user_id::text || '/%' THEN
      RAISE EXCEPTION 'Invalid proof image path';
    END IF;
    NEW.proof_image_url := v_image_url;
  ELSE
    NEW.proof_image_url := NULL;
  END IF;

  -- ── Task validation (FOR UPDATE locks row to serialize concurrent submissions) ──
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

  -- ── Duplicate submission check (soft check; hard backstop is the
  --    partial unique index task_submissions_one_active_per_user_task) ──
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

  -- ── Hourly rate limit (max 5 per hour) ──
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

  -- ── Daily rate limit (max 15 per 24 hours) ──
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

  -- ── Rapid submission detection (3 in 2 minutes — logged but not blocked) ──
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

  -- ── Excessive rejections on same task (5 rejected → blocked) ──
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

  -- ── Risk score check (>= 80 → blocked) ──
  SELECT risk_score INTO v_risk_score
  FROM public.user_risk_profiles
  WHERE user_id = v_user_id;

  IF v_risk_score IS NOT NULL AND v_risk_score >= 80 THEN
    RAISE EXCEPTION 'Your account is flagged for review. Please contact support to resolve this.';
  END IF;

  RETURN NEW;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. AFTER INSERT trigger function: process_submission_after_insert()
-- ═══════════════════════════════════════════════════════════════════════════
-- Handles automatic verification when task.verification_type = 'automatic'.
-- Skips entirely if the INSERT originated from submit_task_safe
-- (detected via PG_CONTEXT call stack inspection), because submit_task_safe
-- does its own auto-verification, wallet crediting, and notifications.
--
-- Reuses existing SECURITY DEFINER functions — NO logic duplication:
--   - auto_verify_submission()         → verification logic
--   - qualify_referral_if_eligible()   → referral reward crediting

CREATE OR REPLACE FUNCTION public.process_submission_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_call_context  text;
  v_task          public.tasks%rowtype;
  v_auto_result   jsonb;
  v_reward        numeric;
begin
  -- ── Double-execution guard: skip if submit_task_safe is the caller ──
  -- submit_task_safe performs its own auto-verification, wallet crediting,
  -- referral qualification, and notifications after the INSERT. If we also
  -- ran, it would cause double rewards, double approved_count, double
  -- referrals, and duplicate notifications.
  GET DIAGNOSTICS v_call_context = PG_CONTEXT;
  IF v_call_context LIKE '%function submit_task_safe(%' THEN
    RETURN NEW;
  END IF;

  -- ── Load task with row lock ──
  SELECT * INTO v_task
  FROM public.tasks
  WHERE id = NEW.task_id
  FOR UPDATE;

  IF NOT found THEN
    RETURN NEW;
  END IF;

  -- ── Only process automatic verification ──
  IF v_task.verification_type <> 'automatic' THEN
    RETURN NEW;
  END IF;

  -- ── Run automatic verification (reuses existing function) ──
  v_auto_result := public.auto_verify_submission(
    NEW.id,
    v_task.auto_verification_config,
    NEW.proof_text,
    NEW.proof_image_url
  );

  -- ── Store verification result ──
  UPDATE public.task_submissions
  SET auto_verification_result = v_auto_result,
      is_auto_verified = true
  WHERE id = NEW.id;

  IF (v_auto_result->>'verified')::boolean = true THEN
    -- ── Auto-approved ──
    v_reward := v_task.reward;

    UPDATE public.task_submissions
    SET status          = 'approved',
        reward_amount   = v_reward,
        reviewed_at     = now(),
        rejection_reason = NULL
    WHERE id = NEW.id;

    UPDATE public.tasks
    SET approved_count = approved_count + 1
    WHERE id = v_task.id;

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
    -- ── Auto-rejected ──
    UPDATE public.task_submissions
    SET status           = 'rejected',
        rejection_reason = v_auto_result->>'reason',
        reviewed_at      = now()
    WHERE id = NEW.id;

    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
    VALUES (NEW.user_id, 'auto_rejection', 'submission', NEW.id,
            jsonb_build_object('task_id', v_task.id, 'result', v_auto_result));

    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (NEW.user_id, 'danger', 'Submission Auto-Rejected',
            'Your submission for "' || v_task.title || '" was automatically rejected: ' || (v_auto_result->>'reason'),
            '/dashboard/tasks');
  END IF;

  RETURN NEW;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Attach triggers to task_submissions
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TRIGGER trg_guard_submission_insert
  BEFORE INSERT ON public.task_submissions
  FOR EACH ROW EXECUTE FUNCTION public.guard_submission_insert();

CREATE TRIGGER trg_process_submission_after_insert
  AFTER INSERT ON public.task_submissions
  FOR EACH ROW EXECUTE FUNCTION public.process_submission_after_insert();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Revoke EXECUTE on trigger functions from anon and authenticated
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.guard_submission_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_submission_after_insert() FROM anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Best-effort PostgREST schema reload
-- ═══════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';
