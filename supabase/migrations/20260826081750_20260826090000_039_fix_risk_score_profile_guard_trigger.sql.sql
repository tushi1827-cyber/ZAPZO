/*
# Fix: recalculate_risk_score blocked by guard_profile_columns trigger

## Root cause
recalculate_risk_score() is SECURITY DEFINER and updates
profiles.fraud_signals. This UPDATE triggers guard_profile_columns()
which checks is_admin() — reading the *session* JWT, not the function
owner. When a non-admin user submits a task, the risk recalculation
fires, tries to update fraud_signals, and the trigger raises:
"Not allowed to change fraud_signals".

This breaks the entire task submission flow whenever a risk event
is inserted (duplicate_submission, rapid_submission, rate_limit_block,
excessive_rejection).

## Fix
Use a session-level configuration flag set by recalculate_risk_score
that guard_profile_columns respects. The flag is set with SET LOCAL
inside a SECURITY DEFINER function, so only trusted internal code
can set it — a client cannot inject it because they have no EXECUTE
on recalculate_risk_score (revoked in migration 030).

## Security
- guard_profile_columns still blocks direct client UPDATEs to
  fraud_signals, is_admin, is_suspended, referral_code, referred_by.
- Only SECURITY DEFINER functions that SET LOCAL the flag can bypass.
- Clients cannot set the flag directly (no access to SET on the
  connection via the Data API).
- All anti-fraud logic preserved.
*/

CREATE OR REPLACE FUNCTION public.guard_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
if not public.is_admin() then
  -- Allow internal SECURITY DEFINER functions to update protected
  -- columns by setting the local flag.
  if current_setting('app.internal_update', true) = 'on' then
    new.updated_at := now();
    return new;
  end if;

  if new.is_admin is distinct from old.is_admin then
    raise exception 'Not allowed to change is_admin';
  end if;
  if new.is_suspended is distinct from old.is_suspended then
    raise exception 'Not allowed to change is_suspended';
  end if;
  if new.fraud_signals is distinct from old.fraud_signals then
    raise exception 'Not allowed to change fraud_signals';
  end if;
  if new.referral_code is distinct from old.referral_code then
    raise exception 'Not allowed to change referral_code';
  end if;
  if new.referred_by is distinct from old.referred_by then
    raise exception 'Not allowed to change referred_by';
  end if;
end if;
new.updated_at := now();
return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_risk_score(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
v_score integer := 0;
v_dup_count integer := 0;
v_rapid_count integer := 0;
v_reject_count integer := 0;
v_referral_count integer := 0;
begin
-- Count events by type (all-time)
SELECT
COALESCE(SUM(CASE WHEN event_type = 'duplicate_submission' THEN 1 ELSE 0 END), 0),
COALESCE(SUM(CASE WHEN event_type = 'rapid_submission' THEN 1 ELSE 0 END), 0),
COALESCE(SUM(CASE WHEN event_type = 'excessive_rejection' THEN 1 ELSE 0 END), 0),
COALESCE(SUM(CASE WHEN event_type = 'referral_abuse' THEN 1 ELSE 0 END), 0)
INTO v_dup_count, v_rapid_count, v_reject_count, v_referral_count
FROM public.risk_events
WHERE user_id = p_user_id;

-- Risk points: each event type contributes points
v_score := LEAST(100,
v_dup_count * 15 +
v_rapid_count * 10 +
v_reject_count * 20 +
v_referral_count * 25
);

-- Update risk profile
UPDATE public.user_risk_profiles
SET
risk_score = v_score,
duplicate_submission_count = v_dup_count,
rapid_submission_count = v_rapid_count,
excessive_rejection_count = v_reject_count,
referral_abuse_count = v_referral_count,
last_flagged_at = CASE WHEN v_score > 0 THEN now() ELSE last_flagged_at END
WHERE user_id = p_user_id;

-- Mirror to profiles.fraud_signals for backward compatibility
-- Set the internal_update flag so guard_profile_columns allows it
SET LOCAL app.internal_update = 'on';
UPDATE public.profiles SET fraud_signals = v_score WHERE id = p_user_id;
SET LOCAL app.internal_update = 'off';
end;
$function$;
