
-- Temporary read-only diagnostic function
CREATE OR REPLACE FUNCTION public.temp_check_admin_meta(p_email text)
RETURNS TABLE(user_id uuid, raw_app_meta jsonb, raw_user_meta jsonb, has_admin_claim boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT id, raw_app_meta_data, raw_user_meta_data,
    COALESCE((raw_app_meta_data ->> 'is_admin')::boolean, false)
  FROM auth.users
  WHERE email = p_email;
$$;

REVOKE EXECUTE ON FUNCTION public.temp_check_admin_meta(text) FROM anon, authenticated, public;
