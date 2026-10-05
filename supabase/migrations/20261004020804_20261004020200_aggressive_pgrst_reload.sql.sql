-- Aggressive PostgREST schema cache reload using the config toggle technique.
-- The schema cache is stuck and doesn't include tables created after a certain point.
-- We need to force a full config reload (not just schema reload).

-- Step 1: Set to a single schema to force PostgREST to detect a config change
ALTER ROLE authenticator SET pgrst.db_schemas = 'public';
NOTIFY pgrst, 'reload config';

-- Step 2: Grant SELECT again to ensure PostgREST sees the table during reload
GRANT SELECT ON public.user_feedback TO anon, authenticated;
GRANT SELECT ON public.admin_roles TO anon, authenticated;

-- Step 3: Restore the correct multi-schema config
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, storage';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
