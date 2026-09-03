/*
# Temporary admin bootstrap (re-created for wallet ledger QA)
Same secret-protected mechanism as before. Will be dropped after QA.
*/

CREATE TABLE IF NOT EXISTS public.bootstrap_config (
  id int primary key default 1,
  secret text not null,
  created_at timestamptz not null default now(),
  constraint bootstrap_singleton check (id = 1)
);

ALTER TABLE public.bootstrap_config ENABLE ROW LEVEL SECURITY;

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

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bootstrap_admin(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bootstrap_admin(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_admin(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.temp_read_bootstrap_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT secret FROM public.bootstrap_config WHERE id = 1;
$$;

REVOKE EXECUTE ON FUNCTION public.temp_read_bootstrap_secret() FROM anon;
REVOKE EXECUTE ON FUNCTION public.temp_read_bootstrap_secret() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.temp_read_bootstrap_secret() TO authenticated;
