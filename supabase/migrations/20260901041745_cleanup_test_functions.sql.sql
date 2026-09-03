
-- Clean up test functions created during debugging
DROP FUNCTION IF EXISTS public.submit_task(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.test_sig_utt(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.test_sig_ut(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.test_sig_ttt(text, text, text) CASCADE;
DROP TABLE IF EXISTS public._pgrst_test CASCADE;

NOTIFY pgrst, 'reload schema';
