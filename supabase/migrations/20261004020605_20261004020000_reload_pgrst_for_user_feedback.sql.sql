-- Add comment to user_feedback table to ensure PostgREST schema cache picks it up
COMMENT ON TABLE public.user_feedback IS 'User feedback, suggestions, bug reports, and reports';

-- Force PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
