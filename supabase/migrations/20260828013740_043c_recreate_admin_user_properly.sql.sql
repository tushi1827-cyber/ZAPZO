/*
# Recreate admin user — use extensions.gen_salt explicitly
*/

DELETE FROM auth.users WHERE email = 'admin-wallet-qa@testzapzo.com';
DELETE FROM public.profiles WHERE name = 'Admin Wallet QA';

CREATE OR REPLACE FUNCTION public.temp_create_admin_user(p_email text, p_password text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_ref_code text;
  v_hash text;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
  IF v_user_id IS NOT NULL THEN
    UPDATE auth.users 
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"is_admin": true}'::jsonb
    WHERE id = v_user_id;
    RETURN v_user_id;
  END IF;
  
  v_user_id := gen_random_uuid();
  v_ref_code := 'ADM' || upper(substr(replace(v_user_id::text, '-', ''), 1, 9));
  v_hash := extensions.crypt(p_password, extensions.gen_salt('bf'));
  
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_sso_user,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    p_email,
    v_hash,
    now(),
    '{"is_admin": true}'::jsonb,
    '{}'::jsonb,
    false,
    now(),
    now()
  );
  
  INSERT INTO public.profiles (id, name, referral_code, is_admin, is_suspended)
  VALUES (v_user_id, 'Admin Wallet QA', v_ref_code, false, false)
  ON CONFLICT (id) DO NOTHING;
  
  RETURN v_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.temp_create_admin_user(text, text) FROM anon, authenticated, public;

SELECT public.temp_create_admin_user('admin-wallet-qa@testzapzo.com', 'AdminWalletQA!2026#Secure');
