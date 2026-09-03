/*
# Revoke authenticated EXECUTE on trigger-only functions

These functions are only called by triggers, not by users.
Revoking EXECUTE from authenticated prevents direct RPC calls.
*/

REVOKE EXECUTE ON FUNCTION public.auto_create_risk_profile() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.risk_profile_updated_at() FROM authenticated;
