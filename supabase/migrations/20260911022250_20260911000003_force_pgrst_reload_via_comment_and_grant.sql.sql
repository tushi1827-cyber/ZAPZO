-- Force PostgREST schema cache reload using multiple proven techniques:
-- 1. Touch the function comment (PostgREST monitors comment changes)
-- 2. Re-grant EXECUTE (touches pg_catalog metadata)
-- 3. NOTIFY pgrst (standard reload signal)

COMMENT ON FUNCTION public.get_notifications(text, uuid, int) IS 'SECURITY DEFINER RPC for reading and managing user notifications';

GRANT EXECUTE ON FUNCTION public.get_notifications(text, uuid, int) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_notifications(text, uuid, int) FROM anon;

NOTIFY pgrst, 'reload schema';
