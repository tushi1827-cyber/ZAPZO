-- Re-grant SELECT on notifications to force PostgREST to refresh its schema cache
-- and recognize the notifications table. This is a no-op privilege-wise (the grants
-- already exist) but the GRANT statement touches the pg_catalog metadata that
-- PostgREST watches, which can trigger a schema cache refresh.
GRANT SELECT ON public.notifications TO anon;
GRANT SELECT ON public.notifications TO authenticated;

-- Also send a NOTIFY as a belt-and-suspenders approach
NOTIFY pgrst, 'reload schema';
