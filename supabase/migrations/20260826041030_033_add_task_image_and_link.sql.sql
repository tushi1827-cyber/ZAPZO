/*
# Add task image and task link to tasks table

## Changes
1. Add `task_image_url` (text, nullable) — storage path for the task display image
2. Add `task_link` (text, nullable) — optional external URL for the task target
3. Create `task-images` storage bucket (public read, admin-only write, 5MB, image types)
4. Storage policies: only admins can upload/update/delete; anyone can read (public bucket)

## Security
- task-images bucket is public (read) so user browsers can load task images directly
- Only admins can INSERT/UPDATE/DELETE in task-images (enforced via is_admin())
- task_link is validated as http/https URL in the frontend before saving
- No changes to task_submissions, RLS, or submit_task_safe
*/

-- 1. Add columns to tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS task_image_url text,
  ADD COLUMN IF NOT EXISTS task_link text;

-- 2. Create task-images storage bucket (public read for task display images)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-images',
  'task-images',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage policies for task-images bucket
-- Anyone (including anon) can read task images (public bucket for display)
DROP POLICY IF EXISTS "task_images_select_all" ON storage.objects;
CREATE POLICY "task_images_select_all"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'task-images');

-- Only admins can upload task images
DROP POLICY IF EXISTS "task_images_insert_admin" ON storage.objects;
CREATE POLICY "task_images_insert_admin"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'task-images' AND public.is_admin());

-- Only admins can update task images
DROP POLICY IF EXISTS "task_images_update_admin" ON storage.objects;
CREATE POLICY "task_images_update_admin"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'task-images' AND public.is_admin())
  WITH CHECK (bucket_id = 'task-images' AND public.is_admin());

-- Only admins can delete task images
DROP POLICY IF EXISTS "task_images_delete_admin" ON storage.objects;
CREATE POLICY "task_images_delete_admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'task-images' AND public.is_admin());
