/*
# Temp bootstrap admin for wallet lifecycle QA

Creates a temporary admin user to test the admin-side withdrawal review flow.
The profile is auto-created by the handle_new_user trigger on auth.users.
We use a SECURITY DEFINER function to set raw_app_meta_data.is_admin = true
(since direct UPDATE on auth.users is restricted).

This bootstrap will be removed in the next migration.
*/

-- Create the auth user first (the handle_new_user trigger will create the profile)
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'admin-wallet-qa@testzapzo.com';
  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, aud, role
    )
    VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'admin-wallet-qa@testzapzo.com',
      crypt('AdminWalletQA!2026#Secure', gen_salt('bf')),
      now(),
      '{"is_admin": true}'::jsonb,
      '{}'::jsonb,
      now(), now(),
      'authenticated',
      'authenticated'
    );
  END IF;
END $$;

-- SECURITY DEFINER function to set is_admin in raw_app_meta_data
CREATE OR REPLACE FUNCTION public.temp_set_admin_flag(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"is_admin": true}'::jsonb
  WHERE email = p_email;
END;
$$;

-- Set the admin flag
SELECT public.temp_set_admin_flag('admin-wallet-qa@testzapzo.com');

-- Revoke public access to the temp function
REVOKE EXECUTE ON FUNCTION public.temp_set_admin_flag(text) FROM anon, authenticated, public;
