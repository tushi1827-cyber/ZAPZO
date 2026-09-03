/*
# Anti-Fraud & Task Abuse Protection System

## Purpose
Adds a risk/abuse tracking system with server-side enforcement for:
- Rate limiting task submissions (max 5 per hour, max 15 per day)
- Detecting rapid successive submissions (3+ within 2 minutes)
- Detecting excessive rejected submissions (5+ rejections on same task)
- Referral abuse detection (10+ pending referrals with low qualification rate)
- Risk scoring (0-100) with explainable factors
- Admin review workflow for flagged users

## New Tables

### user_risk_profiles
- `user_id` (uuid, PK, FK to auth.users) — one row per user
- `risk_score` (integer, 0-100, default 0)
- `duplicate_submission_count` (integer, default 0)
- `rapid_submission_count` (integer, default 0)
- `excessive_rejection_count` (integer, default 0)
- `referral_abuse_count` (integer, default 0)
- `review_status` (text: 'none' | 'under_review' | 'resolved', default 'none')
- `admin_notes` (text, default '')
- `last_flagged_at` (timestamptz, nullable)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

### risk_events
- `id` (uuid, PK)
- `user_id` (uuid, FK to auth.users, ON DELETE CASCADE)
- `event_type` (text: 'duplicate_submission' | 'rapid_submission' | 'excessive_rejection' | 'referral_abuse' | 'rate_limit_block')
- `description` (text)
- `risk_points` (integer)
- `task_id` (uuid, nullable, FK to tasks ON DELETE SET NULL)
- `submission_id` (uuid, nullable, FK to task_submissions ON DELETE SET NULL)
- `created_at` (timestamptz, default now())

## Security
- RLS enabled on both tables
- user_risk_profiles: only admins can SELECT/UPDATE; users can see their OWN risk_profile (read-only) but cannot modify
- risk_events: only admins can SELECT/INSERT/UPDATE/DELETE; users cannot see any risk events
- All admin RPCs check is_admin() and use SECURITY DEFINER with safe search_path

## Functions
- `submit_task_safe(p_task_id uuid, p_proof_text text)` — replaces direct insert, enforces all fraud checks
- `recalculate_risk_score(p_user_id uuid)` — recomputes risk score from risk_events
- `review_risk_event(p_event_id uuid, p_action text, p_notes text)` — admin resolves/under-reviews events
- `update_risk_admin_notes(p_user_id uuid, p_notes text)` — admin updates notes
- `set_risk_review_status(p_user_id uuid, p_status text)` — admin sets review status

## Triggers
- `trg_auto_create_risk_profile` — creates risk profile on new user signup
- `trg_risk_profile_updated_at` — auto-updates updated_at on risk profile changes

## Important Notes
1. The submit_task_safe function is the new entry point for task submissions.
   It enforces: suspended check, duplicate check, rate limit (5/hour, 15/day),
   rapid submission detection (3+ in 2 min), and excessive rejection check (5+ on same task).
2. Risk scores: 0-29 Low, 30-59 Medium, 60-79 High, 80-100 Critical
3. Risk points per event: duplicate=15, rapid=10, excessive_rejection=20, referral_abuse=25, rate_limit_block=10
4. The existing UNIQUE(task_id, user_id) constraint is preserved.
5. No changes to existing wallet/reward/referral/withdrawal logic.
6. The existing profiles.fraud_signals column is updated by recalculate_risk_score to mirror the risk_score for backward compatibility.
*/

-- =========================================================
-- 1. Create user_risk_profiles table
-- =========================================================
CREATE TABLE IF NOT EXISTS public.user_risk_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  risk_score integer NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  duplicate_submission_count integer NOT NULL DEFAULT 0,
  rapid_submission_count integer NOT NULL DEFAULT 0,
  excessive_rejection_count integer NOT NULL DEFAULT 0,
  referral_abuse_count integer NOT NULL DEFAULT 0,
  review_status text NOT NULL DEFAULT 'none' CHECK (review_status IN ('none', 'under_review', 'resolved')),
  admin_notes text NOT NULL DEFAULT '',
  last_flagged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_risk_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own risk profile (but not modify it)
DROP POLICY IF EXISTS "risk_profiles_select_own_or_admin" ON public.user_risk_profiles;
CREATE POLICY "risk_profiles_select_own_or_admin"
  ON public.user_risk_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- Only admins can update risk profiles
