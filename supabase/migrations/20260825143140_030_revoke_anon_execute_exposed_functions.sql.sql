/*
# Revoke EXECUTE from anon/public on exposed SECURITY DEFINER functions

## Problem
The Supabase database linter found that 5 SECURITY DEFINER functions
were still callable by the `anon` (unauthenticated) and `public` roles:

1. is_admin() — returns boolean, low risk but should not be public
2. notify_referral_qualified() — trigger-only function, should not be callable via RPC
3. notify_submission_status() — trigger-only function
4. notify_wallet_adjustment() — trigger-only function
5. notify_withdrawal_status() — trigger-only function

Migration 027 included REVOKE statements for the four notify_* functions,
but the live database still shows them as PUBLIC-executable. This migration
forcibly revokes all client access and leaves them callable only by triggers
(which run with table owner privileges, bypassing EXECUTE grants).

## Changes
- REVOKE EXECUTE on all 5 functions FROM PUBLIC, anon, and authenticated
- No GRANT is re-issued — these functions are only called by triggers,
  not by any client code (verified by grep of src/ for .rpc() calls)
- referral_code_exists is intentionally LEFT anon-callable (used on the
  registration page before the user has a session)

## Security Impact
- Unauthenticated users can no longer call is_admin() to probe for admin status
- Unauthenticated users can no longer call notify_* functions to spam fake
  notifications into the notifications table
- Authenticated non-admin users can no longer call notify_* functions either
- Trigger execution is unaffected (triggers run as table owner, not via
  EXECUTE grants)

## Verification
Post-migration, the following query should return NO rows:
  SELECT proname FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.prosecdef = true
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND proname IN ('is_admin','notify_referral_qualified',
      'notify_submission_status','notify_wallet_adjustment',
      'notify_withdrawal_status');
*/

-- Revoke all client access on is_admin()
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM authenticated;

-- Revoke all client access on notify_* trigger functions
REVOKE EXECUTE ON FUNCTION public.notify_referral_qualified() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_referral_qualified() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_referral_qualified() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.notify_submission_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_submission_status() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_submission_status() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.notify_wallet_adjustment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_wallet_adjustment() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_wallet_adjustment() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.notify_withdrawal_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_withdrawal_status() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_withdrawal_status() FROM authenticated;
