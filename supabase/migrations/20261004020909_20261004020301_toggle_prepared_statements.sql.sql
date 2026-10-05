-- Cannot ALTER DATABASE for pgrst settings (permission denied).
-- The role-level toggle was already applied but PostgREST isn't listening on NOTIFY.
-- Try toggling a different PostgREST config parameter to trigger a config reload.
-- pgrst.db_prepared_statements is currently set to true - toggle it false then back.

ALTER ROLE authenticator SET pgrst.db_prepared_statements = false;
NOTIFY pgrst, 'reload config';

ALTER ROLE authenticator SET pgrst.db_prepared_statements = true;
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
