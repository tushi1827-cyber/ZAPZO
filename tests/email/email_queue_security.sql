-- Email queue security (separate from the reliability migration).
-- Removes EXECUTE from PUBLIC, anon and authenticated on queue-processing functions,
-- then grants EXECUTE to service_role only. Does not modify any table rows.
-- SECURITY DEFINER and search_path are unchanged.
-- Apply after email_queue_reliability.sql.

REVOKE EXECUTE ON FUNCTION public.claim_email_queue_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.requeue_stale_email_queue() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_email_queue_row(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_email_queue_row_sent(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_email_queue_row(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_backoff(integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_email_queue_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.requeue_stale_email_queue() TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_email_queue_row(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_email_queue_row_sent(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_email_queue_row(uuid, uuid, text, text) TO service_role;
