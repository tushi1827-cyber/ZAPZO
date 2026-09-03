-- CRITICAL FIX: Remove direct INSERT policies on withdrawals and task_submissions
-- These policies allowed users to bypass the SECURITY DEFINER RPCs:
--   - request_withdrawal() which validates amount, balance, method, min withdrawal, duplicates
--   - submit_task_safe() which enforces anti-fraud: duplicate detection, rate limits, risk blocking
--
-- The RPCs are SECURITY DEFINER owned by postgres, so they bypass RLS and can still insert.
-- Users must NOT be able to insert directly.

DROP POLICY IF EXISTS "wd_insert_own" ON public.withdrawals;
DROP POLICY IF EXISTS "submissions_insert_own" ON public.task_submissions;
