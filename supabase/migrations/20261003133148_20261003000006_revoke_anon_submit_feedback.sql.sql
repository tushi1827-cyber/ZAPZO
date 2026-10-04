/*
# Fix: Revoke anon execute on submit_user_feedback

submit_user_feedback was granted to authenticated but anon execute
was not revoked in the migration. This fixes that.
*/

REVOKE EXECUTE ON FUNCTION public.submit_user_feedback(text, text, text) FROM anon, public;

NOTIFY pgrst, 'reload schema';
