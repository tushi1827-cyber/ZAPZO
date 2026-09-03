/*
# Revoke anon/PUBLIC EXECUTE on auto_verify_submission (re-apply)

## Problem
The previous migration revoked EXECUTE from `anon`, but the `PUBLIC`
role still grants execute to everyone (Postgres functions are executable
by PUBLIC by default). The `anon` role inherits from PUBLIC, so the
revoke was ineffective.

## Fix
1. REVOKE EXECUTE FROM PUBLIC on both overloads.
2. GRANT EXECUTE TO authenticated only.
3. This removes anon access while preserving the internal call chain
   (submit_task_safe runs as an authenticated user).
*/

REVOKE EXECUTE ON FUNCTION public.auto_verify_submission(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_verify_submission(uuid, jsonb, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.auto_verify_submission(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_verify_submission(uuid, jsonb, text, text) TO authenticated;
