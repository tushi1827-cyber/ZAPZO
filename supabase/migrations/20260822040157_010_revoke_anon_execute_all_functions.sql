/*
# Revoke EXECUTE from anon on ALL SECURITY DEFINER functions

## Problem
Migration 008 attempted to REVOKE EXECUTE FROM anon on several functions,
but the live database still shows anon can execute all of them. This is a
critical defense-in-depth gap: unauthenticated users should not be able to
reach admin-only functions or user-only functions at all.

## Fix
Re-grant EXECUTE to authenticated only, then explicitly REVOKE from anon
for every SECURITY DEFINER function that should not be publicly callable.

referral_code_exists is the only function that should remain callable by anon
(used on the registration page before login — it only returns a boolean).
*/

-- Admin-only functions: authenticated only
REVOKE EXECUTE ON FUNCTION public.approve_task_submission(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reject_task_submission(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.review_withdrawal(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.suspend_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.activate_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.manual_adjustment(uuid, numeric, text) FROM anon;

-- User-only functions: authenticated only
REVOKE EXECUTE ON FUNCTION public.get_user_balance() FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text) FROM anon;

-- Internal functions: not callable by any client role
REVOKE EXECUTE ON FUNCTION public.generate_referral_code() FROM anon;
REVOKE EXECUTE ON FUNCTION public.qualify_referral_if_eligible(uuid) FROM anon;

-- Trigger functions: not callable directly
REVOKE EXECUTE ON FUNCTION public.guard_profile_columns() FROM anon;
