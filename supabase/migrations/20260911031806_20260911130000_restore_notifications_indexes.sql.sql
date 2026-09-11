-- Restore missing indexes on public.notifications
-- These were lost when the table was dropped and recreated in migration 20260911120000

-- 1. Unique dedup index (required by trigger functions using ON CONFLICT)
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_idx
ON public.notifications (user_id, type, related_id)
WHERE related_id IS NOT NULL;

-- 2. Original performance index from migration 027
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
ON public.notifications (user_id, created_at DESC);
