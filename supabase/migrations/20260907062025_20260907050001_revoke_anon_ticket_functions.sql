/*
# Support Ticket System — Revoke anon EXECUTE on Ticket Functions

## Summary
Revokes EXECUTE from the `anon` role on all support ticket SECURITY DEFINER functions.
The `anon` role should not be able to call any ticket functions — all require authentication.
Admin functions additionally check is_admin() internally, but anon should not even reach them.

## Functions affected
- create_support_ticket
- reply_to_ticket
- admin_reply_to_ticket
- admin_update_ticket_status
- admin_update_ticket_priority

## Security
- anon role loses EXECUTE on all 5 functions
- authenticated role retains EXECUTE (already granted in prior migration)
- No changes to function definitions or other grants
*/

REVOKE EXECUTE ON FUNCTION public.create_support_ticket(text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reply_to_ticket(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_reply_to_ticket(uuid, text, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_ticket_status(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_ticket_priority(uuid, text) FROM anon;

-- Also revoke from public role (which includes anon)
REVOKE EXECUTE ON FUNCTION public.create_support_ticket(text, text, text, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.reply_to_ticket(uuid, text, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_reply_to_ticket(uuid, text, text, boolean) FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_update_ticket_status(uuid, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_update_ticket_priority(uuid, text) FROM public;

NOTIFY pgrst, 'reload schema';
