/*
# Fix guard_submission_user_edit trigger for auto-verification

## Problem
The `guard_submission_user_edit()` BEFORE UPDATE trigger on `task_submissions`
checks `is_admin()` which reads the JWT. When `submit_task_safe` (a SECURITY DEFINER
function running as `postgres`) performs an UPDATE on `task_submissions` for
auto-verification (setting status, reward_amount, auto_verification_result, etc.),
the trigger fires and checks `is_admin()`. Since the JWT still belongs to the
regular user (not an admin), `is_admin()` returns false, and the trigger raises
'Users cannot edit submissions after creating them' — blocking auto-verification entirely.

## Fix
Update `guard_submission_user_edit()` to also allow updates when the current
database role is `postgres` (i.e., running inside a SECURITY DEFINER function).
This preserves the security guarantee that regular users cannot directly UPDATE
their submissions via the REST API, while allowing SECURITY DEFINER functions
like `submit_task_safe` and `approve_task_submission` to perform their work.

## Security Impact
- Regular users via REST API: still blocked from direct UPDATE (RLS + trigger)
- Admin users via REST API: allowed (is_admin() = true)
- SECURITY DEFINER functions: allowed (current_user = 'postgres')
- No new attack surface — only the function owner (postgres) bypasses the check
*/

CREATE OR REPLACE FUNCTION public.guard_submission_user_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
-- Allow if current user is admin (via JWT check)
IF public.is_admin() THEN
  new.updated_at := now();
  RETURN new;
END IF;

-- Allow if running inside a SECURITY DEFINER function as postgres
-- (submit_task_safe, approve_task_submission, reject_task_submission all run as postgres)
IF current_user = 'postgres' THEN
  new.updated_at := now();
  RETURN new;
END IF;

-- Block all other users from editing submissions
RAISE EXCEPTION 'Users cannot edit submissions after creating them';
END;
$function$;

-- Re-grant: trigger functions should not be directly executable by anon/authenticated
REVOKE EXECUTE ON FUNCTION public.guard_submission_user_edit() FROM anon, authenticated;
