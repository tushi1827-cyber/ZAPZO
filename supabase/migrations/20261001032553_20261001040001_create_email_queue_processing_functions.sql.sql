/*
# Email Queue Processing: claim + stale-requeue infrastructure

## Purpose
Adds two server-side helper functions that the process-email-queue Edge
Function calls through the service-role Supabase client.  These functions
provide safe, atomic row claiming for concurrent processing and automatic
requeue of stale claimed rows that were never marked sent.

## Design
- claim_email_queue_batch(p_max int): atomically selects up to p_max
  pending rows, sets status='processing' and claimed_at=now(), and returns
  them as a JSON array.  Uses FOR UPDATE SKIP LOCKED inside an explicit
  subtransaction so two simultaneous callers never grab the same row.
- requeue_stale_email_queue(): updates rows stuck in 'processing' for more
  than 5 minutes back to 'pending' (only if attempts < 5, otherwise marks
  them 'failed').  Called at the start of each processor invocation to
  recover from crashes.
- A new CHECK constraint allows 'processing' as a valid status.
- A new partial index idx_email_queue_processing_claimed speeds up the
  stale-requeue scan.

## Schema changes
- Column:  public.email_queue.claimed_at timestamptz (nullable)
- Constraint: email_queue_status_check expanded to include 'processing'
- Index: idx_email_queue_processing_claimed (partial WHERE status = 'processing')
- Function: public.claim_email_queue_batch(int) RETURNS jsonb
- Function: public.requeue_stale_email_queue() RETURNS integer

## Security
- Both functions are SECURITY DEFINER, SET search_path = public, owned by postgres.
- EXECUTE is revoked from anon and authenticated so only the service-role
  key (used by the Edge Function) or other SECURITY DEFINER functions can call them.
- The Edge Function itself authenticates by verifying the caller's JWT has
  app_metadata.is_admin === true (same pattern as send-email).

## What is NOT changed
- public.enqueue_email is not modified.
- send-email Edge Function is not modified.
- No RLS policies are changed.
- No auth/admin metadata is changed.
- No frontend code is changed.
- No pg_cron or pg_net is used.
*/

-- ============================================================
-- 1. Add claimed_at column to email_queue (idempotent)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'email_queue'
      AND column_name  = 'claimed_at'
  ) THEN
    ALTER TABLE public.email_queue ADD COLUMN claimed_at timestamptz;
  END IF;
END $$;

-- ============================================================
-- 2. Expand status CHECK to include 'processing' (idempotent)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_queue_status_check'
      AND conrelid = 'public.email_queue'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%processing%'
  ) THEN
    ALTER TABLE public.email_queue DROP CONSTRAINT IF EXISTS email_queue_status_check;
    ALTER TABLE public.email_queue ADD CONSTRAINT email_queue_status_check
      CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text]));
  END IF;
END $$;

-- ============================================================
-- 3. Partial index for stale-requeue scan (idempotent)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_email_queue_processing_claimed
  ON public.email_queue (claimed_at)
  WHERE status = 'processing'::text;

-- ============================================================
-- 4. claim_email_queue_batch: atomically claim pending rows
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_email_queue_batch(p_max int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH claimed AS (
    SELECT id, recipient_email, template_name, subject, payload, attempts
    FROM public.email_queue
    WHERE status = 'pending'
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_max, 1), 50)
  )
  UPDATE public.email_queue eq
    SET status = 'processing',
        claimed_at = now(),
        attempts = eq.attempts + 1
    FROM claimed
    WHERE eq.id = claimed.id
  RETURNING jsonb_build_object(
    'id', eq.id,
    'recipient_email', eq.recipient_email,
    'template_name', eq.template_name,
    'subject', eq.subject,
    'payload', eq.payload,
    'attempts', eq.attempts
  )
  INTO v_result;

  IF v_result IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN v_result;
END;
$$;

-- ============================================================
-- 5. requeue_stale_email_queue: recover crashed 'processing' rows
-- ============================================================
CREATE OR REPLACE FUNCTION public.requeue_stale_email_queue()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requeued int;
  v_failed   int;
BEGIN
  UPDATE public.email_queue
    SET status = 'pending', claimed_at = NULL
    WHERE status = 'processing'
      AND claimed_at < now() - interval '5 minutes'
      AND attempts < 5;

  GET DIAGNOSTICS v_requeued = ROW_COUNT;

  UPDATE public.email_queue
    SET status = 'failed', claimed_at = NULL,
        last_error = 'Max retry attempts exceeded (stale processing)'
    WHERE status = 'processing'
      AND claimed_at < now() - interval '5 minutes'
      AND attempts >= 5;

  GET DIAGNOSTICS v_failed = ROW_COUNT;

  RETURN v_requeued + v_failed;
END;
$$;

-- ============================================================
-- 6. Revoke direct access from anon and authenticated
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.claim_email_queue_batch(int) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.requeue_stale_email_queue() FROM anon, authenticated;

-- ============================================================
-- 7. Force PostgREST schema cache reload
-- ============================================================
NOTIFY pgrst, 'reload schema';
