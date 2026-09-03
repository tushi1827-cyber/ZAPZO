-- Force PostgREST schema cache rebuild by toggling db_schemas config
-- Changing the setting value forces PostgREST to detect a config change and reload
ALTER ROLE authenticator SET pgrst.db_schemas = 'public';
NOTIFY pgrst, 'reload config';
