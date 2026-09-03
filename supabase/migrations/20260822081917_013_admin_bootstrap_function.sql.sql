/*
# Secure admin bootstrap function

## Overview
Provides a one-time, secret-protected mechanism to promote the first admin user
in a fresh Supabase project where no admin yet exists. This is needed because
the SQL tool cannot manage auth.users directly and no service-role key is
available in this environment.

## Function
### bootstrap_admin(p_user_id uuid, p_secret text)
- SECURITY DEFINER function that sets raw_app_meta_data.is_admin = true for a
  given auth.users id.
- Protected by a secret parameter that must match a value stored in a
  server-side config table. The secret is NOT in the codebase — it is generated
  at migration time and stored in a new `bootstrap_config` table.
- Idempotent — can be called multiple times safely.
- Will be DROPPED after the first admin is bootstrapped.

## Security
- The bootstrap_config table has NO RLS policies (locked down by default) —
  no client role can read the secret.
- The function checks the secret against the table before promoting.
- The function is revoked from anon and public; only authenticated can call it.
- This is a temporary mechanism for initial admin setup only.
*/

CREATE TABLE IF NOT EXISTS public.bootstrap_config (
  id int primary key default 1,
  secret text not null,
  created_at timestamptz not null default now(),
  constraint bootstrap_singleton check (id = 1)
);

ALTER TABLE public.bootstrap_config ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies — table is invisible to all client roles.
-- Only SECURITY DEFINER functions (running as superuser) can read it.

-- Generate a random secret if none exists.
DO $$
DECLARE
  v_secret text;
BEGIN
  SELECT secret INTO v_secret FROM public.bootstrap_config WHERE id = 1;
  IF v_secret IS NULL THEN
    INSERT INTO public.bootstrap_config (id, secret)
    VALUES (1, 'bootstrap-' || encode(gen_random_bytes(16), 'hex'))
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.bootstrap_admin(p_user_id uuid, p_secret text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stored_secret text;
  v_exists int;
BEGIN
  SELECT secret INTO v_stored_secret FROM public.bootstrap_config WHERE id = 1;
  IF v_stored_secret IS NULL OR p_secret IS DISTINCT FROM v_stored_secret THEN
    RAISE EXCEPTION 'Invalid bootstrap secret';
  END IF;

  SELECT count(*) INTO v_exists FROM auth.users WHERE id = p_user_id;
  IF v_exists = 0 THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"is_admin": true}'::jsonb
    WHERE id = p_user_id;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (p_user_id, 'admin_bootstrap', 'user', p_user_id,
          jsonb_build_object('method', 'bootstrap_function'));

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bootstrap_admin(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bootstrap_admin(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_admin(uuid, text) TO authenticated;
