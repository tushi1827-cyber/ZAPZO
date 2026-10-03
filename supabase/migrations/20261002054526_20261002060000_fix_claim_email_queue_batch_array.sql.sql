/*
# Fix claim_email_queue_batch to return ALL claimed rows as a JSON array

## Problem
The original function used `RETURNING ... INTO v_result` which is a scalar
assignment. When multiple rows are claimed, only the LAST row is captured.
All other claimed rows are marked processing but never returned to the caller,
causing them to be stuck until requeue_stale_email_queue() requeues them
(after 5 minutes, incrementing attempts each cycle).

## Fix
Wrap the UPDATE...RETURNING in a CTE and aggregate all returned rows with
jsonb_agg() into a JSON array. COALESCE handles the empty case so the
function always returns [] when no rows are claimed.

## What changed
- Only public.claim_email_queue_batch() is recreated.
- Return type stays jsonb (no signature change).
- FOR UPDATE SKIP LOCKED, batch limit, attempts increment, status/claimed_at
  updates are all preserved exactly.
- requeue_stale_email_queue(), email_queue schema, enqueue_email(),
  process-email-queue, and all business event triggers are untouched.
*/

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
