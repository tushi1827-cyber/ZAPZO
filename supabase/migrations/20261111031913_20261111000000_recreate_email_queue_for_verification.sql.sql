/*
# Recreate email_queue with original (broken) constraint for fix verification

This recreates the email_queue table as it exists in production with the
ORIGINAL constraint that only allows pending/sent/failed (NOT processing).
This lets us reproduce the production error, then apply the fix migration
to verify it resolves the issue.

NOTE: This is ONLY for the Bolt sandbox database to verify the fix.
The production database already has this table — it only needs the
constraint update.
*/

CREATE TABLE IF NOT EXISTS public.email_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text    NOT NULL,
  template_name   text    NOT NULL,
  subject         text    NOT NULL,
  payload         jsonb   NOT NULL DEFAULT '{}'::jsonb,
  status          text    NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'failed')),
  attempts        integer NOT NULL DEFAULT 0,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  claimed_at      timestamptz,
  dedup_key       text
);

ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_queue_dedup
  ON public.email_queue (dedup_key)
  WHERE dedup_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_queue_status_created
  ON public.email_queue (created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_email_queue_processing_claimed
  ON public.email_queue (claimed_at)
  WHERE status = 'processing';

-- Insert a test pending row
INSERT INTO public.email_queue (recipient_email, template_name, subject, payload, status)
VALUES ('test-verify@example.com', 'welcome', 'Welcome to WorkPixo', '{"user_name":"Test"}'::jsonb, 'pending');

-- The claim function (current production version from fix_claim_email_queue_batch_array migration)
CREATE OR REPLACE FUNCTION public.claim_email_queue_batch(p_max integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  ),
  updated AS (
    UPDATE public.email_queue eq
    SET status = 'processing',
        claimed_at = now(),
        attempts = eq.attempts + 1
    FROM claimed
    WHERE eq.id = claimed.id
    RETURNING eq.id, eq.recipient_email, eq.template_name,
             eq.subject, eq.payload, eq.attempts
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'recipient_email', recipient_email,
        'template_name', template_name,
        'subject', subject,
        'payload', payload,
        'attempts', attempts
      )
      ORDER BY id
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM updated;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_email_queue_batch(integer) FROM anon, authenticated;

-- The requeue function
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

REVOKE EXECUTE ON FUNCTION public.requeue_stale_email_queue() FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
