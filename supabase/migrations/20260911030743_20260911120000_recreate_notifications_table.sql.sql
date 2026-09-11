-- Drop and recreate notifications table to get a fresh OID
-- that PostgREST will pick up in its schema cache
-- The table is currently empty (0 rows), so no data loss

DROP TABLE IF EXISTS public.notifications CASCADE;

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  related_id uuid,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO anon, authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "notifications_insert_own" ON public.notifications
  FOR INSERT TO anon, authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO anon, authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notifications_delete_own" ON public.notifications
  FOR DELETE TO anon, authenticated
  USING (auth.uid() = user_id);

-- Recreate the index
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, is_read) WHERE is_read = false;

-- Grant privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO anon, authenticated;
GRANT ALL ON public.notifications TO service_role;

-- Notify PostgREST to reload
NOTIFY pgrst, 'reload schema';
