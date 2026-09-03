
-- Force PostgREST schema cache rebuild by setting db_schemas explicitly
-- This should trigger a full config reload + schema cache rebuild
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, storage';
NOTIFY pgrst, 'reload config';
