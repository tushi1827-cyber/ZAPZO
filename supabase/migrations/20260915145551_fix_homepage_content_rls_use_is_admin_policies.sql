/*
# Replace homepage_content write policies to use public.is_admin()

Replaces the three write RLS policies on homepage_content so they use
public.is_admin() (the authoritative JWT-based admin check) instead of
the profiles.is_admin subquery.

1. Policy Changes
   - admin_insert_homepage_content: WITH CHECK now public.is_admin()
   - admin_update_homepage_content: USING + WITH CHECK now public.is_admin()
   - admin_delete_homepage_content: USING now public.is_admin()
   - public_read_homepage_content: unchanged (anon + authenticated, USING true)

2. Security
   - public.is_admin() is a SECURITY DEFINER function that reads
     auth.jwt() -> 'app_metadata' ->> 'is_admin'. This is the same
     check used throughout ZAPZO for admin authorization.
   - No other tables, functions, or schemas are modified.
*/

-- Public read: unchanged
DROP POLICY IF EXISTS "public_read_homepage_content" ON homepage_content;
CREATE POLICY "public_read_homepage_content"
  ON homepage_content FOR SELECT
  TO anon, authenticated
  USING (true);

-- Admin-only insert: now uses public.is_admin()
DROP POLICY IF EXISTS "admin_insert_homepage_content" ON homepage_content;
CREATE POLICY "admin_insert_homepage_content"
  ON homepage_content FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- Admin-only update: now uses public.is_admin()
DROP POLICY IF EXISTS "admin_update_homepage_content" ON homepage_content;
CREATE POLICY "admin_update_homepage_content"
  ON homepage_content FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Admin-only delete: now uses public.is_admin()
DROP POLICY IF EXISTS "admin_delete_homepage_content" ON homepage_content;
CREATE POLICY "admin_delete_homepage_content"
  ON homepage_content FOR DELETE
  TO authenticated
  USING (public.is_admin());
