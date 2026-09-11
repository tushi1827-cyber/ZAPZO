-- Force PostgREST to reload its schema cache so it discovers the new
-- get_notifications RPC function. The NOTIFY signal is the standard
-- Supabase mechanism for triggering a PostgREST schema refresh.

NOTIFY pgrst, 'reload schema';
