
-- Fix PostgREST schema cache corruption caused by overloaded auto_verify_submission.
--
-- Root cause: auto_verify_submission has TWO overloads in the public schema:
--   1. (p_submission_id uuid) RETURNS boolean — a stub that always returns false
--   2. (p_submission_id uuid, p_config jsonb DEFAULT, p_proof_text text DEFAULT, p_proof_image_url text DEFAULT) RETURNS jsonb
--
-- Overloaded functions where one variant has default arguments is a known PostgREST
-- schema cache bug. PostgREST cannot disambiguate which overload to expose, and the
-- resulting cache corruption prevents it from discovering OTHER functions in the schema
-- — including submit_task_safe, which is completely unrelated.
--
-- Fix: Drop the 1-arg stub overload (it is never called by any trigger or application code).
--      The 4-arg version is the real implementation and is the one called by submit_task_safe.

-- 1. Drop the stub overload (returns boolean, 1 arg, no defaults)
DROP FUNCTION IF EXISTS public.auto_verify_submission(uuid) CASCADE;

-- 2. Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
