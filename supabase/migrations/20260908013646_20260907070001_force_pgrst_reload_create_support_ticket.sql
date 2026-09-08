
-- Force PostgREST schema cache reload for create_support_ticket visibility
-- The function exists with correct signature but PostgREST cannot resolve it
-- This is a known issue where the schema cache becomes stale after function recreation

NOTIFY pgrst, 'reload schema';

-- Also do a no-op comment to bump the function's OID timestamp
COMMENT ON FUNCTION public.create_support_ticket(p_category text, p_subject text, p_message text, p_attachment_url text) IS 'Creates a support ticket with first message. SECURITY DEFINER. search_path=public.';
