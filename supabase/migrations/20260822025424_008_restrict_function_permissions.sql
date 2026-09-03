/*
# Restrict SECURITY DEFINER function execution permissions

## Overview
The Supabase security advisor flagged that all SECURITY DEFINER functions are
executable by the `anon` role. While admin-only functions internally check
`is_admin()`, we follow defense-in-depth by revoking `EXECUTE` from `anon`
for functions that should only be callable by authenticated users.

## Changes
- Revoke EXECUTE from anon on all admin-only functions:
  approve_task_submission, reject_task_submission, review_withdrawal,
  suspend_user, activate_user, manual_adjustment
- Revoke EXECUTE from anon on user-only functions:
  get_user_balance, request_withdrawal
- Keep EXECUTE on anon for referral_code_exists (needed on registration page
  before the user is authenticated — the function only returns boolean and
  exposes no sensitive data).
- generate_referral_code and qualify_referral_if_eligible are internal
  functions called by triggers/other functions, not directly by clients.
  Revoke from anon for defense-in-depth.
*/

REVOKE EXECUTE ON FUNCTION public.approve_task_submission(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reject_task_submission(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.review_withdrawal(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.suspend_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.activate_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.manual_adjustment(uuid, numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_balance() FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_referral_code() FROM anon;
REVOKE EXECUTE ON FUNCTION public.qualify_referral_if_eligible(uuid) FROM anon;

-- Keep referral_code_exists accessible to anon (registration page validation)
-- No change needed — already granted to anon, authenticated.
