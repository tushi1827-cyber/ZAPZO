-- The PostgREST LISTEN process (pid 2009692) has been stale since Sept 10.
-- The active PostgREST process (pid 188803, started Oct 4) is NOT listening on pgrst channel.
-- NOTIFY has no effect because the active process doesn't receive the notification.
-- 
-- PostgREST 14.x has a config poll mechanism. When pgrst.db_schemas changes, it triggers
-- a full reload including a new LISTEN process. The previous toggles may not have worked
-- because PostgREST polls at intervals. Let's try adding a new pgrst config parameter
-- to force a more aggressive reload.

-- Toggle db_schemas with a slightly different value to ensure PostgREST detects the change
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, storage, public';
NOTIFY pgrst, 'reload config';

-- Then set it back to the correct value
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, storage';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
