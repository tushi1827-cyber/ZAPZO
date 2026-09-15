-- Temporary diagnostic: read admin user email then immediately drop the helper
CREATE OR REPLACE FUNCTION public.temp_get_admin_email(p_user_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM auth.users WHERE id = p_user_id;
$$;

REVOKE EXECUTE ON FUNCTION public.temp_get_admin_email(uuid) FROM anon, authenticated, public;

SELECT public.temp_get_admin_email('a0000000-0000-0000-0000-000000000001');

DROP FUNCTION public.temp_get_admin_email(uuid);
