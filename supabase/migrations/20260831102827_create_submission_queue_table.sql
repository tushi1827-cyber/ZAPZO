/*
# Create submission queue table to bypass PostgREST schema cache issue

## Problem
PostgREST schema cache is frozen and cannot see functions created after migration ~009.
The `submit_task_safe` RPC returns 404 (PGRST202) because PostgREST can't resolve it.

## Solution
Create a `submission_queue` table that the frontend inserts into.
A BEFORE INSERT trigger calls `submit_task_safe` directly in the database
(trigger functions run in the DB engine, not through PostgREST RPC).
The result (submission UUID) is stored in the row and returned to the frontend.
If the function raises an exception, the insert fails and the error propagates.

## New Table
- `submission_queue`
  - `id` uuid PK
  - `task_id` uuid (not null)
  - `proof_text` text (not null)
  - `proof_image_url` text (nullable)
  - `user_id` uuid (default auth.uid(), not null)
  - `submission_id` uuid (nullable - set by trigger to the actual task_submissions.id)
  - `created_at` timestamptz (default now())

## Security
- RLS enabled
- INSERT: authenticated users can insert their own rows
- SELECT: authenticated users can read their own rows
- No UPDATE or DELETE policies (rows are insert-only)

## Trigger
- `trg_submission_queue_process` BEFORE INSERT calls submit_task_safe
- Stores the returned UUID in `submission_id` column
- Exceptions propagate to the client as INSERT errors
*/

CREATE TABLE IF NOT EXISTS public.submission_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  proof_text text NOT NULL,
  proof_image_url text,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  submission_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.submission_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "queue_insert_own" ON public.submission_queue;
CREATE POLICY "queue_insert_own"
  ON public.submission_queue FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "queue_select_own" ON public.submission_queue;
CREATE POLICY "queue_select_own"
  ON public.submission_queue FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Trigger function that calls submit_task_safe directly
-- This runs in the DB engine, NOT through PostgREST, so schema cache doesn't matter
CREATE OR REPLACE FUNCTION public.process_submission_queue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_submission_id uuid;
begin
  -- Call submit_task_safe directly - this is a DB-internal call, not PostgREST RPC
  v_submission_id := public.submit_task_safe(
    NEW.task_id,
    NEW.proof_text,
    NEW.proof_image_url
  );
  
  -- Store the result
  NEW.submission_id := v_submission_id;
  RETURN NEW;
end;
$function$;

DROP TRIGGER IF EXISTS trg_submission_queue_process ON public.submission_queue;
CREATE TRIGGER trg_submission_queue_process
  BEFORE INSERT ON public.submission_queue
  FOR EACH ROW EXECUTE FUNCTION public.process_submission_queue();

-- Clean up the test function from earlier
DROP FUNCTION IF EXISTS public.test_rpc_visibility(text);

NOTIFY pgrst, 'reload schema';
