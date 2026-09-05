
-- Replace with a function that lists all users' email + admin status
CREATE OR REPLACE FUNCTION public.temp_list_all_users()
RETURNS TABLE(user_id uuid, email text, raw_app_meta jsonb, has_admin_claim boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT id, email, raw_app_meta_data,
    COALESCE((raw_app_meta_data ->> 'is_admin')::boolean, false)
  FROM auth.users;
$$;

REVOKE EXECUTE ON FUNCTION public.temp_list_all_users() FROM anon, authenticated, public;
