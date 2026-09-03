/*
# Set admin flag for the test admin user

The user was created via auth.signUp (which properly handles all auth schema fields).
Now we set raw_app_meta_data.is_admin = true so is_admin() returns true in the JWT.
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

-- Set admin flag for the user created via auth.signUp
SELECT public.temp_set_admin_flag('5b57ed2a-6b52-445d-94a0-e578d33499bc');
