/*
# Fix Notification Trigger Dedup Conflict with Unique Index

## Summary
Fixes a critical bug where the `notifications_dedup_idx` unique index on `(user_id, type, related_id)` 
would cause INSERT failures when the support ticket notification triggers tried to insert a second 
notification for the same ticket.

## Problem
1. `log_admin_ticket_reply` used `related_id = ticket_id` and a 5-minute dedup check. After 5 minutes, 
   the dedup check passes (v_existing = 0), but the INSERT fails with UNIQUE CONSTRAINT VIOLATION because 
   `notifications_dedup_idx` already has a row with `(user_id, 'support_reply', ticket_id)`. This crashes 
   the entire admin reply transaction, rolling back the message insert.
2. `log_ticket_status_change` used `related_id = ticket_id` with a `v_existing = 0` check. The first status 
   change creates a notification. Subsequent status changes find v_existing > 0 and skip the insert. The user 
   is only notified of the FIRST status change, never subsequent ones.

## Fix
1. `log_admin_ticket_reply`: Changed `related_id` from `ticket_id` to `NEW.id` (the message ID). Each admin 
   reply message now gets its own unique notification. Removed the 5-minute dedup check since each message 
   has a unique ID, making the unique index the dedup mechanism.
2. `log_ticket_status_change`: Changed `related_id` to `NULL` so the unique index does not apply. Each status 
   change now generates its own notification. Removed the `v_existing` check since there's no dedup index 
   for `related_id IS NULL` rows, and the trigger fires exactly once per UPDATE.

## Security
- No changes to RLS, function signatures, or grants
- Both functions remain SECURITY DEFINER with search_path = 'public'
- Internal notes still NEVER generate user notifications
- No changes to existing notification triggers or logic
*/

-- ============================================================
-- Fix log_admin_ticket_reply: use message ID as related_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_admin_ticket_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_ticket public.support_tickets%rowtype;
begin
  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = NEW.ticket_id;

  IF NEW.is_internal_note THEN
    -- Log internal note (NEVER notify user)
    INSERT INTO public.ticket_activity_log (ticket_id, actor_id, action)
    VALUES (NEW.ticket_id, NEW.sender_id, 'note_added');
  ELSE
    -- Log admin reply
    INSERT INTO public.ticket_activity_log (ticket_id, actor_id, action)
    VALUES (NEW.ticket_id, NEW.sender_id, 'replied');

    -- Notify ticket owner: use message ID as related_id for unique dedup
    -- Each admin reply message gets exactly one notification (unique index enforces this)
    INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
    VALUES (
      v_ticket.user_id,
      'support_reply',
      'Support Replied',
      'Admin has replied to your ticket "' || v_ticket.subject || '" (#' || v_ticket.ticket_number || ').',
      '/dashboard/support/' || v_ticket.id::text,
      NEW.id
    )
    ON CONFLICT (user_id, type, related_id) WHERE related_id IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
end;
$function$;

-- ============================================================
-- Fix log_ticket_status_change: use NULL related_id for multiple notifications
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_ticket_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.ticket_activity_log (ticket_id, actor_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'status_changed', OLD.status, NEW.status);

    -- Notify ticket owner of each status change (related_id = NULL allows multiple)
    INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
    VALUES (
      NEW.user_id,
      'ticket_status_changed',
      'Ticket Status Updated',
      'Your ticket "' || NEW.subject || '" (#' || NEW.ticket_number || ') is now ' || replace(NEW.status, '_', ' ') || '.',
      '/dashboard/support/' || NEW.id::text,
      NULL
    );
  END IF;
  RETURN NEW;
end;
$function$;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
