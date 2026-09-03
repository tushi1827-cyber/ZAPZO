/*
# Revoke anon EXECUTE on auto_verify_submission

## Problem
Both overloads of `public.auto_verify_submission()` (a SECURITY DEFINER
function) could be executed by the `anon` role via the REST API. This
allowed unauthenticated users to probe whether any submission would pass
automatic verification — a minor information leak.

## Fix
Revoke EXECUTE from `anon` on both overloads of `auto_verify_submission`.
The function is never called from the frontend. It is only called
internally by `submit_task_safe` (another SECURITY DEFINER function),
which runs with the function owner's privileges, not the caller's.

## Security
- No RLS changes.
- `authenticated` retains EXECUTE (used by the internal call chain from
  `submit_task_safe` which runs as an authenticated user).
- The function is not exposed in any frontend code.
*/

REVOKE EXECUTE ON FUNCTION public.auto_verify_submission(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_verify_submission(uuid, jsonb, text, text) FROM anon;
