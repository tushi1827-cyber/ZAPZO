-- PostgREST 14.5 with db_prepared_statements=true may be caching the schema query
-- at the prepared statement level. When PostgREST restarts, it re-uses prepared
-- statements that return the old schema. Disabling prepared statements forces
-- PostgREST to re-parse and re-execute the schema query fresh.

-- Step 1: Disable prepared statements
ALTER ROLE authenticator SET pgrst.db_prepared_statements = false;

-- Step 2: Toggle schemas to force config reload
ALTER ROLE authenticator SET pgrst.db_schemas = 'public';
NOTIFY pgrst, 'reload config';

-- Step 3: Restore correct config
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, storage';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

-- Step 4: Re-enable prepared statements (after schema has reloaded)
-- We'll leave this for a follow-up migration if the reload succeeds
