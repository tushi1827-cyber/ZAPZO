/*
# Welcome Email on Signup

## Purpose
When a new user successfully signs up, automatically enqueue exactly one
"welcome" email into public.email_queue via public.enqueue_email().
The existing process-email-queue Edge Function will pick it up and send it
through Resend — no direct email sending from the database or frontend.

## Approach
Extend the existing public.handle_new_user() trigger function (AFTER INSERT
on auth.users) to call enqueue_email after the profile and referral logic
has already run.  This avoids creating a second trigger on auth.users and
preserves all existing profile-creation and referral-resolution behavior.

## Changes

### 1. Modified function: public.handle_new_user()
- All existing logic (profile insert, referral resolution) is preserved
  exactly as-is.
- After the existing logic completes, a new block calls:
    public.enqueue_email(
      NEW.id,
      'welcome',
      jsonb_build_object('user_name', <name>),
      'welcome:' || NEW.id::text
    )
- The name is resolved from the same source the profile uses:
  coalesce(NEW.raw_user_meta_data ->> 'name', '').  If the name is empty
  string, NULL is passed instead so the email template falls back to
  "Hello," rather than "Hi ,".
- dedup_key is 'welcome:' || NEW.id::text — deterministic per user, so
  re-running the trigger (or a retry) never produces a duplicate welcome
  email.  enqueue_email's ON CONFLICT (dedup_key) DO NOTHING handles this.
- The return value of enqueue_email is not checked — if it returns NULL
  (e.g. user somehow has no email, which shouldn't happen for a just-created
  auth.users row), the trigger still succeeds and returns NEW.

### 2. No new triggers
- The existing trigger "on_auth_user_created" on auth.users already calls
  handle_new_user().  No new trigger is created.  The function is replaced
  in-place with CREATE OR REPLACE, so the existing trigger automatically
  picks up the new logic.

### 3. No new tables, no RLS changes, no auth changes
- email_queue, enqueue_email, claim_email_queue_batch, requeue_stale_email_queue
  are all untouched.
- No changes to auth.users, profiles, referrals, or any RLS policies.
- No changes to the process-email-queue Edge Function.

## Safety
- The function remains SECURITY DEFINER with search_path = 'public'.
- enqueue_email is also SECURITY DEFINER, so it can read auth.users.email
  from within the trigger context.
- The dedup_key guarantees idempotency — even if the trigger fires twice
  for the same user (edge case), only one welcome email is enqueued.
- If enqueue_email fails for any reason, the exception propagates and the
  entire transaction (including profile creation) rolls back — this is
  the correct behavior: a user without a welcome email queue entry is
  preferable to silently swallowing the error and having an inconsistent
  state.  However, enqueue_email is designed to return NULL rather than
  raise exceptions for soft failures (no email, invalid template), so
  the only hard failure would be a genuine DB-level issue.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_ref_code text;
  v_referrer_id uuid;
  v_user_name text;
begin
  -- create profile
  insert into public.profiles (id, name, referral_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    public.generate_referral_code()
  );

  -- resolve referral
  v_ref_code := new.raw_user_meta_data ->> 'referral_code';
  if v_ref_code is not null and char_length(trim(v_ref_code)) > 0 then
    select id into v_referrer_id from public.profiles
    where referral_code = upper(trim(v_ref_code)) and id <> new.id;
    if v_referrer_id is not null then
      insert into public.referrals (referrer_id, referred_id, referral_code, status)
      values (v_referrer_id, new.id, upper(trim(v_ref_code)), 'pending')
      on conflict (referred_id) do nothing;
    end if;
  end if;

  -- enqueue welcome email (dedup_key prevents duplicates)
  v_user_name := coalesce(new.raw_user_meta_data ->> 'name', '');
  perform public.enqueue_email(
    new.id,
    'welcome',
    jsonb_build_object(
      'user_name', nullif(v_user_name, '')
    ),
    'welcome:' || new.id::text
  );

  return new;
end;
$function$;
