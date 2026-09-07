/*
# Support Ticket System — Storage Bucket for Attachments

## Summary
Creates a private storage bucket 'support-attachments' for ticket attachment files.
Users can upload only to their own UID folder.
Users can read only their own attachments.
Admins can read all attachments.
Users cannot delete attachments (admin only).
Bucket is private — no public access.

## 1. Storage Bucket
- Name: support-attachments
- Public: false (private — requires signed URLs for access)

## 2. Storage Policies

### INSERT (upload)
- Users can upload only to their own folder: storage.foldername(name)[1] = auth.uid()::text
- Bucket must be 'support-attachments'

### SELECT (read)
- Users can read only their own files: storage.foldername(name)[1] = auth.uid()::text
- Admins can read all files in the bucket: is_admin()

### DELETE
- Admin only: is_admin()

### UPDATE
- Admin only: is_admin()

## 3. Security Notes
1. Bucket is private — files are NOT accessible via public URL
2. Frontend must use signed URLs (supabase.storage.from('support-attachments').createSignedUrl(path, expiry))
3. Users can only upload to their own UID folder — enforced by storage.foldername check
4. Users cannot read other users' attachments — enforced by SELECT policy
5. Users cannot delete attachments — DELETE is admin-only
6. Does NOT modify task-images or task-proofs bucket policies
*/

-- ============================================================
-- Step 1: Create private storage bucket
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('support-attachments', 'support-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Step 2: Storage RLS Policies
-- ============================================================

-- INSERT: users upload to own folder only
DROP POLICY IF EXISTS "support_attach_insert_own" ON storage.objects;
CREATE POLICY "support_attach_insert_own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'support-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- SELECT: users read own files; admins read all
DROP POLICY IF EXISTS "support_attach_select_own_or_admin" ON storage.objects;
CREATE POLICY "support_attach_select_own_or_admin"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_admin()
  )
);

-- DELETE: admin only
DROP POLICY IF EXISTS "support_attach_delete_admin" ON storage.objects;
CREATE POLICY "support_attach_delete_admin"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND public.is_admin()
);

-- UPDATE: admin only
DROP POLICY IF EXISTS "support_attach_update_admin" ON storage.objects;
CREATE POLICY "support_attach_update_admin"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND public.is_admin()
)
WITH CHECK (
  bucket_id = 'support-attachments'
  AND public.is_admin()
);

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
