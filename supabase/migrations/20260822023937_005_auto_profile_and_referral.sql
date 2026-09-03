/*
# Auto-create profile on signup + referral resolution

## Overview
- A trigger on auth.users creates a `profiles` row whenever a new auth user is created.
- Generates a unique referral code (ZAPZO-XXXXX format, collision-retried).
- If the user signed up with a referral code, resolves it to a referrer and creates a `referrals` row with status=pending.
- Self-referral and duplicate referral prevention handled by the referrals table constraints.

## Functions
### generate_referral_code()
- Generates a random ZAPZO-XXXXX code, retrying on collision.

### handle_new_user()
- Trigger function (SECURITY DEFINER) that:
  1. Generates a referral code.
  2. Inserts the profile row.
  3. If raw_user_meta_data.referral_code is present and valid, links the referral (pending status — no reward yet).

## Notes
- referral_code is passed by the frontend in signUp options.metadata as `referral_code`.
- The referral reward is ONLY credited later by qualify_referral_if_eligible() when the referred user completes an approved task.
- No money is created at signup.
*/

create or replace function public.generate_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_exists int;
begin
  loop
    v_code := 'ZAPZO-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 5));
    select count(*) into v_exists from public.profiles where referral_code = v_code;
    if v_exists = 0 then
      return v_code;
    end if;
  end loop;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref_code text;
  v_referrer_id uuid;
begin
  -- create profile
  insert into public.profiles (id, name, referral_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    public.generate_referral_code()
  );

  -- resolve referral
  v_ref_code := new.raw_user_meta_data ->> 'referral_code';
  if v_ref_code is not null and char_length(trim(v_ref_code)) > 0 then
    select id into v_referrer_id from public.profiles
      where referral_code = upper(trim(v_ref_code)) and id <> new.id;
    if v_referrer_id is not null then
      insert into public.referrals (referrer_id, referred_id, referral_code, status)
        values (v_referrer_id, new.id, upper(trim(v_ref_code)), 'pending')
        on conflict (referred_id) do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Function to resolve a referral code to whether it exists (for frontend validation)
create or replace function public.referral_code_exists(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where referral_code = upper(p_code));
$$;

grant execute on function public.referral_code_exists(text) to anon, authenticated;
