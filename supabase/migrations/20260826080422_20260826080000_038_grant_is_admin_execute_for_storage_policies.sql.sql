/*
# Fix: Grant EXECUTE on is_admin() to authenticated for storage RLS policies

## Root cause
Migration 030 revoked EXECUTE on public.is_admin() from both `anon` and
`authenticated` roles. However, the storage RLS SELECT policy
`task_proofs_select_own_or_admin` calls is_admin() in its USING clause:

  ((bucket_id = 'task-proofs') AND
   (((storage.foldername(name))[1] = auth.uid()::text) OR is_admin()))

When Supabase Storage processes an upload, it internally runs a SELECT
on storage.objects (to check if the path already exists). That SELECT
triggers the policy, which calls is_admin(). Since EXECUTE was revoked,
the call fails with "permission denied for function is_admin", causing
every upload to the task-proofs bucket to fail with HTTP 403.

## Fix
Re-grant EXECUTE on is_admin() to authenticated only. This is safe
because:

1. is_admin() is SECURITY DEFINER — it executes as the function owner,
   not as the caller. The caller cannot influence its behavior.
2. is_admin() is a read-only STABLE function that returns a boolean by
   reading auth.jwt() -> 'app_metadata' -> 'is_admin'. It exposes no
   sensitive data — just true/false.
3. The JWT is validated by Supabase's GoTrue auth server; users cannot
   forge admin claims.
4. anon remains revoked — anonymous access to is_admin() is not needed.

## Security
- No RLS policies weakened.
- No service-role keys exposed.
- is_admin() remains SECURITY DEFINER with search_path = public.
- anon EXECUTE remains revoked.
- All anti-fraud logic unchanged.
*/

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
