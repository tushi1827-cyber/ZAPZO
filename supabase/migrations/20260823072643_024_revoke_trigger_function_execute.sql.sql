-- Revoke EXECUTE from anon and authenticated on trigger functions that should only fire via triggers.
-- Trigger functions run automatically via the trigger mechanism — they don't need EXECUTE grants
-- for their intended purpose. Leaving EXECUTE on allows anyone to call them via /rest/v1/rpc/.

-- guard_submission_user_edit: trigger function on task_submissions BEFORE UPDATE
REVOKE EXECUTE ON FUNCTION public.guard_submission_user_edit() FROM anon, authenticated, PUBLIC;

-- handle_new_user: trigger function on auth.users AFTER INSERT
-- This is called by the auth trigger, not via RPC. Revoke public execute.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;

-- prevent_duplicate_withdrawal: trigger function on withdrawals BEFORE INSERT OR UPDATE
REVOKE EXECUTE ON FUNCTION public.prevent_duplicate_withdrawal() FROM anon, authenticated, PUBLIC;

-- guard_profile_columns: trigger function on profiles BEFORE UPDATE
-- Already revoked (anon_can_execute=no, auth_can_execute=no) but ensure PUBLIC is revoked too.
REVOKE EXECUTE ON FUNCTION public.guard_profile_columns() FROM anon, authenticated, PUBLIC;

-- generate_referral_code: internal helper, already revoked but ensure PUBLIC is covered
REVOKE EXECUTE ON FUNCTION public.generate_referral_code() FROM anon, authenticated, PUBLIC;

-- qualify_referral_if_eligible: internal helper, already revoked but ensure PUBLIC is covered
REVOKE EXECUTE ON FUNCTION public.qualify_referral_if_eligible(uuid) FROM anon, authenticated, PUBLIC;
