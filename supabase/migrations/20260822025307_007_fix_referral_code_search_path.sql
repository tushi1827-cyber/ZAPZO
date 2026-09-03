/*
# Fix generate_referral_code to reference extensions schema

## Overview
The `pgcrypto` extension is installed in the `extensions` schema, not `public`.
The `generate_referral_code()` function has `set search_path = public` which
excludes `extensions`, causing `gen_random_bytes` to not be found.

## Fix
- Update `generate_referral_code()` to set `search_path = public, extensions`
  so `gen_random_bytes` resolves correctly.
*/

CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_code text;
  v_exists int;
BEGIN
  loop
    v_code := 'ZAPZO-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 5));
    select count(*) into v_exists from public.profiles where referral_code = v_code;
    if v_exists = 0 then
      return v_code;
    end if;
  end loop;
END;
$$;
