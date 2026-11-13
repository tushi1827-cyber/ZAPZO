-- Email queue reliability: database-enforced retry delays, attempt cap,
-- claim ownership tokens, and single-row claiming for send-email.
-- Additive only: no rows are deleted, no existing function signature changes,
-- and enqueue_email / notification dedup keys are untouched.

ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS claim_token uuid;

CREATE INDEX IF NOT EXISTS idx_email_queue_due
  ON public.email_queue (next_attempt_at, created_at)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.email_queue_backoff(p_attempts integer)
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_attempts <= 1 THEN interval '1 minute'
    WHEN p_attempts = 2 THEN interval '5 minutes'
    WHEN p_attempts = 3 THEN interval '15 minutes'
    ELSE interval '60 minutes'
  END;
$$;

CREATE OR REPLACE FUNCTION public.claim_email_queue_batch(p_max integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH claimed AS (
    SELECT id
    FROM public.email_queue
    WHERE status = 'pending'
      AND attempts < 5
      AND next_attempt_at <= now()
    ORDER BY next_attempt_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_max, 1), 50)
  ),
  updated AS (
    UPDATE public.email_queue eq
    SET status = 'processing',
        claimed_at = now(),
        claim_token = gen_random_uuid(),
        attempts = eq.attempts + 1
    FROM claimed
    WHERE eq.id = claimed.id
    RETURNING eq.id, eq.recipient_email, eq.template_name, eq.subject,
              eq.payload, eq.attempts, eq.claim_token
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'recipient_email', recipient_email,
        'template_name', template_name,
        'subject', subject,
        'payload', payload,
        'attempts', attempts,
        'claim_token', claim_token
      )
      ORDER BY id
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM updated;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_email_queue_row(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH claimed AS (
    SELECT id
    FROM public.email_queue
    WHERE id = p_id
      AND status = 'pending'
      AND attempts < 5
      AND next_attempt_at <= now()
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.email_queue eq
    SET status = 'processing',
        claimed_at = now(),
        claim_token = gen_random_uuid(),
        attempts = eq.attempts + 1
    FROM claimed
    WHERE eq.id = claimed.id
    RETURNING eq.id, eq.recipient_email, eq.template_name, eq.subject,
              eq.payload, eq.attempts, eq.claim_token
  )
  SELECT jsonb_build_object(
    'id', id,
    'recipient_email', recipient_email,
    'template_name', template_name,
    'subject', subject,
    'payload', payload,
    'attempts', attempts,
    'claim_token', claim_token
  )
  INTO v_result
  FROM updated;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_email_queue_row_sent(p_id uuid, p_claim_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.email_queue
  SET status = 'sent',
      sent_at = now(),
      last_error = NULL,
      claimed_at = NULL,
      claim_token = NULL
  WHERE id = p_id
    AND status = 'processing'
    AND claim_token = p_claim_token;

  RETURN FOUND;
END;
$$;

-- p_outcome: 'retry' counts the attempt and backs off; 'permanent' fails now;
-- 'config' refunds the attempt because the problem is ours, not the email's.
CREATE OR REPLACE FUNCTION public.release_email_queue_row(
  p_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_error text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_attempts integer;
  v_error text := left(coalesce(nullif(p_error, ''), 'Unknown error'), 500);
BEGIN
  IF p_outcome NOT IN ('retry', 'permanent', 'config') THEN
    RAISE EXCEPTION 'Invalid release outcome: %', p_outcome;
  END IF;

  SELECT attempts INTO v_attempts
  FROM public.email_queue
  WHERE id = p_id
    AND status = 'processing'
    AND claim_token = p_claim_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_owner';
  END IF;

  IF p_outcome = 'permanent' THEN
    UPDATE public.email_queue
    SET status = 'failed', last_error = v_error, claimed_at = NULL, claim_token = NULL
    WHERE id = p_id;
    RETURN 'failed';
  END IF;

  IF p_outcome = 'config' THEN
    UPDATE public.email_queue
    SET status = 'pending',
        attempts = greatest(v_attempts - 1, 0),
        last_error = v_error,
        claimed_at = NULL,
        claim_token = NULL,
        next_attempt_at = now() + interval '5 minutes'
    WHERE id = p_id;
    RETURN 'pending';
  END IF;

  IF v_attempts >= 5 THEN
    UPDATE public.email_queue
    SET status = 'failed', last_error = v_error, claimed_at = NULL, claim_token = NULL
    WHERE id = p_id;
    RETURN 'failed';
  END IF;

  UPDATE public.email_queue
  SET status = 'pending',
      last_error = v_error,
      claimed_at = NULL,
      claim_token = NULL,
      next_attempt_at = now() + public.email_queue_backoff(v_attempts)
  WHERE id = p_id;
  RETURN 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.requeue_stale_email_queue()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_requeued integer := 0;
  v_failed integer := 0;
  v_legacy integer := 0;
BEGIN
  UPDATE public.email_queue
  SET status = 'failed',
      claimed_at = NULL,
      claim_token = NULL,
      last_error = 'Final attempt outcome unknown: worker stopped before reporting a result'
  WHERE status = 'processing'
    AND claimed_at < now() - interval '5 minutes'
    AND attempts >= 5;
  GET DIAGNOSTICS v_failed = ROW_COUNT;

  UPDATE public.email_queue
  SET status = 'pending',
      claimed_at = NULL,
      claim_token = NULL,
      next_attempt_at = now(),
      last_error = COALESCE(last_error, 'Recovered from stale processing claim')
  WHERE status = 'processing'
    AND claimed_at < now() - interval '5 minutes'
    AND attempts < 5;
  GET DIAGNOSTICS v_requeued = ROW_COUNT;

  UPDATE public.email_queue
  SET status = 'failed',
      claim_token = NULL,
      last_error = COALESCE(last_error, 'Max retry attempts exceeded')
  WHERE status = 'pending'
    AND attempts >= 5;
  GET DIAGNOSTICS v_legacy = ROW_COUNT;

  RETURN v_requeued + v_failed + v_legacy;
END;
$$;

REVOKE ALL ON FUNCTION public.email_queue_backoff(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_email_queue_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_email_queue_row(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_email_queue_row_sent(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_email_queue_row(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.requeue_stale_email_queue() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_email_queue_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_email_queue_row(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_email_queue_row_sent(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_email_queue_row(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.requeue_stale_email_queue() TO service_role;
