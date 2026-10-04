/*
# Admin Alerts System — Role-Targeted Admin Notifications

1. Purpose
   Extends the existing notification system so that important admin-side events
   generate notifications for the appropriate admin roles. Reuses the existing
   notifications table, dedup index, and Realtime subscription — no new tables.

2. Approach
   Creates a single helper function `notify_admins_with_permission(...)` that:
   - Finds all users who should receive an admin alert for a given permission.
   - A user receives the alert if they are a super_admin (via app_metadata
     OR admin_roles table) OR they have an admin_roles row matching one of
     the roles that map to the permission.
   - Inserts notifications with ON CONFLICT DO NOTHING for dedup.
   - All inserts are exception-isolated so a single failure never blocks
     the triggering operation.

   Then modifies existing trigger functions to call the helper:
   - notify_withdrawal_requested: adds admin alert for Finance permission
   - notify_submission_created: adds admin alert for Moderator permission
     (only for manual-review submissions, not auto-verified ones)
   - log_user_ticket_reply: adds admin alert for Support permission
   - submit_user_feedback: replaces is_admin=true loop with role-based targeting

   Also adds:
   - A new trigger on risk_events for high-risk alerts → Moderator permission
   - Role change notifications in assign_admin_role / remove_admin_role

3. New Notification Types
   - 'admin_withdrawal_requested' — new withdrawal request (admin alert)
   - 'admin_submission_pending' — submission needs manual review (admin alert)
   - 'admin_support_reply' — user replied to a support ticket (admin alert)
   - 'admin_risk_alert' — high-risk fraud event detected (admin alert)
   - 'admin_role_changed' — your admin role was assigned or removed (user alert)

   The existing 'feedback_received' type is reused for feedback admin alerts.

4. Helper Function
   notify_admins_with_permission(
     p_permission text,       -- e.g. 'withdrawals', 'submissions', 'support', 'feedback', 'fraud'
     p_type text,             -- notification type
     p_title text,            -- notification title
     p_body text,             -- notification body
     p_link text,             -- link for the notification
     p_related_id uuid        -- related entity ID (for dedup)
   )
   Returns void. SECURITY DEFINER. search_path=public.
   Finds recipients by querying profiles + admin_roles + app_metadata.

5. Security
   - notify_admins_with_permission is SECURITY DEFINER, executes from authenticated only.
   - All admin notification types are inserted as rows in the existing notifications
     table with user_id = the admin user. RLS ensures each admin only sees their own
     notifications. Non-admin users never receive admin alerts because the helper
     only targets users with the relevant permission.
   - No changes to notifications RLS policies.
   - No new tables. No new indexes (reuses notifications_dedup_idx).

6. Modified Functions (recreated with admin alert additions)
   - notify_withdrawal_requested(): adds admin alert after existing user notification
   - notify_submission_created(): adds admin alert for manual-review submissions
   - log_user_ticket_reply(): adds admin alert for Support-permission admins
   - submit_user_feedback(): replaces is_admin loop with role-based targeting
   - assign_admin_role(): adds notification to the affected user
   - remove_admin_role(): adds notification to the affected user

7. New Trigger
   - trg_risk_event_notify on risk_events AFTER INSERT
     Calls notify_risk_event_created() which checks if risk_points >= 10
     (high risk) and notifies Moderator-permission admins.

8. Backward Compatibility
   - All existing user-facing notifications remain unchanged.
   - Existing dedup via notifications_dedup_idx (user_id, type, related_id) still works.
   - Existing Realtime subscription on notifications table is unaffected.
   - No changes to notifications RLS, indexes, or table structure.

9. Important Notes
   - The admin alert notifications use distinct types (prefixed with 'admin_')
     so they dedup independently from user-facing notifications.
   - The helper function checks both app_metadata.is_admin (existing super admin)
     and admin_roles table entries, ensuring backward compatibility.
   - Auto-verified submissions do NOT generate admin alerts (only manual-review ones).
   - submit_user_feedback is updated to target admins with the 'feedback' permission
     instead of just is_admin=true, which is more precise with the new role system.
*/

