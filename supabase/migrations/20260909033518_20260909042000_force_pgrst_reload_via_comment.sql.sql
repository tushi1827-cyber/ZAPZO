-- Touch the table comment to force PostgREST to re-detect the table in its schema cache.
-- PostgREST monitors comment changes as a signal to refresh its internal cache.
COMMENT ON TABLE public.notifications IS 'User notifications for submissions, withdrawals, referrals, and support tickets';

NOTIFY pgrst, 'reload schema';
