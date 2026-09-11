-- Force PostgREST schema cache rebuild by toggling the db_schemas config.
-- This technique was proven to work in migration 20260903011519/11538.
-- Changing the setting value forces PostgREST to detect a config change
-- and trigger a full schema cache reload.

-- Step 1: Toggle to public only
ALTER ROLE authenticator SET pgrst.db_schemas = 'public';
NOTIFY pgrst, 'reload config';

-- Step 2: Toggle back to include storage
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, storage';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
