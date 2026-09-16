/*
# Fix Homepage Content RLS to Use public.is_admin()

1. Purpose
   - The original homepage_content migration used `profiles.is_admin = true` for
     admin authorization. The authoritative ZAPZO admin check is the SECURITY
     DEFINER function `public.is_admin()` which reads the JWT claim
     `auth.jwt() -> 'app_metadata' ->> 'is_admin'`.
   - This migration replaces all three write policies (INSERT, UPDATE, DELETE)
     to use `public.is_admin()` instead of the profiles subquery.
   - Public SELECT access is unchanged.

2. Changes
   - homepage_content table: RLS policies updated (no schema changes).
   - INSERT policy WITH CHECK: now `public.is_admin()` instead of profiles subquery.
   - UPDATE policy USING + WITH CHECK: now `public.is_admin()` instead of profiles subquery.
   - DELETE policy USING: now `public.is_admin()` instead of profiles subquery.
   - SELECT policy: unchanged (public read for anon + authenticated).

3. Security
   - Uses the existing `public.is_admin()` SECURITY DEFINER function.
   - Does NOT modify `public.is_admin()`, `auth.users`, `profiles`, or any other
     existing table/function.
   - Non-admin authenticated users and anon users still cannot write.
*/
