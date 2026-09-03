/*
# Revoke EXECUTE from PUBLIC on all SECURITY DEFINER functions

## Problem
Previous REVOKE FROM anon did not take effect because Supabase grants
function EXECUTE to PUBLIC by default, and the `authenticated` role
inherits from `anon` which inherits from PUBLIC. Revoking from just
`anon` is ineffective when the grant is on PUBLIC.

## Fix
REVOKE EXECUTE FROM PUBLIC on every SECURITY DEFINER function, then
explicitly GRANT EXECUTE only to `authenticated` for functions that
clients should be able to call. Internal trigger functions get no
explicit grant at all.
*/

-- Remove broad PUBLIC grant from all functions
REVOKE EXECUTE ON FUNCTION public.approve_task_submission(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_task_submission(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.review_withdrawal(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.suspend_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.activate_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.manual_adjustment(uuid, numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_balance() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.qualify_referral_if_eligible(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_referral_code() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_profile_columns() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.referral_code_exists(text) FROM PUBLIC;

-- Re-grant only to authenticated for client-callable functions
GRANT EXECUTE ON FUNCTION public.approve_task_submission(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_task_submission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_withdrawal(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suspend_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manual_adjustment(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_balance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.referral_code_exists(text) TO authenticated;

-- Internal/trigger functions: NO grant to any client role
-- qualify_referral_if_eligible, generate_referral_code, guard_profile_columns
-- are only called by triggers or other SECURITY DEFINER functions.