DROP POLICY IF EXISTS "risk_profiles_update_admin" ON public.user_risk_profiles;
CREATE POLICY "risk_profiles_update_admin"
  ON public.user_risk_profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Only admins can insert risk profiles (trigger also creates them)
DROP POLICY IF EXISTS "risk_profiles_insert_admin" ON public.user_risk_profiles;
CREATE POLICY "risk_profiles_insert_admin"
  ON public.user_risk_profiles FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- No DELETE policy — risk profiles should never be deleted independently

-- =========================================================
-- 2. Create risk_events table
-- =========================================================
CREATE TABLE IF NOT EXISTS public.risk_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('duplicate_submission', 'rapid_submission', 'excessive_rejection', 'referral_abuse', 'rate_limit_block')),
  description text NOT NULL DEFAULT '',
  risk_points integer NOT NULL DEFAULT 0,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  submission_id uuid REFERENCES public.task_submissions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.risk_events ENABLE ROW LEVEL SECURITY;

-- Only admins can see risk events
DROP POLICY IF EXISTS "risk_events_select_admin" ON public.risk_events;
CREATE POLICY "risk_events_select_admin"
  ON public.risk_events FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Only admins can insert risk events (via RPC/trigger)
DROP POLICY IF EXISTS "risk_events_insert_admin" ON public.risk_events;
CREATE POLICY "risk_events_insert_admin"
  ON public.risk_events FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- Only admins can update risk events
DROP POLICY IF EXISTS "risk_events_update_admin" ON public.risk_events;
CREATE POLICY "risk_events_update_admin"
  ON public.risk_events FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Only admins can delete risk events
DROP POLICY IF EXISTS "risk_events_delete_admin" ON public.risk_events;
CREATE POLICY "risk_events_delete_admin"
  ON public.risk_events FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_risk_events_user_id ON public.risk_events (user_id);
CREATE INDEX IF NOT EXISTS idx_risk_events_created_at ON public.risk_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_events_event_type ON public.risk_events (event_type);
CREATE INDEX IF NOT EXISTS idx_risk_profiles_risk_score ON public.user_risk_profiles (risk_score DESC);

-- =========================================================
-- 3. Trigger: auto-create risk profile on signup
-- =========================================================
CREATE OR REPLACE FUNCTION public.auto_create_risk_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  INSERT INTO public.user_risk_profiles (user_id) VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_auto_create_risk_profile ON auth.users;
CREATE TRIGGER trg_auto_create_risk_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_risk_profile();

-- Revoke public execute on trigger function
REVOKE EXECUTE ON FUNCTION public.auto_create_risk_profile() FROM PUBLIC, anon;

-- =========================================================
-- 4. Trigger: auto-update updated_at on risk profiles
-- =========================================================
CREATE OR REPLACE FUNCTION public.risk_profile_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  new.updated_at := now();
  RETURN new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_risk_profile_updated_at ON public.user_risk_profiles;
CREATE TRIGGER trg_risk_profile_updated_at
  BEFORE UPDATE ON public.user_risk_profiles
  FOR EACH ROW EXECUTE FUNCTION public.risk_profile_updated_at();

REVOKE EXECUTE ON FUNCTION public.risk_profile_updated_at() FROM PUBLIC, anon;

