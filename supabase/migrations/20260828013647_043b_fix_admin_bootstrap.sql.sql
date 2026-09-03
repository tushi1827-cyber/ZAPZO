/*
# Fix admin bootstrap — create profile manually + set admin flag via SECURITY DEFINER

The previous migration created an auth.users row directly, but the handle_new_user 
trigger didn't fire (or failed). Let's check if the user exists and create the profile 
manually if needed. We also ensure the temp_set_admin_flag function works.
*/

-- Drop and recreate the temp function with better error handling
CREATE OR REPLACE FUNCTION public.temp_set_admin_flag(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_ref_code text;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found: %', p_email;
  END IF;
  
  -- Set admin flag in JWT metadata
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"is_admin": true}'::jsonb
  WHERE id = v_user_id;
  
  -- Create profile if it doesn't exist
  INSERT INTO public.profiles (id, name, referral_code, is_admin, is_suspended)
  VALUES (
    v_user_id,
    'Admin Wallet QA',
    'ADM' || upper(substr(replace(v_user_id::text, '-', ''), 1, 9)),
    true,
    false
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.temp_set_admin_flag(text) FROM anon, authenticated, public;

-- Try setting the admin flag for the existing user
DO $$
BEGIN
  BEGIN
    PERFORM public.temp_set_admin_flag('admin-wallet-qa@testzapzo.com');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not set admin flag: %', SQLERRM;
  END;
END $$;
