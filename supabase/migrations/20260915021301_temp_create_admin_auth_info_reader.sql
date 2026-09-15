-- Temporary diagnostic: get admin user's password hash to verify it exists
CREATE OR REPLACE FUNCTION public.temp_get_admin_auth_info(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'has_password', encrypted_password IS NOT NULL,
    'email', email,
    'app_metadata', raw_app_meta_data
  )
  FROM auth.users
  WHERE id = p_user_id;
$$;

REVOKE EXECUTE ON FUNCTION public.temp_get_admin_auth_info(uuid) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.temp_get_admin_auth_info(uuid) TO authenticated;