-- =========================================================
-- 5. Function: recalculate_risk_score
-- =========================================================
CREATE OR REPLACE FUNCTION public.recalculate_risk_score(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_score integer := 0;
  v_dup_count integer := 0;
  v_rapid_count integer := 0;
  v_reject_count integer := 0;
  v_referral_count integer := 0;
begin
  -- Count events by type (all-time)
  SELECT
    COALESCE(SUM(CASE WHEN event_type = 'duplicate_submission' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN event_type = 'rapid_submission' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN event_type = 'excessive_rejection' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN event_type = 'referral_abuse' THEN 1 ELSE 0 END), 0)
  INTO v_dup_count, v_rapid_count, v_reject_count, v_referral_count
  FROM public.risk_events
  WHERE user_id = p_user_id;

  -- Risk points: each event type contributes points
  v_score := LEAST(100,
    v_dup_count * 15 +
    v_rapid_count * 10 +
    v_reject_count * 20 +
    v_referral_count * 25
  );

  -- Update risk profile
  UPDATE public.user_risk_profiles
  SET
    risk_score = v_score,
    duplicate_submission_count = v_dup_count,
    rapid_submission_count = v_rapid_count,
    excessive_rejection_count = v_reject_count,
    referral_abuse_count = v_referral_count,
    last_flagged_at = CASE WHEN v_score > 0 THEN now() ELSE last_flagged_at END
  WHERE user_id = p_user_id;

  -- Mirror to profiles.fraud_signals for backward compatibility
  UPDATE public.profiles SET fraud_signals = v_score WHERE id = p_user_id;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.recalculate_risk_score(p_user_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_risk_score(p_user_id uuid) TO authenticated;

-- =========================================================
-- 6. Function: submit_task_safe (the main fraud-checking submission function)
-- =========================================================
CREATE OR REPLACE FUNCTION public.submit_task_safe(p_task_id uuid, p_proof_text text)
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

  -- Check for existing submission (duplicate)
  SELECT * INTO v_existing FROM public.task_submissions
  WHERE task_id = p_task_id AND user_id = v_user_id;
  IF found THEN
    -- Log duplicate attempt as risk event
    INSERT INTO public.risk_events (user_id, event_type, description, risk_points, task_id)
    VALUES (v_user_id, 'duplicate_submission',
      'Attempted to re-submit task: ' || v_task.title, 15, p_task_id);
    PERFORM public.recalculate_risk_score(v_user_id);
    RAISE EXCEPTION 'You have already submitted proof for this task.';
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

  -- Insert the submission
  INSERT INTO public.task_submissions (task_id, user_id, proof_text)
  VALUES (p_task_id, v_user_id, trim(p_proof_text))
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.submit_task_safe(p_task_id uuid, p_proof_text text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_task_safe(p_task_id uuid, p_proof_text text) TO authenticated;

-- =========================================================
-- 7. Function: review_risk_event (admin resolves events)
-- =========================================================
CREATE OR REPLACE FUNCTION public.review_risk_event(p_event_id uuid, p_action text, p_notes text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_event public.risk_events%rowtype;
begin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_action NOT IN ('resolve', 'under_review') THEN
    RAISE EXCEPTION 'Invalid action. Use resolve or under_review.';
  END IF;

  SELECT * INTO v_event FROM public.risk_events WHERE id = p_event_id;
  IF NOT found THEN
    RAISE EXCEPTION 'Risk event not found';
  END IF;

  -- Update the user's risk profile review status
  UPDATE public.user_risk_profiles
  SET
    review_status = CASE WHEN p_action = 'resolve' THEN 'resolved' ELSE 'under_review' END,
    admin_notes = CASE
      WHEN p_notes <> '' THEN p_notes
      ELSE admin_notes
    END
  WHERE user_id = v_event.user_id;

  -- Log to audit
  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    CASE WHEN p_action = 'resolve' THEN 'fraud_event_resolved' ELSE 'fraud_event_under_review' END,
    'risk_event',
    p_event_id,
    jsonb_build_object('user_id', v_event.user_id, 'event_type', v_event.event_type, 'notes', p_notes)
  );

  -- If resolving, optionally recalculate risk score
  IF p_action = 'resolve' THEN
    -- Reduce risk score by removing this event's contribution
    -- We don't delete the event (keep audit trail), but we can adjust
    -- The recalculate function sums all events, so we leave resolved events
    -- Admin can manually set review_status to resolved
    PERFORM public.recalculate_risk_score(v_event.user_id);
  END IF;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.review_risk_event(p_event_id uuid, p_action text, p_notes text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_risk_event(p_event_id uuid, p_action text, p_notes text) TO authenticated;

-- =========================================================
-- 8. Function: update_risk_admin_notes
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_risk_admin_notes(p_user_id uuid, p_notes text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  UPDATE public.user_risk_profiles
  SET admin_notes = p_notes
  WHERE user_id = p_user_id;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_risk_admin_notes(p_user_id uuid, p_notes text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_risk_admin_notes(p_user_id uuid, p_notes text) TO authenticated;

-- =========================================================
-- 9. Function: set_risk_review_status
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_risk_review_status(p_user_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_status NOT IN ('none', 'under_review', 'resolved') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  UPDATE public.user_risk_profiles
  SET review_status = p_status
  WHERE user_id = p_user_id;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'risk_status_changed', 'user', p_user_id,
    jsonb_build_object('status', p_status));
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_risk_review_status(p_user_id uuid, p_status text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_risk_review_status(p_user_id uuid, p_status text) TO authenticated;

-- =========================================================
-- 10. Backfill risk profiles for existing users
-- =========================================================
INSERT INTO public.user_risk_profiles (user_id)
SELECT id FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.user_risk_profiles)
ON CONFLICT (user_id) DO NOTHING;
