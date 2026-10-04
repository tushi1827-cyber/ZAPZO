/*
# Fix: Revoke anon/public execute on admin role functions

The security advisor flagged that the new SECURITY DEFINER functions
(is_super_admin, has_admin_role, has_admin_permission, get_admin_permissions,
assign_admin_role, remove_admin_role, get_admin_roles_list) were still
callable by the anon role via the PostgREST API, despite the REVOKE
statements in the original migration. This forcefully re-revokes execute
from anon and public, then forces a PostgREST schema reload.
*/

REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_admin_role(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_admin_permission(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_admin_permissions() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.assign_admin_role(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.remove_admin_role(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_admin_roles_list() FROM anon, public;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
