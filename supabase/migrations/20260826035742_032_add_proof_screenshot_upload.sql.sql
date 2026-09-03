/*
# Add screenshot/image upload support for task submissions

## Changes
1. Add `proof_image_url` column to `task_submissions` (nullable — image is optional but recommended)
2. Create `task-proofs` storage bucket (private, 5MB limit, image MIME types only)
3. Storage policies: users can upload to their own folder, read their own; admins can read all
4. Update `submit_task_safe` to accept optional `p_proof_image_url` parameter
5. No INSERT RLS policy added on task_submissions — submissions still go through submit_task_safe only
6. All existing anti-fraud logic preserved exactly

## Security
- Storage bucket is private (not public) — URLs require signed access or auth
- Users can only upload to `task-proofs/<their-uid>/` path
- Users can only read their own proof images
- Admins can read all proof images
- task_submissions RLS unchanged — no direct INSERT policy
- submit_task_safe remains SECURITY DEFINER with all fraud checks intact
*/

-- 1. Add proof_image_url column to task_submissions
ALTER TABLE public.task_submissions
  ADD COLUMN IF NOT EXISTS proof_image_url text;

-- 2. Create storage bucket for task proof screenshots
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-proofs',
  'task-proofs',
  false,
  5242880,  -- 5MB
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage policies for task-proofs bucket
-- Users can upload files to their own folder: task-proofs/<uid>/
DROP POLICY IF EXISTS "task_proofs_insert_own" ON storage.objects;
CREATE POLICY "task_proofs_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'task-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can read their own proof images
DROP POLICY IF EXISTS "task_proofs_select_own_or_admin" ON storage.objects;
CREATE POLICY "task_proofs_select_own_or_admin"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'task-proofs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

-- Users can delete their own proof images (for replace/remove)
DROP POLICY IF EXISTS "task_proofs_delete_own" ON storage.objects;
CREATE POLICY "task_proofs_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'task-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admins can delete any proof image
DROP POLICY IF EXISTS "task_proofs_delete_admin" ON storage.objects;
CREATE POLICY "task_proofs_delete_admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'task-proofs'
    AND public.is_admin()
  );

-- 4. Update submit_task_safe to accept optional proof_image_url
--    Re-creates the function with the additional parameter.
--    ALL existing anti-fraud logic is preserved exactly.
CREATE OR REPLACE FUNCTION public.submit_task_safe(
  p_task_id uuid,
  p_proof_text text,
  p_proof_image_url text DEFAULT NULL
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

  -- Insert the submission (with optional image URL)
  INSERT INTO public.task_submissions (task_id, user_id, proof_text, proof_image_url)
  VALUES (p_task_id, v_user_id, trim(p_proof_text), v_image_url)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.submit_task_safe(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_task_safe(uuid, text, text) TO authenticated;
