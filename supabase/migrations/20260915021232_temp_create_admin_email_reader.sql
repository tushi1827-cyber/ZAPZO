-- Temporary diagnostic function to read admin email
CREATE OR REPLACE FUNCTION public.temp_get_admin_email(p_user_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM auth.users WHERE id = p_user_id;
$$;

REVOKE EXECUTE ON FUNCTION public.temp_get_admin_email(uuid) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.temp_get_admin_email(uuid) TO authenticated;
