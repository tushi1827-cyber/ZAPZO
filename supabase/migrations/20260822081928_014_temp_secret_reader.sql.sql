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
