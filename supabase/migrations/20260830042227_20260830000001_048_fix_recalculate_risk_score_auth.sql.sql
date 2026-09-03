/*
# Fix recalculate_risk_score Authorization

## Problem
The `recalculate_risk_score(p_user_id uuid)` SECURITY DEFINER function had
no authorization check. Any authenticated user could call it with any
`p_user_id`, potentially recalculating another user's risk score.

## Fix
Add an authorization check at the top of the function:
- If the caller is an admin (`is_admin()`), allow any `p_user_id`.
- If the caller is not an admin, only allow `p_user_id = auth.uid()`.
- If neither condition is met, raise an exception.

## Security
- SECURITY DEFINER preserved with `SET search_path TO 'public'`.
- No RLS changes.
- No new grants.
- The function is called internally by `review_risk_event` (which has its
  own `is_admin()` check) and is not exposed in the frontend.
*/

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
  -- Authorization: admin can recalculate any user's score;
  -- non-admin can only recalculate their own.
  if not public.is_admin() and p_user_id <> auth.uid() then
    raise exception 'You can only recalculate your own risk score';
  end if;

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
