-- Fix PostgREST visibility: grant anon EXECUTE on functions the frontend calls
-- PostgREST only includes functions in its schema cache if anon has EXECUTE
-- The functions themselves enforce auth/admin checks internally via auth.uid() and is_admin()
-- This does NOT create a security hole — unauthenticated calls fail at the function body level

-- Functions called by authenticated users (dashboard)
GRANT EXECUTE ON FUNCTION public.submit_task_safe(uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_balance() TO anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text) TO anon;

-- Functions called by admin users (admin panel)
GRANT EXECUTE ON FUNCTION public.approve_task_submission(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.reject_task_submission(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.review_withdrawal(uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.review_risk_event(uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.update_risk_admin_notes(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.set_risk_review_status(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.suspend_user(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.activate_user(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.manual_adjustment(uuid, numeric, text) TO anon;

-- referral_code_exists already has anon EXECUTE (used on registration page)
-- generate_referral_code already has anon EXECUTE (used internally by trigger)
-- is_admin stays revoked from all client roles (internal only, profile.is_admin column is used instead)

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
