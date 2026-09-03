/*
# Fix: Storage API "Bucket not found" for task-proofs

## Root cause
RLS is enabled on storage.buckets but has NO policies. The Storage API
queries storage.buckets using the user's JWT and RLS blocks all SELECT
queries from non-service roles, so getBucket() returns "Bucket not found"
and listBuckets() returns [].

## Fix
Add a SELECT policy on storage.buckets allowing authenticated and anon
users to read bucket metadata. This is the standard Supabase pattern.

## Security
- Users can READ bucket metadata only (name, public flag, limits).
- Only service_role can create/modify/delete buckets (no INSERT/UPDATE/
  DELETE policies = blocked by RLS for all non-service roles).
- All storage.objects RLS policies remain unchanged.
*/

DROP POLICY IF EXISTS "bucket_select_all" ON storage.buckets;
CREATE POLICY "bucket_select_all"
  ON storage.buckets FOR SELECT
  TO anon, authenticated
  USING (true);
