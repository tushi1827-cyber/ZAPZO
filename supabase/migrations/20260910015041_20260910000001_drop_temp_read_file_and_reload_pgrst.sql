-- Step 1: Drop the rogue temp_read_file function that was causing
-- PostgREST schema cache reload to fail silently.
-- This function was NOT created by any migration. It was a SECURITY DEFINER
-- function with no search_path (mutable search_path) that called pg_read_file()
-- and had EXECUTE granted to anon/authenticated. It was flagged by the
-- Supabase database linter as a security vulnerability.
-- It caused PostgREST 14.x to abort schema cache reloads, leaving
-- notifications, user_risk_profiles, risk_events, and gift_card_denominations
-- invisible to the REST API (PGRST205).

DROP FUNCTION IF EXISTS public.temp_read_file(text);

-- Step 2: Force PostgREST to rebuild its schema cache.
-- With the rogue function gone, the reload will succeed.
NOTIFY pgrst, 'reload schema';