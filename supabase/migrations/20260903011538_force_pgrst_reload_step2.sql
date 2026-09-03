-- Toggle back to include storage to force another reload
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, storage';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
