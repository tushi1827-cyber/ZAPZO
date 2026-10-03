
-- Revoke direct EXECUTE on enqueue_email from all client-accessible roles.
-- SECURITY DEFINER trigger functions run as the function owner (postgres),
-- so they are unaffected by this revocation and continue to call enqueue_email normally.
REVOKE EXECUTE ON FUNCTION public.enqueue_email(uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
