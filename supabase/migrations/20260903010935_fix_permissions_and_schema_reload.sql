-- Combined permission fixes from migrations 029, 030, 048, 049, 050, 062
-- The database already has all schema objects from migrations 027-062
-- but several REVOKE statements and auth checks were not applied.

-- =====================================================
-- From migration 029: Revoke authenticated EXECUTE on trigger-only functions
-- =====================================================
REVOKE EXECUTE ON FUNCTION public.auto_create_risk_profile() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.risk_profile_updated_at() FROM authenticated;

-- =====================================================
-- From migration 030: Revoke anon/PUBLIC EXECUTE on exposed SECURITY DEFINER functions
-- =====================================================
-- is_admin: revoke from all client roles (internal only)
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM authenticated;

-- notify_* trigger functions
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

-- =====================================================
-- From migration 048: Fix recalculate_risk_score authorization
-- =====================================================
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

-- =====================================================
-- From migrations 049 + 050: Revoke anon/PUBLIC on auto_verify_submission
-- Only the (uuid, jsonb, text, text) overload exists; the (uuid) stub was dropped by migration 057
-- =====================================================
REVOKE EXECUTE ON FUNCTION public.auto_verify_submission(uuid, jsonb, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_verify_submission(uuid, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_verify_submission(uuid, jsonb, text, text) TO authenticated;

-- =====================================================
-- Additional revokes: Remove anon access on admin-only and internal functions
-- =====================================================

-- submit_task_safe: revoke from anon, keep authenticated
REVOKE EXECUTE ON FUNCTION public.submit_task_safe(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_task_safe(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_task_safe(uuid, text, text) TO authenticated;

-- recalculate_risk_score: revoke from anon, keep authenticated
REVOKE EXECUTE ON FUNCTION public.recalculate_risk_score(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recalculate_risk_score(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_risk_score(uuid) TO authenticated;

-- review_risk_event: revoke from anon, keep authenticated
REVOKE EXECUTE ON FUNCTION public.review_risk_event(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.review_risk_event(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_risk_event(uuid, text, text) TO authenticated;

-- review_withdrawal: revoke from anon, keep authenticated
REVOKE EXECUTE ON FUNCTION public.review_withdrawal(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.review_withdrawal(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_withdrawal(uuid, text, text) TO authenticated;

-- set_risk_review_status: revoke from anon, keep authenticated
REVOKE EXECUTE ON FUNCTION public.set_risk_review_status(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_risk_review_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_risk_review_status(uuid, text) TO authenticated;

-- update_risk_admin_notes: revoke from anon, keep authenticated
REVOKE EXECUTE ON FUNCTION public.update_risk_admin_notes(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_risk_admin_notes(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_risk_admin_notes(uuid, text) TO authenticated;

-- qualify_referral_if_eligible: revoke from anon (internal only, called by SECURITY DEFINER)
REVOKE EXECUTE ON FUNCTION public.qualify_referral_if_eligible(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.qualify_referral_if_eligible(uuid) FROM PUBLIC;

-- suspend_user: revoke from anon (admin only)
REVOKE EXECUTE ON FUNCTION public.suspend_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.suspend_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suspend_user(uuid) TO authenticated;

-- activate_user: revoke from anon (admin only)
REVOKE EXECUTE ON FUNCTION public.activate_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.activate_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_user(uuid) TO authenticated;

-- _hello_world: drop this test function if it exists
DROP FUNCTION IF EXISTS public._hello_world();

-- =====================================================
-- From migration 062: Force PostgREST schema cache reload
-- =====================================================
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, storage';
NOTIFY pgrst, 'reload config';
