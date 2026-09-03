/*
# Lock down internal trigger functions

generate_referral_code and guard_profile_columns are trigger/internal
functions that should NOT be directly callable by any client role.
qualify_referral_if_eligible is called only by approve_task_submission
(SECURITY DEFINER), so it does not need a client grant either.
*/

REVOKE EXECUTE ON FUNCTION public.generate_referral_code() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_profile_columns() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.qualify_referral_if_eligible(uuid) FROM authenticated;
