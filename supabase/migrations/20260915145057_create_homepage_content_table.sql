/*
# Create Homepage Content Table for Admin-Only Editing

1. Purpose
   - Allows ZAPZO admins to edit homepage content (hero, features, FAQ, CTA, footer, etc.)
     from the admin panel instead of modifying React code.
   - Content is stored as a single JSONB document in a dedicated table.
   - The homepage reads this content dynamically; if no row exists, the app
     falls back to hardcoded defaults already present in LandingPage.tsx.

2. New Tables
   - `homepage_content`
     - `id` (int2, primary key, fixed to 1 — singleton row)
     - `content` (jsonb, not null — holds all editable homepage fields)
     - `updated_by` (uuid, nullable — the admin user who last saved)
     - `updated_at` (timestamptz, default now)

3. Security (RLS)
   - RLS is enabled on `homepage_content`.
   - SELECT: public (anon + authenticated) — anyone visiting the homepage can read
     the published content. This is intentional: the homepage is a public page.
   - INSERT / UPDATE / DELETE: restricted to authenticated admins only.
     Admin check uses a security definer function `is_admin()` that already exists
     in the database (created by earlier migrations). If `is_admin()` is not
     available, the policies fall back to checking `profiles.is_admin` via a subquery
     on `auth.uid()`.
   - Non-admin authenticated users and anon users cannot write.

4. Important Notes
   - This migration does NOT modify the existing auth system, profiles table,
     or any other table.
   - The singleton row (id=1) is not auto-created; the admin editor will upsert
     on save. The homepage code treats a missing row as "use defaults."
*/

CREATE TABLE IF NOT EXISTS homepage_content (
  id smallint PRIMARY KEY DEFAULT 1,
  content jsonb NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT homepage_content_singleton CHECK (id = 1)
);

ALTER TABLE homepage_content ENABLE ROW LEVEL SECURITY;

-- Public read: anyone (including anon) can read published homepage content
DROP POLICY IF EXISTS "public_read_homepage_content" ON homepage_content;
CREATE POLICY "public_read_homepage_content"
  ON homepage_content FOR SELECT
  TO anon, authenticated
  USING (true);

-- Admin-only insert
DROP POLICY IF EXISTS "admin_insert_homepage_content" ON homepage_content;
CREATE POLICY "admin_insert_homepage_content"
  ON homepage_content FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Admin-only update
DROP POLICY IF EXISTS "admin_update_homepage_content" ON homepage_content;
CREATE POLICY "admin_update_homepage_content"
  ON homepage_content FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Admin-only delete
DROP POLICY IF EXISTS "admin_delete_homepage_content" ON homepage_content;
CREATE POLICY "admin_delete_homepage_content"
  ON homepage_content FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );
