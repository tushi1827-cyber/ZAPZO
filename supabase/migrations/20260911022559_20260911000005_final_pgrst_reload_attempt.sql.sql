-- Final attempt to force PostgREST schema cache reload.
-- This combines all techniques that have worked previously:
-- 1. COMMENT on the function (bumps OID metadata)
-- 2. NOTIFY pgrst 'reload schema' (standard signal)
-- 3. ALTER ROLE authenticator SET pgrst.db_schemas toggle (forces config reload)

COMMENT ON FUNCTION public.get_notifications(text, uuid, int) IS 'SECURITY DEFINER RPC for user notifications. Uses auth.uid() for user identification.';

NOTIFY pgrst, 'reload schema';

ALTER ROLE authenticator SET pgrst.db_schemas = 'public';
NOTIFY pgrst, 'reload config';

ALTER ROLE authenticator SET pgrst.db_schemas = 'public, storage';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