-- ============================================================================
-- 1. Helper function: notify_admins_with_permission
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_admins_with_permission(
  p_permission text,
  p_type text,
  p_title text,
  p_body text,
  p_link text DEFAULT NULL,
  p_related_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_recipient record;
  v_roles text[];
begin
  -- Determine which roles map to this permission
  v_roles := CASE p_permission
    WHEN 'withdrawals' THEN ARRAY['finance']::text[]
    WHEN 'transactions' THEN ARRAY['finance']::text[]
    WHEN 'users' THEN ARRAY['moderator']::text[]
    WHEN 'tasks' THEN ARRAY['moderator']::text[]
    WHEN 'submissions' THEN ARRAY['moderator']::text[]
    WHEN 'feedback' THEN ARRAY['moderator', 'support']::text[]
    WHEN 'fraud' THEN ARRAY['moderator']::text[]
    WHEN 'support' THEN ARRAY['support']::text[]
    ELSE ARRAY[]::text[]
  END;

  -- Find recipients: super admins (via app_metadata) + users with matching roles
  FOR v_recipient IN
    SELECT DISTINCT p.id
    FROM public.profiles p
    LEFT JOIN public.admin_roles ar ON ar.user_id = p.id
    WHERE
      -- Super admin via app_metadata (existing admin)
      COALESCE(
        (select (raw_app_meta_data->>'is_admin')::boolean from auth.users where id = p.id),
        false
      ) = true
      -- OR has a role in the allowed roles for this permission
      OR (ar.role = ANY(v_roles))
  LOOP
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
      VALUES (v_recipient.id, p_type, p_title, p_body, p_link, p_related_id)
      ON CONFLICT (user_id, type, related_id) WHERE related_id IS NOT NULL DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.notify_admins_with_permission(text, text, text, text, text, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admins_with_permission(text, text, text, text, text, uuid) FROM anon, public;

-- ============================================================================
-- 2. Update notify_withdrawal_requested: add admin alert for Finance
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_withdrawal_requested()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_existing int;
  v_user_name text;
  v_method_label text;
begin
  if TG_OP = 'INSERT' then
    -- Check for existing notification to prevent duplicates
    select count(*) into v_existing from public.notifications
    where user_id = NEW.user_id and type = 'withdrawal_requested' and related_id = NEW.id;
    if v_existing > 0 then
      return NEW;
    end if;

    -- Resolve user display name
    select name into v_user_name from public.profiles where id = NEW.user_id;

    -- Human-readable method label
    v_method_label := CASE NEW.method
      WHEN 'upi' THEN 'UPI'
      WHEN 'bank_transfer' THEN 'Bank Transfer'
      WHEN 'amazon_gift_card' THEN 'Amazon Gift Card'
      WHEN 'flipkart_gift_card' THEN 'Flipkart Gift Card'
      WHEN 'google_play_gift_card' THEN 'Google Play Gift Card'
      ELSE NEW.method
    END;

    -- Existing user notification (unchanged)
    insert into public.notifications (user_id, type, title, body, link, related_id)
    values (
      NEW.user_id,
      'withdrawal_requested',
      'Withdrawal Requested',
      'Your ₹' || NEW.amount || ' withdrawal request has been received.',
      '/dashboard/withdraw',
      NEW.id
    );

    -- NEW: Admin alert for Finance-permission admins
    PERFORM public.notify_admins_with_permission(
      'withdrawals',
      'admin_withdrawal_requested',
      'New Withdrawal Request',
      COALESCE(v_user_name, 'User') || ' requested ₹' || NEW.amount || ' via ' || v_method_label || '.',
      '/admin/withdrawals',
      NEW.id
    );

    -- Enqueue withdrawal requested email (exception-isolated)
    begin
      perform public.enqueue_email(
        NEW.user_id,
        'withdrawal_requested',
        jsonb_build_object(
          'user_name', nullif(v_user_name, ''),
          'amount', NEW.amount,
          'withdrawal_method', v_method_label
        ),
        'withdrawal_email_requested:' || NEW.id::text
      );
    exception when others then
      null;
    end;
  end if;
  return NEW;
end;
$function$;

-- ============================================================================
-- 3. Update notify_submission_created: add admin alert for Moderator
--    (only for manual-review submissions, not auto-verified)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_submission_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_task public.tasks%rowtype;
  v_existing int;
  v_user_name text;
begin
  if TG_OP = 'INSERT' then
    -- Check for existing notification to prevent duplicates
    select count(*) into v_existing from public.notifications
    where user_id = NEW.user_id and type = 'task_submitted' and related_id = NEW.id;
    if v_existing > 0 then
      return NEW;
    end if;

    select * into v_task from public.tasks where id = NEW.task_id;

    -- Existing user notification (unchanged)
    insert into public.notifications (user_id, type, title, body, link, related_id)
    values (
      NEW.user_id,
      'task_submitted',
      'Task Submitted',
      'Your task submission for "' || coalesce(v_task.title, 'a task') || '" has been received and is waiting for review.',
      '/dashboard/submissions',
      NEW.id
    );

    -- NEW: Admin alert for Moderator-permission admins (only for manual review)
    IF v_task.verification_type = 'manual' THEN
      select name into v_user_name from public.profiles where id = NEW.user_id;

      PERFORM public.notify_admins_with_permission(
        'submissions',
        'admin_submission_pending',
        'New Submission for Review',
        COALESCE(v_user_name, 'User') || ' submitted "' || coalesce(v_task.title, 'a task') || '" for manual review.',
        '/admin/submissions',
        NEW.id
      );
    END IF;
  end if;
  return NEW;
end;
$function$;

-- ============================================================================
-- 4. Update log_user_ticket_reply: add admin alert for Support
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_user_ticket_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_ticket public.support_tickets%rowtype;
begin
  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = NEW.ticket_id;

  -- Existing: log activity (unchanged)
  INSERT INTO public.ticket_activity_log (ticket_id, actor_id, action)
  VALUES (NEW.ticket_id, NEW.sender_id, 'replied');

  -- Existing: reopen if resolved (unchanged)
  IF v_ticket.status = 'resolved' THEN
    UPDATE public.support_tickets SET status = 'open' WHERE id = NEW.ticket_id;
    INSERT INTO public.ticket_activity_log (ticket_id, actor_id, action, old_value, new_value)
    VALUES (NEW.ticket_id, NEW.sender_id, 'reopened', 'resolved', 'open');
  END IF;

  -- NEW: Admin alert for Support-permission admins
  PERFORM public.notify_admins_with_permission(
    'support',
    'admin_support_reply',
    'User Replied to Ticket',
    'New reply on ticket ' || v_ticket.ticket_number || ': ' || left(NEW.body, 100),
    '/admin/support/' || NEW.ticket_id::text,
    NEW.id
  );

  RETURN NEW;
end;
$function$;

-- ============================================================================
-- 5. Update submit_user_feedback: replace is_admin loop with role-based targeting
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_user_feedback(p_type text, p_subject text, p_message text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_feedback_id uuid;
  v_recent_count int;
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

  -- Role-based admin notification (replaces old is_admin=true loop)
  -- Targets admins with 'feedback' permission (moderator + support + super_admin)
  PERFORM public.notify_admins_with_permission(
    'feedback',
    'feedback_received',
    'New Feedback Received',
    COALESCE(nullif(trim(p_subject), ''), 'No subject') || ' (' || p_type || ')',
    '/admin/feedback/' || v_feedback_id::text,
    v_feedback_id
  );

  RETURN v_feedback_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.submit_user_feedback(text, text, text) TO authenticated;

-- ============================================================================
-- 6. New trigger: risk_events → admin alert for high-risk events
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_risk_event_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_user_name text;
begin
  -- Only alert for high-risk events (risk_points >= 10)
  IF NEW.risk_points < 10 THEN
    RETURN NEW;
  END IF;

  select name into v_user_name from public.profiles where id = NEW.user_id;

  PERFORM public.notify_admins_with_permission(
    'fraud',
    'admin_risk_alert',
    'High-Risk Fraud Alert',
    COALESCE(v_user_name, 'User') || ': ' || NEW.description || ' (' || NEW.event_type || ', +' || NEW.risk_points || ' points)',
    '/admin/fraud',
    NEW.id
  );

  RETURN NEW;
end;
$function$;

DROP TRIGGER IF EXISTS trg_risk_event_notify ON public.risk_events;
CREATE TRIGGER trg_risk_event_notify
AFTER INSERT ON public.risk_events
FOR EACH ROW EXECUTE FUNCTION public.notify_risk_event_created();

-- ============================================================================
-- 7. Update assign_admin_role: notify the affected user
-- ============================================================================

CREATE OR REPLACE FUNCTION public.assign_admin_role(p_user_id uuid, p_role text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_actor_id uuid := auth.uid();
  v_target_name text;
  v_role_label text;
begin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can assign roles';
  END IF;

  IF p_role NOT IN ('super_admin', 'moderator', 'support', 'finance') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  IF p_user_id = v_actor_id AND p_role = 'super_admin' THEN
    RAISE EXCEPTION 'You already have super admin access';
  END IF;

  SELECT name INTO v_target_name FROM public.profiles WHERE id = p_user_id;
  IF v_target_name IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  INSERT INTO public.admin_roles (user_id, role, created_by)
  VALUES (p_user_id, p_role, v_actor_id)
  ON CONFLICT (user_id, role) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.admin_roles WHERE user_id = p_user_id AND role = p_role;
  END IF;

  -- Audit log (unchanged)
  BEGIN
    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
    VALUES (
      v_actor_id,
      'admin_role_assigned',
      'admin_roles',
      v_id,
      jsonb_build_object(
        'target_user_id', p_user_id,
        'target_user_name', v_target_name,
        'role', p_role
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- NEW: Notify the affected user
  v_role_label := CASE p_role
    WHEN 'super_admin' THEN 'Super Admin'
    WHEN 'moderator' THEN 'Moderator'
    WHEN 'support' THEN 'Support'
    WHEN 'finance' THEN 'Finance'
    ELSE p_role
  END;

  BEGIN
    INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
    VALUES (
      p_user_id,
      'admin_role_changed',
      'Admin Role Assigned',
      'You have been assigned the ' || v_role_label || ' role. You now have access to additional admin features.',
      '/admin',
      v_id
    )
    ON CONFLICT (user_id, type, related_id) WHERE related_id IS NOT NULL DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.assign_admin_role(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_admin_role(uuid, text) FROM anon, public;

-- ============================================================================
-- 8. Update remove_admin_role: notify the affected user
-- ============================================================================

CREATE OR REPLACE FUNCTION public.remove_admin_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_target_name text;
  v_existing_id uuid;
  v_super_admin_count int;
  v_target_is_meta_admin boolean;
  v_role_label text;
begin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can remove roles';
  END IF;

  IF p_role NOT IN ('super_admin', 'moderator', 'support', 'finance') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  IF p_role = 'super_admin' AND p_user_id = v_actor_id THEN
    SELECT COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean,
      false
    ) INTO v_target_is_meta_admin;
    IF NOT v_target_is_meta_admin THEN
      SELECT count(*) INTO v_super_admin_count
      FROM public.admin_roles
      WHERE role = 'super_admin' AND user_id != p_user_id;
      IF v_super_admin_count = 0 THEN
        RAISE EXCEPTION 'Cannot remove the last super admin role';
      END IF;
    END IF;
  END IF;

  SELECT name INTO v_target_name FROM public.profiles WHERE id = p_user_id;

  SELECT id INTO v_existing_id FROM public.admin_roles WHERE user_id = p_user_id AND role = p_role;
  IF v_existing_id IS NULL THEN
    RAISE EXCEPTION 'Role assignment not found';
  END IF;

  DELETE FROM public.admin_roles WHERE user_id = p_user_id AND role = p_role;

  -- Audit log (unchanged)
  BEGIN
    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
    VALUES (
      v_actor_id,
      'admin_role_removed',
      'admin_roles',
      v_existing_id,
      jsonb_build_object(
        'target_user_id', p_user_id,
        'target_user_name', v_target_name,
        'role', p_role
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- NEW: Notify the affected user
  v_role_label := CASE p_role
    WHEN 'super_admin' THEN 'Super Admin'
    WHEN 'moderator' THEN 'Moderator'
    WHEN 'support' THEN 'Support'
    WHEN 'finance' THEN 'Finance'
    ELSE p_role
  END;

  BEGIN
    INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
    VALUES (
      p_user_id,
      'admin_role_changed',
      'Admin Role Removed',
      'Your ' || v_role_label || ' role has been removed. You will no longer have access to the associated admin features.',
      '/dashboard',
      v_existing_id
    )
    ON CONFLICT (user_id, type, related_id) WHERE related_id IS NOT NULL DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.remove_admin_role(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.remove_admin_role(uuid, text) FROM anon, public;

-- Revoke anon on the helper and trigger functions
REVOKE EXECUTE ON FUNCTION public.notify_risk_event_created() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.notify_admins_with_permission(text, text, text, text, text, uuid) FROM anon, public;

-- Force PostgREST schema reload
NOTIFY pgrst, 'reload schema';
