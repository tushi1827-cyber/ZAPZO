/*
# Temp admin bootstrap for final production smoke test

Creates a SECURITY DEFINER function to set is_admin flag on a user,
needed for admin-side withdrawal review tests. Will be cleaned up after testing.
*/

CREATE OR REPLACE FUNCTION public.temp_set_admin_flag(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"is_admin": true}'::jsonb
  WHERE id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.temp_set_admin_flag(uuid) FROM anon, authenticated, public;
