-- Force PostgREST schema cache rebuild using the proven config-toggle technique.
-- This project has a history of PGRST205 issues where NOTIFY 'reload schema' alone
-- is insufficient. Toggling the db_schemas config value forces PostgREST to detect
-- a config change and perform a full schema cache reload.

-- Step 1: Toggle to public only
ALTER ROLE authenticator SET pgrst.db_schemas = 'public';
NOTIFY pgrst, 'reload config';

-- Step 2: Toggle back to include storage (restoring the correct production config)
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, storage';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
