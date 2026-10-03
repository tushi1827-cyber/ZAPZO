/*
# Support Ticket Emails (support_reply, ticket_status_changed)

## Purpose
  - When an admin replies to a support ticket (non-internal), enqueue a
    support_reply email to the ticket owner.
  - When a ticket's status changes, enqueue a ticket_status_changed email
    to the ticket owner.

## Approach
Modify two existing trigger functions:
  1. log_admin_ticket_reply() — add support_reply email enqueue after the
     existing in-app notification insert (only for non-internal notes).
  2. log_ticket_status_change() — add ticket_status_changed email enqueue
     after the existing in-app notification insert.

No new triggers. CREATE OR REPLACE picks up the new logic.

## Changes

### 1. Modified function: log_admin_ticket_reply()
- All existing logic preserved (internal note check, activity log, in-app
  notification with ON CONFLICT dedup).
- After the notification insert, enqueues a support_reply email with
  user_name, ticket_subject, message_preview (truncated to 500 chars).
- dedup_key: 'support_email_reply:' || NEW.id (the message UUID).
- Wrapped in BEGIN/EXCEPTION WHEN OTHERS THEN NULL.

### 2. Modified function: log_ticket_status_change()
- All existing logic preserved (status distinct check, activity log,
  in-app notification).
- Activity log INSERT now uses RETURNING id to capture the activity ID.
- After the notification insert, enqueues a ticket_status_changed email
  with user_name, ticket_subject, ticket_status (human-readable label).
- dedup_key: 'ticket_email_status:' || v_activity_id (the activity log ID).
- Wrapped in BEGIN/EXCEPTION WHEN OTHERS THEN NULL.

### 3. No other changes
- No changes to email_queue, enqueue_email, process-email-queue,
  create_support_ticket, admin_reply_to_ticket, reply_to_ticket,
  admin_update_ticket_status, auth.users, RLS, or frontend code.

## Safety
- Both functions remain SECURITY DEFINER with search_path = 'public'.
- dedup keys guarantee one email per event.
- Exception isolation ensures email failures never block ticket operations.
*/

-- ──────────────────────────────────────────────────────────
-- 1. Modified: log_admin_ticket_reply()
-- ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_admin_ticket_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_ticket public.support_tickets%rowtype;
  v_user_name text;
begin
SELECT * INTO v_ticket FROM public.support_tickets WHERE id = NEW.ticket_id;

IF NEW.is_internal_note THEN
-- Internal note: log only, NEVER notify user
INSERT INTO public.ticket_activity_log (ticket_id, actor_id, action)
VALUES (NEW.ticket_id, NEW.sender_id, 'note_added');
ELSE
-- Admin reply: log + notify ticket owner
INSERT INTO public.ticket_activity_log (ticket_id, actor_id, action)
VALUES (NEW.ticket_id, NEW.sender_id, 'replied');

INSERT INTO public.notifications (user_id, type, title, body, link, related_id, is_read)
VALUES (
v_ticket.user_id,
'support_reply',
'Support Replied',
'ZAPZO Support replied to your ticket ' || v_ticket.ticket_number || '.',
'/dashboard/support/' || NEW.ticket_id::text,
NEW.id,
false
)
ON CONFLICT (user_id, type, related_id) WHERE related_id IS NOT NULL DO NOTHING;

-- Enqueue support reply email (exception-isolated)
select name into v_user_name from public.profiles where id = v_ticket.user_id;

begin
  perform public.enqueue_email(
    v_ticket.user_id,
    'support_reply',
    jsonb_build_object(
      'user_name', nullif(v_user_name, ''),
      'ticket_subject', v_ticket.subject,
      'message_preview', left(NEW.body, 500)
    ),
    'support_email_reply:' || NEW.id::text
  );
exception when others then
  null;
end;

END IF;

RETURN NEW;
end;
$function$;

-- ──────────────────────────────────────────────────────────
-- 2. Modified: log_ticket_status_change()
-- ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_ticket_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_activity_id uuid;
  v_user_name text;
  v_status_label text;
begin
IF NEW.status IS DISTINCT FROM OLD.status THEN

-- Existing activity log (now capturing ID for dedup key)
INSERT INTO public.ticket_activity_log (ticket_id, actor_id, action, old_value, new_value)
VALUES (NEW.id, auth.uid(), 'status_changed', OLD.status, NEW.status)
RETURNING id INTO v_activity_id;

-- Notify ticket owner of each status change (related_id = NULL allows multiple)
INSERT INTO public.notifications (user_id, type, title, body, link, related_id, is_read)
VALUES (
NEW.user_id,
'ticket_status_changed',
'Support Ticket Updated',
'Your support ticket ' || NEW.ticket_number || ' is now ' || NEW.status || '.',
'/dashboard/support/' || NEW.id::text,
NULL,
false
);

-- Enqueue ticket status changed email (exception-isolated)
select name into v_user_name from public.profiles where id = NEW.user_id;

v_status_label := CASE NEW.status
  WHEN 'open' THEN 'Open'
  WHEN 'in_progress' THEN 'In Progress'
  WHEN 'resolved' THEN 'Resolved'
  WHEN 'closed' THEN 'Closed'
  ELSE NEW.status
END;

begin
  perform public.enqueue_email(
    NEW.user_id,
    'ticket_status_changed',
    jsonb_build_object(
      'user_name', nullif(v_user_name, ''),
      'ticket_subject', NEW.subject,
      'ticket_status', v_status_label
    ),
    'ticket_email_status:' || v_activity_id::text
  );
exception when others then
  null;
end;

END IF;
RETURN NEW;
end;
$function$;
