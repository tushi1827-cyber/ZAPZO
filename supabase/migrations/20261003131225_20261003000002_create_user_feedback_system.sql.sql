/*
# Create User Feedback / Report System

1. Purpose
   Allows users to submit feedback, suggestions, bug reports, or issue reports
   from the user dashboard. Admins can review, filter, search, change status,
   and add admin notes. Uses the existing notification system for alerts.

2. New Tables
   - `user_feedback`
     - id (uuid, pk)
     - user_id (uuid, not null, references profiles, default auth.uid())
     - type (text, not null, CHECK in feedback/suggestion/bug/report)
     - subject (text, nullable)
     - message (text, not null)
     - status (text, not null, default open, CHECK in open/reviewing/resolved/closed)
     - admin_note (text, nullable)
     - created_at (timestamptz, default now())
     - updated_at (timestamptz, default now())

3. Security (RLS)
   - Enable RLS. Users see own rows; admins see all. Users insert own only.
   - Update/delete: admin only via is_admin(). No anon access.

4. Server Functions (SECURITY DEFINER, search_path=public)
   - submit_user_feedback(p_type, p_subject, p_message) → uuid
   - admin_update_feedback_status(p_feedback_id, p_status, p_admin_note) → void

5. Notifications
   - On submit: notifies all admins (type=feedback_received).
   - On admin status change: notifies user (type=feedback_status_changed).
   - Reuses existing notifications table.

6. Audit
   - On admin status change: inserts into audit_logs.

7. Notes
   - Purely additive. No existing tables modified.
   - No changes to wallet, withdrawal, referral, task, auth, or support-ticket logic.
*/

CREATE TABLE IF NOT EXISTS public.user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('feedback','suggestion','bug','report')),
  subject text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','closed')),
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id ON public.user_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_status ON public.user_feedback(status);
CREATE INDEX IF NOT EXISTS idx_user_feedback_type ON public.user_feedback(type);
CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at ON public.user_feedback(created_at DESC);

ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_feedback" ON public.user_feedback;
CREATE POLICY "select_own_feedback"
ON public.user_feedback FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "insert_own_feedback" ON public.user_feedback;
CREATE POLICY "insert_own_feedback"
ON public.user_feedback FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_feedback_admin" ON public.user_feedback;
CREATE POLICY "update_feedback_admin"
ON public.user_feedback FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delete_feedback_admin" ON public.user_feedback;
CREATE POLICY "delete_feedback_admin"
ON public.user_feedback FOR DELETE
TO authenticated
USING (public.is_admin());

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_feedback_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  NEW.updated_at := now();
  RETURN NEW;
end;
$function$;

DROP TRIGGER IF EXISTS trg_feedback_set_updated_at ON public.user_feedback;
CREATE TRIGGER trg_feedback_set_updated_at
BEFORE UPDATE ON public.user_feedback
FOR EACH ROW EXECUTE FUNCTION public.set_feedback_updated_at();

REVOKE EXECUTE ON FUNCTION public.set_feedback_updated_at() FROM anon, authenticated;

-- Function: submit_user_feedback (user-facing)
CREATE OR REPLACE FUNCTION public.submit_user_feedback(
  p_type text,
  p_subject text,
  p_message text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_feedback_id uuid;
  v_recent_count int;
  v_admin record;
begin
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_type NOT IN ('feedback','suggestion','bug','report') THEN
    RAISE EXCEPTION 'Invalid feedback type';
  END IF;

  IF length(trim(COALESCE(p_message, ''))) < 5 THEN
    RAISE EXCEPTION 'Message must be at least 5 characters';
  END IF;

  IF length(trim(COALESCE(p_message, ''))) > 5000 THEN
    RAISE EXCEPTION 'Message must be at most 5000 characters';
  END IF;

  SELECT count(*) INTO v_recent_count
  FROM public.user_feedback
  WHERE user_id = v_user_id
    AND message = trim(p_message)
    AND created_at > now() - interval '2 minutes';

  IF v_recent_count > 0 THEN
    RAISE EXCEPTION 'You have already submitted this feedback recently. Please wait before submitting again.';
  END IF;

  INSERT INTO public.user_feedback (user_id, type, subject, message)
  VALUES (v_user_id, p_type, nullif(trim(p_subject), ''), trim(p_message))
  RETURNING id INTO v_feedback_id;

  FOR v_admin IN SELECT id FROM public.profiles WHERE is_admin = true LOOP
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
      VALUES (
        v_admin.id,
        'feedback_received',
        'New Feedback Received',
        COALESCE(nullif(trim(p_subject), ''), 'No subject') || ' (' || p_type || ')',
        '/admin/feedback/' || v_feedback_id::text,
        v_feedback_id
      );
      EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  RETURN v_feedback_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.submit_user_feedback(text, text, text) TO authenticated;

-- Function: admin_update_feedback_status (admin-facing)
CREATE OR REPLACE FUNCTION public.admin_update_feedback_status(
  p_feedback_id uuid,
  p_status text,
  p_admin_note text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_is_admin boolean;
  v_feedback public.user_feedback%rowtype;
  v_old_status text;
  v_status_label text;
begin
  SELECT public.is_admin() INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_status NOT IN ('open','reviewing','resolved','closed') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT * INTO v_feedback FROM public.user_feedback WHERE id = p_feedback_id;
  IF NOT found THEN
    RAISE EXCEPTION 'Feedback not found';
  END IF;

  v_old_status := v_feedback.status;

  UPDATE public.user_feedback
  SET status = p_status,
      admin_note = CASE WHEN p_admin_note IS NOT NULL THEN p_admin_note ELSE admin_note END
  WHERE id = p_feedback_id;

  IF v_old_status <> p_status THEN
    v_status_label := CASE p_status
      WHEN 'open' THEN 'Open' WHEN 'reviewing' THEN 'Reviewing'
      WHEN 'resolved' THEN 'Resolved' WHEN 'closed' THEN 'Closed' ELSE p_status END;

    BEGIN
      INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
      VALUES (
        v_feedback.user_id,
        'feedback_status_changed',
        'Feedback Status Updated',
        'Your feedback "' || COALESCE(v_feedback.subject, 'No subject') || '" is now ' || v_status_label,
        '/dashboard/feedback',
        v_feedback.id
      )
      ON CONFLICT (user_id, type, related_id) WHERE related_id IS NOT NULL DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
      INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
      VALUES (
        auth.uid(),
        'feedback_status_changed',
        'user_feedback',
        p_feedback_id,
        jsonb_build_object('old_status', v_old_status, 'new_status', p_status)
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_update_feedback_status(uuid, text, text) TO authenticated;
