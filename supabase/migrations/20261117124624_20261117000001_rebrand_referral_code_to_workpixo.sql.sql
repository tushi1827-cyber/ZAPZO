/*
# Rebrand referral code prefix from ZAPZO- to WORKPIXO-

## Summary
Updates the `generate_referral_code()` database function so that all
newly generated referral codes use the `WORKPIXO-XXXXX` format instead
of the legacy `ZAPZO-XXXXX` format.

## Why this is safe
- The profiles table currently contains zero rows, so no existing
  referral codes or referral relationships exist to migrate or break.
- Only the generation prefix changes; the uniqueness check, collision
  retry loop, and all referral validation/resolution logic remain
  unchanged.
- `referral_code_exists()` continues to accept any case-insensitive
  code, so if legacy `ZAPZO-` codes are ever inserted manually later,
  they still validate correctly.

## Changes
1. `generate_referral_code()` — prefix changed from `ZAPZO-` to
   `WORKPIXO-` (5-char random hex suffix unchanged).
2. `settings.site_name` default — changed from `ZAPZO` to `WorkPixo`
   for consistency in admin-managed site settings.

## Security
No RLS or policy changes. Function security definer / search_path
settings preserved exactly as before. No grants modified.
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
    v_code := 'WORKPIXO-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 5));
    select count(*) into v_exists from public.profiles where referral_code = v_code;
    if v_exists = 0 then
      return v_code;
    end if;
  end loop;
END;
$$;

-- Update default site_name in settings table
UPDATE public.settings SET site_name = 'WorkPixo' WHERE site_name = 'ZAPZO';
ALTER TABLE public.settings ALTER COLUMN site_name SET DEFAULT 'WorkPixo';
