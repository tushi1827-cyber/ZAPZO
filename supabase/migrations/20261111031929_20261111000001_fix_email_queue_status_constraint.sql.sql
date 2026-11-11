/*
# Fix email_queue status check constraint to include 'processing'

## Root cause
The `claim_email_queue_batch(p_max)` RPC (used by the process-email-queue
Edge Function) atomically updates claimed rows to `status = 'processing'`.
However, the `email_queue_status_check` constraint only permits
`('pending', 'sent', 'failed')`, so the UPDATE inside the RPC raises:

  ERROR: 23514: new row for relation "email_queue" violates check
  constraint "email_queue_status_check"

## Intended email lifecycle (from the actual code)
- pending    — queued, waiting to be claimed
- processing — claimed by process-email-queue Edge Function (set by
               claim_email_queue_batch; claimed_at = now())
- sent       — Resend accepted the email (set by Edge Function)
- failed     — permanent failure / max retries exceeded
- pending    — transient failure retry (Edge Function sets back to pending)

## What this migration changes
1. Replaces `email_queue_status_check` with a constraint that allows
   all four statuses: pending, processing, sent, failed. No existing
   valid status is removed. This is the ONLY behavioral change.

## What this migration does NOT change
- No columns added, removed, or renamed.
- No data modified or deleted.
- No RLS policies changed.
- No functions recreated.
- No Edge Function code changed.
- No cron job or scheduler changed.
- No secrets touched.

## Idempotency
DROP IF EXISTS + ADD makes this safe to re-run.
*/

ALTER TABLE public.email_queue
  DROP CONSTRAINT IF EXISTS email_queue_status_check;

ALTER TABLE public.email_queue
  ADD CONSTRAINT email_queue_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text]));

NOTIFY pgrst, 'reload schema';
