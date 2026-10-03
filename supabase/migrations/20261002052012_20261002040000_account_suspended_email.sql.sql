/*
# Account Suspension Email (account_suspended)

## Purpose
When an admin suspends a user, enqueue an account_suspended email to
the affected user.

## Approach
Modify the existing public.suspend_user() function to enqueue the email
after the existing audit log insert. No new triggers, no schema changes.

## Changes

### 1. Modified function: public.suspend_user(p_user_id uuid)
- Admin check preserved exactly.
- profiles UPDATE preserved exactly.
- audit_logs INSERT preserved exactly.
- After the audit log insert, resolves the user's display name from
  public.profiles and enqueues an account_suspended email.
- reason is set to NULL (suspend_user has no reason parameter).
- dedup_key: 'account_suspended_email:' || p_user_id::text
- enqueue_email wrapped in BEGIN/EXCEPTION WHEN OTHERS THEN NULL.

### 2. No other changes
- No changes to activate_user, guard_profile_columns, profiles schema,
  audit_logs, enqueue_email, email_queue, process-email-queue, auth.users,
  RLS, or frontend code.

## Safety
- Function remains SECURITY DEFINER with search_path = 'public'.
- dedup key guarantees one email per user per suspension event.
- Exception isolation ensures email failures never block suspension.
*/

CREATE OR REPLACE FUNCTION public.suspend_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_user_name text;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.profiles set is_suspended = true where id = p_user_id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'user_suspended', 'user', p_user_id, '{}'::jsonb);

  -- Enqueue account suspended email (exception-isolated)
  select name into v_user_name from public.profiles where id = p_user_id;

  begin
    perform public.enqueue_email(
      p_user_id,
      'account_suspended',
      jsonb_build_object(
        'user_name', nullif(v_user_name, ''),
        'reason', null
      ),
      'account_suspended_email:' || p_user_id::text
    );
  exception when others then
    null;
  end;
end;
$function$;
